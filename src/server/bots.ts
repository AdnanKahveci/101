/**
 * Bot oyuncular: oda sahibi boş koltukları botlarla doldurup tek başına (veya eksik kişiyle) oynayabilir.
 * Botlar normal kullanıcı gibi kaydedilir (kullanıcı adı "bot_" ile başlar) ve hamlelerini aynı sunucu
 * otoriteli komut hattından (processCommand) gönderir; yalnızca kendi görünümlerini (kendi taşları +
 * masadaki açık bilgi) kullanırlar.
 */
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNotNull, like } from "drizzle-orm";
import { getPlayerView, type GameAction, type Seat } from "@/engine";
import { planBotAction } from "@/engine/bot-brain";
import { getDb, schema } from "./db";
import { AppError, fail } from "./errors";
import { touchPresence } from "./channels";
import { loadState, processCommand } from "./game-service";
import type { AuthUser } from "./auth";

export const BOT_PREFIX = "bot_";
export const isBotUsername = (u: string) => u.startsWith(BOT_PREFIX);

const BOT_NAMES = ["Hasan Amca", "Kemal Usta", "Nuri Bey", "Rıza Dayı", "Sabri Abi", "Cemil Efendi", "Halil Reis", "Şükrü Hoca"];
const BOT_AVATARS = ["kahve", "simit", "kedi", "zeytin"];
const BOT_PRESENCE_TTL = 30 * 86400_000;

/** Odadaki boş koltukları hazır botlarla doldurur (yalnızca oda sahibi, lobide). */
export async function fillWithBots(roomId: string, existingNames: string[]): Promise<number> {
  const db = await getDb();
  const seated = await db
    .select({ seat: schema.roomMembers.seat })
    .from(schema.roomMembers)
    .where(and(eq(schema.roomMembers.roomId, roomId), isNotNull(schema.roomMembers.seat)));
  const taken = new Set(seated.map((s) => s.seat));
  const names = BOT_NAMES.filter((n) => !existingNames.includes(n));
  let added = 0;
  for (const seat of [0, 1, 2, 3]) {
    if (taken.has(seat)) continue;
    const name = names[added % names.length] ?? `Bot ${seat + 1}`;
    const [user] = await db
      .insert(schema.users)
      .values({ username: `${BOT_PREFIX}${randomBytes(5).toString("hex")}`, displayName: name, isGuest: true, avatar: BOT_AVATARS[added % BOT_AVATARS.length] })
      .returning();
    await db.insert(schema.playerStatistics).values({ userId: user.id });
    await db.insert(schema.userPreferences).values({ userId: user.id });
    await db.insert(schema.roomMembers).values({ roomId, userId: user.id, role: "player", seat, ready: true });
    await touchPresence(user.id, BOT_PRESENCE_TTL);
    added++;
  }
  if (added === 0) fail("BAD_REQUEST", "Boş koltuk yok.");
  return added;
}

/** Verilen kullanıcı kimliklerinden hangilerinin bot olduğu. */
export async function botIdsAmong(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(inArray(schema.users.id, userIds), like(schema.users.username, `${BOT_PREFIX}%`)));
  return new Set(rows.map((r) => r.id));
}

const running = new Set<string>();
const botCache = new Map<string, Set<string>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sıra bir bottaysa (veya el sonu "hazır" bekleniyorsa) bot hamlelerini oynatır; sıra insana gelince durur.
 * Aynı süreçte aynı maç için tek döngü çalışır; çok instance'lı ortamda versiyon kontrolü çifte hamleyi engeller.
 */
export async function runBots(matchId: string, opts: { delayMs?: number } = {}): Promise<void> {
  if (running.has(matchId)) return;
  running.add(matchId);
  const delay = opts.delayMs ?? Number(process.env.OKEY_BOT_DELAY_MS ?? 900);
  try {
    let bots = botCache.get(matchId);
    if (!bots) {
      const st = await loadState(matchId);
      bots = await botIdsAmong(st.players.map((p) => p.userId));
      botCache.set(matchId, bots);
    }
    if (bots.size === 0) return;
    const tried = new Map<string, Set<string>>(); // versiyon:koltuk → denenmiş aksiyonlar
    for (let guard = 0; guard < 400; guard++) {
      const state = await loadState(matchId);
      if (state.phase === "finished") return;
      let actor: { seat: Seat; userId: string } | null = null;
      let action: GameAction | null = null;
      if (state.phase === "handResult") {
        const p = state.players.find((x) => bots!.has(x.userId) && !state.readyForNext.includes(x.seat));
        if (!p) return;
        actor = p;
        action = { type: "READY_NEXT_HAND" };
      } else if (state.phase === "playing") {
        const p = state.players.find((x) => x.seat === state.hand.currentTurn);
        if (!p || !bots.has(p.userId)) return;
        actor = p;
        const key = `${state.version}:${p.seat}`;
        const done = tried.get(key) ?? new Set<string>();
        tried.set(key, done);
        action = planBotAction(getPlayerView(state, p.seat), done);
        done.add(action.type);
      } else return;

      await touchPresence(actor.userId, BOT_PRESENCE_TTL);
      if (delay > 0) await sleep(action.type === "DRAW_TILE" ? delay : Math.round(delay * 0.7));
      const user: AuthUser = { id: actor.userId, username: "bot", displayName: "Bot", isGuest: true, avatar: "cay" };
      try {
        await processCommand(user, { commandId: `bot-${randomBytes(8).toString("hex")}`, matchId, expectedVersion: state.version, action });
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        if (e.code === "STALE_VERSION") continue;
        if (e.code === "INVALID_ACTION") {
          // Plan reddedildi: güvenli yedek olan süre aşımı hamlesi (çek + at) uygulanır.
          if (state.phase === "playing") {
            try {
              await processCommand(
                { id: "00000000-0000-0000-0000-000000000000", system: true },
                { commandId: `bot-timeout-${matchId}-${state.version}`, matchId, expectedVersion: state.version, action: { type: "TIMEOUT" } },
              );
            } catch {
              return;
            }
          }
          continue;
        }
        throw e;
      }
    }
  } finally {
    running.delete(matchId);
  }
}

