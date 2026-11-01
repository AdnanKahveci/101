import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  applyAction,
  createMatch,
  getPlayerView,
  teamOf,
  type GameAction,
  type GameEvent,
  type GameState,
  type GameView,
  type HandResult,
  type RuleProfile,
  type Seat,
} from "@/engine";
import { getDb, schema, type Db } from "./db";
import { AppError, fail } from "./errors";
import { getInfra, withLock } from "./infra";
import { matchChannel, onlineMap, publish, roomChannel } from "./channels";
import type { AuthUser } from "./auth";
import type { GameCommand } from "./validation";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const stateKey = (matchId: string) => `okey:state:${matchId}`;
const STATE_TTL = 6 * 3600_000;

export interface ClientGameView extends GameView {
  presence: Record<number, boolean>;
  avatars: Record<number, string>;
  roomCode: string;
}

// ------------------------------------------------------------ Maç oluşturma

export async function createMatchInTx(
  tx: Tx,
  room: { id: string },
  seated: { userId: string; seat: Seat; displayName: string }[],
  rules: RuleProfile,
): Promise<GameState> {
  const seedSecret = randomBytes(32).toString("base64url");
  const [m] = await tx
    .insert(schema.matches)
    .values({ roomId: room.id, rules, teamMode: rules.teamMode, totalHands: rules.totalHands, seedSecret })
    .returning({ id: schema.matches.id });
  const state = createMatch({
    matchId: m.id,
    roomId: room.id,
    rules,
    players: seated.map((p) => ({ seat: p.seat, userId: p.userId, displayName: p.displayName })),
    seed: seedSecret,
    now: Date.now(),
  });
  await tx.insert(schema.matchPlayers).values(
    seated.map((p) => ({
      matchId: m.id,
      seat: p.seat,
      userId: p.userId,
      displayName: p.displayName,
      team: rules.teamMode ? teamOf(p.seat) : null,
    })),
  );
  if (rules.teamMode) {
    await tx.insert(schema.matchTeams).values([
      { matchId: m.id, team: 0, name: "Alt-Üst" },
      { matchId: m.id, team: 1, name: "Sağ-Sol" },
    ]);
  }
  await tx.insert(schema.gameSnapshots).values({ matchId: m.id, version: state.version, state });
  await tx.insert(schema.gameEvents).values({
    matchId: m.id,
    version: state.version,
    seq: 0,
    type: "MATCH_STARTED",
    seat: null,
    payload: { firstPlayer: state.hand.firstPlayer, dealer: state.hand.dealer },
  });
  return state;
}

// ------------------------------------------------------------- State yükleme

export async function loadState(matchId: string, opts: { fresh?: boolean } = {}): Promise<GameState> {
  const infra = await getInfra();
  if (!opts.fresh) {
    const cached = await infra.get(stateKey(matchId));
    if (cached) return JSON.parse(cached) as GameState;
  }
  const db = await getDb();
  const [row] = await db.select().from(schema.gameSnapshots).where(eq(schema.gameSnapshots.matchId, matchId)).limit(1);
  if (!row) fail("NOT_FOUND", "Maç bulunamadı.");
  const state = row!.state as GameState;
  await infra.set(stateKey(matchId), JSON.stringify(state), STATE_TTL);
  return state;
}

async function matchMeta(matchId: string) {
  const db = await getDb();
  const [m] = await db
    .select({ id: schema.matches.id, roomId: schema.matches.roomId, seedSecret: schema.matches.seedSecret, status: schema.matches.status })
    .from(schema.matches)
    .where(eq(schema.matches.id, matchId))
    .limit(1);
  if (!m) fail("NOT_FOUND", "Maç bulunamadı.");
  return m!;
}

export function seatOf(state: GameState, userId: string): Seat | null {
  return state.players.find((p) => p.userId === userId)?.seat ?? null;
}

// --------------------------------------------------------------- Komut işleme

export interface CommandResult {
  ok: true;
  version: number;
  duplicate?: boolean;
}

/**
 * Sunucu otoriteli komut işleme hattı:
 * kimlik → üyelik → tekrar kontrolü → kilit → versiyon → kural doğrulama → atomik yazma → olay kaydı → yayın.
 */
export async function processCommand(user: AuthUser | { id: string; system: true }, cmd: GameCommand): Promise<CommandResult> {
  const infra = await getInfra();
  const isSystem = "system" in user;
  if (!isSystem) {
    const n = await infra.incrWindow(`okey:rl:cmd:${user.id}`, 10_000);
    if (n > Number(process.env.OKEY_CMD_RATE_LIMIT ?? 40)) fail("RATE_LIMITED", "Çok hızlı komut gönderiyorsunuz.");
  }
  const db = await getDb();
  const meta = await matchMeta(cmd.matchId);

  const dup = async () => {
    const [p] = await db
      .select()
      .from(schema.processedCommands)
      .where(and(eq(schema.processedCommands.userId, user.id), eq(schema.processedCommands.commandId, cmd.commandId)))
      .limit(1);
    return p;
  };
  const existing = await dup();
  if (existing) return { ok: true, version: existing.resultVersion, duplicate: true };

  return withLock(infra, `okey:lock:match:${cmd.matchId}`, async () => {
    const again = await dup();
    if (again) return { ok: true as const, version: again.resultVersion, duplicate: true };

    let state = await loadState(cmd.matchId);
    let seat: Seat | null;
    if (isSystem) {
      seat = state.phase === "playing" ? state.hand.currentTurn : 0;
    } else {
      seat = seatOf(state, user.id);
      if (seat === null) fail("FORBIDDEN", "Bu maçta oyuncu değilsiniz.");
    }
    // "Hazırım" sıradan bağımsız ve idempotenttir; versiyon yarışına takılmaması için versiyon kontrolü atlanır (kural doğrulaması sürer).
    const versionInsensitive = cmd.action.type === "READY_NEXT_HAND";
    if (!versionInsensitive && cmd.expectedVersion !== state.version) {
      // Önbellek eski olabilir: veritabanından teyit et.
      state = await loadState(cmd.matchId, { fresh: true });
      if (cmd.expectedVersion !== state.version) {
        throw new AppError("STALE_VERSION", `Oyun durumu güncel değil (beklenen ${cmd.expectedVersion}, güncel ${state.version}).`);
      }
    }
    const result = applyAction(state, cmd.action as GameAction, seat!, { now: Date.now(), seed: meta.seedSecret });
    if (!result.ok) throw new AppError("INVALID_ACTION", result.error);
    const next = result.value.state;

    try {
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(schema.gameSnapshots)
          .set({ version: next.version, state: next, updatedAt: new Date() })
          .where(and(eq(schema.gameSnapshots.matchId, cmd.matchId), eq(schema.gameSnapshots.version, state.version)))
          .returning({ v: schema.gameSnapshots.version });
        if (updated.length === 0) throw new AppError("STALE_VERSION", "Eşzamanlı hamle algılandı; durum yenileniyor.");
        if (result.value.events.length) {
          await tx.insert(schema.gameEvents).values(
            result.value.events.map((e, i) => ({
              matchId: cmd.matchId,
              version: next.version,
              seq: i,
              type: e.type,
              seat: e.seat,
              payload: publicEventPayload(e),
            })),
          );
        }
        await tx.insert(schema.processedCommands).values({
          userId: user.id,
          commandId: cmd.commandId,
          matchId: cmd.matchId,
          resultVersion: next.version,
        });
        await persistResults(tx, state, next);
      });
    } catch (e) {
      await infra.del(stateKey(cmd.matchId));
      if (e instanceof AppError) throw e;
      // Aynı komut kimliği eşzamanlı işlendiyse (PK çakışması) tekrar olarak raporla.
      const d = await dup();
      if (d) return { ok: true as const, version: d.resultVersion, duplicate: true };
      throw e;
    }
    await infra.set(stateKey(cmd.matchId), JSON.stringify(next), STATE_TTL);
    await publish(matchChannel(cmd.matchId), { type: "match", matchId: cmd.matchId, version: next.version });
    if (next.phase === "finished" && state.phase !== "finished") {
      await publish(roomChannel(meta.roomId), { type: "room", roomId: meta.roomId });
    }
    return { ok: true as const, version: next.version };
  });
}

/** Olay kayıtlarına gizli taş bilgisi yazılmaz (yalnızca kamuya açık olaylar taş içerir). */
function publicEventPayload(e: GameEvent): Record<string, unknown> {
  const hiddenTypes = new Set(["TILE_DRAWN"]);
  if (hiddenTypes.has(e.type)) return { remaining: e.data.remaining };
  return e.data;
}

/** El ve maç sonuçlarını kalıcı tablolara yazar, istatistikleri günceller. */
async function persistResults(tx: Tx, before: GameState, after: GameState) {
  const newResults = after.handResults.slice(before.handResults.length);
  for (const res of newResults) await persistHand(tx, after, res);
  if (after.phase === "finished" && before.phase !== "finished") await persistMatchEnd(tx, after);
}

async function persistHand(tx: Tx, state: GameState, res: HandResult) {
  const [hand] = await tx
    .insert(schema.hands)
    .values({
      matchId: state.matchId,
      handNumber: res.handNumber,
      dealer: res.dealer,
      firstPlayer: res.firstPlayer,
      indicator: res.indicator,
      okey: res.okey,
      finisherSeat: res.finisher,
      finishType: res.finishType,
      multiplier: res.multiplier,
      result: res,
    })
    .returning({ id: schema.hands.id });
  const idx = state.handResults.indexOf(res);
  const cumulative = (seat: Seat) => state.handResults.slice(0, idx + 1).reduce((s, h) => s + h.playerScores[seat], 0);
  await tx.insert(schema.handPlayerResults).values(
    state.players.map((p) => ({
      handId: hand.id,
      seat: p.seat,
      userId: p.userId,
      score: res.playerScores[p.seat],
      cumulative: cumulative(p.seat),
      opened: state.hand.opened[p.seat]?.kind ?? null,
    })),
  );
  for (const p of state.players) {
    const finisher = res.finisher === p.seat;
    await tx
      .update(schema.playerStatistics)
      .set({
        handsPlayed: sql`${schema.playerStatistics.handsPlayed} + 1`,
        normalFinishes: sql`${schema.playerStatistics.normalFinishes} + ${finisher && res.finishType === "normal" ? 1 : 0}`,
        jokerFinishes: sql`${schema.playerStatistics.jokerFinishes} + ${finisher && (res.finishType === "joker" || res.finishType === "handJoker") ? 1 : 0}`,
        pairFinishes: sql`${schema.playerStatistics.pairFinishes} + ${finisher && res.finishType === "pairs" ? 1 : 0}`,
        handFinishes: sql`${schema.playerStatistics.handFinishes} + ${finisher && (res.finishType === "hand" || res.finishType === "handJoker") ? 1 : 0}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.playerStatistics.userId, p.userId));
  }
}

async function persistMatchEnd(tx: Tx, state: GameState) {
  const winners = new Set(state.winner?.seats ?? []);
  await tx
    .update(schema.matches)
    .set({ status: "finished", finishedAt: new Date(), winnerTeam: state.winner?.team ?? null })
    .where(eq(schema.matches.id, state.matchId));
  for (const p of state.players) {
    const won = winners.has(p.seat) && winners.size < 4;
    await tx
      .update(schema.matchPlayers)
      .set({ finalScore: state.totals[p.seat], isWinner: won })
      .where(and(eq(schema.matchPlayers.matchId, state.matchId), eq(schema.matchPlayers.seat, p.seat)));
    await tx
      .update(schema.playerStatistics)
      .set({
        matchesPlayed: sql`${schema.playerStatistics.matchesPlayed} + 1`,
        matchesWon: sql`${schema.playerStatistics.matchesWon} + ${won ? 1 : 0}`,
        matchesLost: sql`${schema.playerStatistics.matchesLost} + ${won ? 0 : 1}`,
        teamMatchesPlayed: sql`${schema.playerStatistics.teamMatchesPlayed} + ${state.rules.teamMode ? 1 : 0}`,
        teamMatchesWon: sql`${schema.playerStatistics.teamMatchesWon} + ${state.rules.teamMode && won ? 1 : 0}`,
        totalScore: sql`${schema.playerStatistics.totalScore} + ${state.totals[p.seat]}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.playerStatistics.userId, p.userId));
  }
  if (state.rules.teamMode) {
    for (const team of [0, 1] as const) {
      const total = state.totals[team as Seat] + state.totals[(team + 2) as Seat];
      await tx
        .update(schema.matchTeams)
        .set({ finalScore: total, isWinner: state.winner?.team === team })
        .where(and(eq(schema.matchTeams.matchId, state.matchId), eq(schema.matchTeams.team, team)));
    }
  }
  // Oda lobiye döner; oyuncular koltuklarını korur, aynı odada yeni maç başlatabilir.
  await tx
    .update(schema.rooms)
    .set({ status: "lobby", updatedAt: new Date() })
    .where(eq(schema.rooms.id, state.roomId));
  await tx.update(schema.roomMembers).set({ ready: false }).where(eq(schema.roomMembers.roomId, state.roomId));
}

// ---------------------------------------------------------------- Görünümler

export async function viewFor(userId: string, matchId: string): Promise<ClientGameView> {
  const state = await loadState(matchId);
  const seat = seatOf(state, userId);
  const db = await getDb();
  if (seat === null) {
    // Seyirci: odanın üyesi olmalı ve oda seyirciye izin vermeli.
    const [row] = await db
      .select({ settings: schema.rooms.settings })
      .from(schema.roomMembers)
      .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomMembers.roomId))
      .where(and(eq(schema.roomMembers.roomId, state.roomId), eq(schema.roomMembers.userId, userId)))
      .limit(1);
    if (!row) fail("FORBIDDEN", "Bu maçı görüntüleme yetkiniz yok.");
    if ((row!.settings as { allowSpectators?: boolean }).allowSpectators === false) fail("FORBIDDEN", "Bu odada seyirci izni kapalı.");
  }
  return decorate(state, seat);
}

async function decorate(state: GameState, seat: Seat | null): Promise<ClientGameView> {
  const db = await getDb();
  const ids = state.players.map((p) => p.userId);
  const online = await onlineMap(ids);
  const avatarsRows = await db
    .select({ id: schema.users.id, avatar: schema.users.avatar })
    .from(schema.users)
    .where(inArray(schema.users.id, ids));
  const [room] = await db.select({ code: schema.rooms.code }).from(schema.rooms).where(eq(schema.rooms.id, state.roomId)).limit(1);
  const view = getPlayerView(state, seat);
  return {
    ...view,
    presence: Object.fromEntries(state.players.map((p) => [p.seat, online[p.userId] ?? false])),
    avatars: Object.fromEntries(state.players.map((p) => [p.seat, avatarsRows.find((a) => a.id === p.userId)?.avatar ?? "cay"])),
    roomCode: room?.code ?? "",
  };
}

/**
 * Süre aşımı kontrolü. Kalıcı bir zamanlayıcı sunucusu olmadığı için (serverless),
 * bağlı istemcilerin kalp atışlarıyla tetiklenir. Komut kimliği versiyona bağlıdır: iki instance aynı anda tetiklese de tek kez uygulanır.
 */
export async function checkTimeout(matchId: string): Promise<boolean> {
  const state = await loadState(matchId);
  const deadline = state.hand.turnDeadline;
  if (state.phase === "finished" || deadline === null || Date.now() < deadline + 1500) return false;
  if (state.phase === "playing" && state.rules.timeoutPolicy !== "autoPlay") return false;
  try {
    await processCommand(
      { id: "00000000-0000-0000-0000-000000000000", system: true },
      { commandId: `timeout-${matchId}-${state.version}`, matchId, expectedVersion: state.version, action: { type: "TIMEOUT" } },
    );
    return true;
  } catch (e) {
    if (e instanceof AppError && (e.code === "STALE_VERSION" || e.code === "INVALID_ACTION")) return false;
    throw e;
  }
}
