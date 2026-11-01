import { randomBytes, randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Seat } from "@/engine";
import { getDb, schema } from "./db";
import { AppError, fail } from "./errors";
import { hashPassword, verifyPassword, type AuthUser } from "./auth";
import { getInfra } from "./infra";
import { onlineMap, publish, roomChannel, userChannel } from "./channels";
import { parseRoomSettings, settingsToRules, type RoomSettings } from "./validation";
import { createMatchInTx, loadState } from "./game-service";
import { BOT_PREFIX, fillWithBots } from "./bots";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SEAT_LABELS = ["Alt", "Sağ", "Üst", "Sol"] as const;

function generateCode(): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return c;
}

export interface RoomMemberView {
  userId: string;
  displayName: string;
  avatar: string;
  isGuest: boolean;
  seat: number | null;
  ready: boolean;
  online: boolean;
  isOwner: boolean;
  isBot: boolean;
}

export interface RoomView {
  id: string;
  code: string;
  name: string;
  ownerId: string;
  visibility: "public" | "private";
  hasPassword: boolean;
  status: "lobby" | "playing";
  settings: RoomSettings;
  currentMatchId: string | null;
  lastMatch: { id: string; status: string } | null;
  members: RoomMemberView[];
  /** Yalnızca odanın üyelerine gönderilir. */
  inviteToken: string | null;
  isMember: boolean;
}

type RoomRow = typeof schema.rooms.$inferSelect;

async function roomByCode(code: string): Promise<RoomRow> {
  const db = await getDb();
  const [room] = await db.select().from(schema.rooms).where(eq(schema.rooms.code, code.toUpperCase())).limit(1);
  if (!room) fail("NOT_FOUND", "Oda bulunamadı.");
  return room!;
}

async function members(roomId: string) {
  const db = await getDb();
  return db
    .select({
      userId: schema.roomMembers.userId,
      seat: schema.roomMembers.seat,
      ready: schema.roomMembers.ready,
      displayName: schema.users.displayName,
      avatar: schema.users.avatar,
      isGuest: schema.users.isGuest,
      username: schema.users.username,
      joinedAt: schema.roomMembers.joinedAt,
    })
    .from(schema.roomMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.roomMembers.userId))
    .where(eq(schema.roomMembers.roomId, roomId))
    .orderBy(asc(schema.roomMembers.joinedAt));
}

async function buildView(room: RoomRow, viewerId: string | null): Promise<RoomView> {
  const list = await members(room.id);
  const online = await onlineMap(list.map((m) => m.userId));
  const isMember = !!viewerId && list.some((m) => m.userId === viewerId);
  let lastMatch: RoomView["lastMatch"] = null;
  if (room.currentMatchId) {
    const db = await getDb();
    const [m] = await db
      .select({ id: schema.matches.id, status: schema.matches.status })
      .from(schema.matches)
      .where(eq(schema.matches.id, room.currentMatchId))
      .limit(1);
    lastMatch = m ?? null;
  }
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    ownerId: room.ownerId,
    visibility: room.visibility as RoomView["visibility"],
    hasPassword: !!room.passwordHash,
    status: room.status as RoomView["status"],
    settings: room.settings as RoomSettings,
    currentMatchId: room.status === "playing" ? room.currentMatchId : null,
    lastMatch,
    members: list.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      avatar: m.avatar,
      isGuest: m.isGuest,
      seat: m.seat,
      ready: m.ready || m.username.startsWith(BOT_PREFIX),
      online: m.username.startsWith(BOT_PREFIX) || (online[m.userId] ?? false),
      isOwner: m.userId === room.ownerId,
      isBot: m.username.startsWith(BOT_PREFIX),
    })),
    inviteToken: isMember ? room.inviteToken : null,
    isMember,
  };
}

async function notifyRoom(roomId: string, extra: { navigateToMatch?: string } = {}) {
  await publish(roomChannel(roomId), { type: "room", roomId, ...extra });
}

async function touchRoom(roomId: string) {
  const db = await getDb();
  await db.update(schema.rooms).set({ updatedAt: new Date() }).where(eq(schema.rooms.id, roomId));
}

// --------------------------------------------------------------- İşlemler

export async function createRoom(
  user: AuthUser,
  input: { name: string; visibility: "public" | "private"; password?: string | null; settings?: unknown },
): Promise<RoomView> {
  const infra = await getInfra();
  if ((await infra.incrWindow(`okey:rl:createRoom:${user.id}`, 60_000)) > 10) fail("RATE_LIMITED", "Çok fazla oda oluşturdunuz.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 48) fail("BAD_REQUEST", "Oda adı 2-48 karakter olmalı.");
  if (input.password && (input.password.length < 4 || input.password.length > 64)) fail("BAD_REQUEST", "Oda şifresi 4-64 karakter olmalı.");
  const settings = parseRoomSettings(input.settings);
  const db = await getDb();
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCode();
    try {
      const room = await db.transaction(async (tx) => {
        const [room] = await tx
          .insert(schema.rooms)
          .values({
            code,
            name,
            ownerId: user.id,
            visibility: input.visibility,
            passwordHash,
            inviteToken: randomBytes(18).toString("base64url"),
            settings,
          })
          .returning();
        await tx.insert(schema.roomMembers).values({ roomId: room.id, userId: user.id, role: "player", seat: 0 });
        return room;
      });
      return buildView(room, user.id);
    } catch (e) {
      if (isUniqueViolation(e, "rooms_code_uq")) continue;
      throw e;
    }
  }
  throw new AppError("INTERNAL", "Oda kodu üretilemedi, tekrar deneyin.");
}

export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const err = e as { code?: string; constraint?: string; message?: string; cause?: unknown };
  const inner = (err?.cause ?? err) as { code?: string; constraint?: string; message?: string };
  const code = inner?.code ?? err?.code;
  if (code !== "23505") return false;
  if (!constraint) return true;
  return (inner?.constraint ?? err?.constraint ?? inner?.message ?? "").includes(constraint);
}

/** Odayı görüntüleme. Özel odalarda üye olmayan kullanıcı yalnızca sınırlı bilgi görür. */
export async function getRoom(code: string, viewer: AuthUser | null, token?: string | null) {
  const room = await roomByCode(code);
  const view = await buildView(room, viewer?.id ?? null);
  // Özel oda = listede görünmez; oda kodunu bilen katılabilir (şifreli odalar hariç).
  if (view.isMember || room.visibility === "public" || !room.passwordHash || (token && token === room.inviteToken)) {
    return { access: "full" as const, room: view, needsPassword: !view.isMember && !!room.passwordHash && token !== room.inviteToken };
  }
  return {
    access: "limited" as const,
    room: { code: room.code, name: room.name, hasPassword: !!room.passwordHash, playerCount: view.members.filter((m) => m.seat !== null).length },
    needsPassword: !!room.passwordHash,
  };
}

export async function joinRoom(
  code: string,
  user: AuthUser,
  input: { password?: string | null; token?: string | null; invitationId?: string | null },
): Promise<RoomView> {
  const infra = await getInfra();
  if ((await infra.incrWindow(`okey:rl:join:${user.id}`, 60_000)) > 20) fail("RATE_LIMITED", "Çok fazla katılma denemesi.");
  const room = await roomByCode(code);
  const db = await getDb();
  const [already] = await db
    .select()
    .from(schema.roomMembers)
    .where(and(eq(schema.roomMembers.roomId, room.id), eq(schema.roomMembers.userId, user.id)))
    .limit(1);
  if (already) {
    // tekrar bağlantıda çifte katılım olmaz; listeden kaldırdığı odaya dönerse yeniden görünür
    if (already.hidden) await db.update(schema.roomMembers).set({ hidden: false }).where(eq(schema.roomMembers.id, already.id));
    return buildView(room, user.id);
  }

  let invited = false;
  if (input.invitationId) {
    const [inv] = await db
      .select()
      .from(schema.roomInvitations)
      .where(and(eq(schema.roomInvitations.id, input.invitationId), eq(schema.roomInvitations.toUserId, user.id), eq(schema.roomInvitations.roomId, room.id)))
      .limit(1);
    invited = !!inv && inv.status !== "declined";
    if (invited) await db.update(schema.roomInvitations).set({ status: "accepted" }).where(eq(schema.roomInvitations.id, inv!.id));
  }
  const tokenOk = !!input.token && input.token === room.inviteToken;
  if (room.passwordHash && !tokenOk && !invited) {
    if (!input.password || !(await verifyPassword(input.password, room.passwordHash))) fail("FORBIDDEN", "Oda şifresi hatalı.");
  }
  try {
    await db.insert(schema.roomMembers).values({ roomId: room.id, userId: user.id, role: "spectator", seat: null });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
  // Boş koltuk varsa ve oda lobideyse otomatik oturt (kullanıcı sonra değiştirebilir).
  if (room.status === "lobby") {
    const taken = new Set((await members(room.id)).map((m) => m.seat).filter((s): s is number => s !== null));
    for (const seat of [0, 1, 2, 3]) {
      if (taken.has(seat)) continue;
      try {
        await db
          .update(schema.roomMembers)
          .set({ seat, role: "player" })
          .where(and(eq(schema.roomMembers.roomId, room.id), eq(schema.roomMembers.userId, user.id)));
        break;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
  }
  await touchRoom(room.id);
  await notifyRoom(room.id);
  return buildView(await roomByCode(code), user.id);
}

async function requireMember(roomId: string, userId: string) {
  const db = await getDb();
  const [m] = await db
    .select()
    .from(schema.roomMembers)
    .where(and(eq(schema.roomMembers.roomId, roomId), eq(schema.roomMembers.userId, userId)))
    .limit(1);
  if (!m) fail("FORBIDDEN", "Bu odanın üyesi değilsiniz.");
  return m!;
}

function requireLobby(room: RoomRow) {
  if (room.status !== "lobby") fail("CONFLICT", "Maç devam ederken bu işlem yapılamaz.");
}

export async function selectSeat(code: string, user: AuthUser, seat: number | null): Promise<RoomView> {
  const room = await roomByCode(code);
  requireLobby(room);
  await requireMember(room.id, user.id);
  if (seat !== null && ![0, 1, 2, 3].includes(seat)) fail("BAD_REQUEST", "Geçersiz koltuk.");
  const db = await getDb();
  try {
    await db
      .update(schema.roomMembers)
      .set({ seat, role: seat === null ? "spectator" : "player", ready: false })
      .where(and(eq(schema.roomMembers.roomId, room.id), eq(schema.roomMembers.userId, user.id)));
  } catch (e) {
    if (isUniqueViolation(e)) fail("CONFLICT", "Bu koltuk dolu.");
    throw e;
  }
  await notifyRoom(room.id);
  return buildView(room, user.id);
}

/** Oda sahibi bir oyuncuyu koltuğa taşır; koltuk doluysa iki oyuncunun yeri değişir. */
export async function moveMember(code: string, owner: AuthUser, targetUserId: string, seat: number | null): Promise<RoomView> {
  const room = await roomByCode(code);
  if (room.ownerId !== owner.id) fail("FORBIDDEN", "Koltukları yalnızca oda sahibi düzenleyebilir.");
  requireLobby(room);
  if (seat !== null && ![0, 1, 2, 3].includes(seat)) fail("BAD_REQUEST", "Geçersiz koltuk.");
  const target = await requireMember(room.id, targetUserId);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [occupant] =
      seat === null
        ? []
        : await tx
            .select()
            .from(schema.roomMembers)
            .where(and(eq(schema.roomMembers.roomId, room.id), eq(schema.roomMembers.seat, seat)))
            .limit(1);
    await tx.update(schema.roomMembers).set({ seat: null, ready: false }).where(eq(schema.roomMembers.id, target.id));
    if (occupant && occupant.id !== target.id) {
      await tx
        .update(schema.roomMembers)
        .set({ seat: target.seat, role: target.seat === null ? "spectator" : "player", ready: false })
        .where(eq(schema.roomMembers.id, occupant.id));
    }
    await tx
      .update(schema.roomMembers)
      .set({ seat, role: seat === null ? "spectator" : "player" })
      .where(eq(schema.roomMembers.id, target.id));
  });
  await notifyRoom(room.id);
  return buildView(room, owner.id);
}

export async function setReady(code: string, user: AuthUser, ready: boolean): Promise<RoomView> {
  const room = await roomByCode(code);
  requireLobby(room);
  const m = await requireMember(room.id, user.id);
  if (m.seat === null) fail("BAD_REQUEST", "Hazır olmak için önce bir koltuğa oturun.");
  const db = await getDb();
  await db.update(schema.roomMembers).set({ ready }).where(eq(schema.roomMembers.id, m.id));
  await notifyRoom(room.id);
  return buildView(room, user.id);
}

export async function updateRoom(
  code: string,
  owner: AuthUser,
  input: { name?: string; visibility?: "public" | "private"; password?: string | null; settings?: unknown },
): Promise<RoomView> {
  const room = await roomByCode(code);
  if (room.ownerId !== owner.id) fail("FORBIDDEN", "Oda ayarlarını yalnızca oda sahibi değiştirebilir.");
  requireLobby(room); // aktif maçın kural profili sabittir
  const patch: Partial<RoomRow> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 48) fail("BAD_REQUEST", "Oda adı 2-48 karakter olmalı.");
    patch.name = name;
  }
  if (input.visibility) patch.visibility = input.visibility;
  if (input.password !== undefined) {
    if (input.password && (input.password.length < 4 || input.password.length > 64)) fail("BAD_REQUEST", "Oda şifresi 4-64 karakter olmalı.");
    patch.passwordHash = input.password ? await hashPassword(input.password) : null;
  }
  if (input.settings !== undefined) patch.settings = parseRoomSettings(input.settings, room.settings as RoomSettings);
  const db = await getDb();
  await db.update(schema.rooms).set(patch).where(eq(schema.rooms.id, room.id));
  // Kurallar değiştiyse herkesin hazır durumu sıfırlanır.
  if (input.settings !== undefined) await db.update(schema.roomMembers).set({ ready: false }).where(eq(schema.roomMembers.roomId, room.id));
  await notifyRoom(room.id);
  return buildView(await roomByCode(code), owner.id);
}

export async function startMatch(code: string, owner: AuthUser): Promise<{ matchId: string }> {
  const room = await roomByCode(code);
  if (room.ownerId !== owner.id) fail("FORBIDDEN", "Maçı yalnızca oda sahibi başlatabilir.");
  requireLobby(room);
  const db = await getDb();
  const infra = await getInfra();
  const matchId = await (async () => {
    const lockToken = crypto.randomUUID();
    if (!(await infra.setNX(`okey:lock:start:${room.id}`, lockToken, 10_000))) fail("CONFLICT", "Maç zaten başlatılıyor.");
    try {
      return await db.transaction(async (tx) => {
        const seated = await tx
          .select({
            userId: schema.roomMembers.userId,
            seat: schema.roomMembers.seat,
            ready: schema.roomMembers.ready,
            displayName: schema.users.displayName,
            username: schema.users.username,
          })
          .from(schema.roomMembers)
          .innerJoin(schema.users, eq(schema.users.id, schema.roomMembers.userId))
          .where(and(eq(schema.roomMembers.roomId, room.id), isNotNull(schema.roomMembers.seat)));
        if (seated.length !== 4) fail("BAD_REQUEST", "Maçı başlatmak için dört oyuncunun oturması gerekir.");
        const notReady = seated.filter((s) => !s.ready && s.userId !== owner.id && !s.username.startsWith(BOT_PREFIX));
        if (notReady.length) fail("BAD_REQUEST", `Henüz hazır olmayan oyuncular: ${notReady.map((s) => s.displayName).join(", ")}`);
        const rules = settingsToRules(room.settings as RoomSettings);
        const state = await createMatchInTx(
          tx,
          room,
          seated.map((s) => ({ userId: s.userId, seat: s.seat as Seat, displayName: s.displayName })),
          rules,
        );
        const upd = await tx
          .update(schema.rooms)
          .set({ status: "playing", currentMatchId: state.matchId, updatedAt: new Date() })
          .where(and(eq(schema.rooms.id, room.id), eq(schema.rooms.status, "lobby")))
          .returning({ id: schema.rooms.id });
        if (upd.length === 0) fail("CONFLICT", "Oda durumu değişti.");
        return state.matchId;
      });
    } finally {
      await infra.delIfEquals(`okey:lock:start:${room.id}`, lockToken);
    }
  })();
  await loadState(matchId, { fresh: true }); // önbelleği ısıt
  await notifyRoom(room.id, { navigateToMatch: matchId });
  return { matchId };
}

/** Oda sahibi boş koltukları botlarla doldurur (tek başına deneme / eksik kişiyle oynama). */
export async function addBots(code: string, owner: AuthUser): Promise<RoomView> {
  const room = await roomByCode(code);
  if (room.ownerId !== owner.id) fail("FORBIDDEN", "Bot eklemeyi yalnızca oda sahibi yapabilir.");
  requireLobby(room);
  const current = await members(room.id);
  await fillWithBots(room.id, current.map((m) => m.displayName));
  await notifyRoom(room.id);
  return buildView(room, owner.id);
}

/** Oda sahibi bir botu odadan çıkarır. */
export async function removeBot(code: string, owner: AuthUser, botUserId: string): Promise<RoomView> {
  const room = await roomByCode(code);
  if (room.ownerId !== owner.id) fail("FORBIDDEN", "Botları yalnızca oda sahibi çıkarabilir.");
  requireLobby(room);
  const db = await getDb();
  const [u] = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, botUserId)).limit(1);
  if (!u?.username.startsWith(BOT_PREFIX)) fail("BAD_REQUEST", "Bu oyuncu bot değil.");
  await db.delete(schema.roomMembers).where(and(eq(schema.roomMembers.roomId, room.id), eq(schema.roomMembers.userId, botUserId)));
  await notifyRoom(room.id);
  return buildView(room, owner.id);
}

export async function leaveRoom(code: string, user: AuthUser): Promise<{ left: boolean; seatKept: boolean }> {
  const room = await roomByCode(code);
  const m = await requireMember(room.id, user.id);
  const db = await getDb();
  if (room.status === "playing" && m.seat !== null) {
    // Maç sırasında koltuk korunur; oyuncu istediği an geri dönebilir.
    return { left: false, seatKept: true };
  }
  await db.delete(schema.roomMembers).where(eq(schema.roomMembers.id, m.id));
  if (room.ownerId === user.id) {
    const rest = await members(room.id);
    if (rest.length > 0) {
      const next = rest.find((r) => r.seat !== null) ?? rest[0];
      await db.update(schema.rooms).set({ ownerId: next.userId }).where(eq(schema.rooms.id, room.id));
    }
  }
  await notifyRoom(room.id);
  return { left: true, seatKept: false };
}

/**
 * Odayı "Masalarım" listesinden kaldırır.
 *  - Lobide / bitmiş odada: odadan ayrılır.
 *  - Maç sürerken masada başka gerçek oyuncu yoksa (yalnızca botlar): oda kapatılır.
 *  - Maç sürerken başka oyuncular varsa: koltuk korunur (oyun bozulmaz), oda yalnızca listeden gizlenir.
 * Masada kimse (gerçek kişi) kalmazsa oda kapanır.
 */
export async function removeFromMyRooms(code: string, user: AuthUser): Promise<{ removed: true; closed: boolean }> {
  const room = await roomByCode(code);
  const m = await requireMember(room.id, user.id);
  const db = await getDb();
  const humansElse = (await members(room.id)).filter((x) => x.userId !== user.id && !x.username.startsWith(BOT_PREFIX));
  const closeRoom = async () => {
    await db.update(schema.rooms).set({ status: "closed", updatedAt: new Date() }).where(eq(schema.rooms.id, room.id));
    await notifyRoom(room.id);
  };
  if (room.status === "playing" && m.seat !== null) {
    if (humansElse.some((x) => x.seat !== null)) {
      await db.update(schema.roomMembers).set({ hidden: true }).where(eq(schema.roomMembers.id, m.id));
      return { removed: true, closed: false };
    }
    await db.update(schema.roomMembers).set({ hidden: true }).where(eq(schema.roomMembers.id, m.id));
    await closeRoom();
    return { removed: true, closed: true };
  }
  if (humansElse.length === 0) {
    await db.update(schema.roomMembers).set({ hidden: true }).where(eq(schema.roomMembers.id, m.id));
    if (room.status !== "closed") await closeRoom();
    return { removed: true, closed: true };
  }
  await leaveRoom(code, user);
  return { removed: true, closed: false };
}

export async function listPublicRooms() {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.rooms.id,
      code: schema.rooms.code,
      name: schema.rooms.name,
      status: schema.rooms.status,
      settings: schema.rooms.settings,
      hasPassword: schema.rooms.passwordHash,
      updatedAt: schema.rooms.updatedAt,
    })
    .from(schema.rooms)
    .where(eq(schema.rooms.visibility, "public"))
    .orderBy(desc(schema.rooms.updatedAt))
    .limit(50);
  const ids = rows.map((r) => r.id);
  const seats = ids.length
    ? await db
        .select({ roomId: schema.roomMembers.roomId, seat: schema.roomMembers.seat })
        .from(schema.roomMembers)
        .where(and(inArray(schema.roomMembers.roomId, ids), isNotNull(schema.roomMembers.seat)))
    : [];
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    status: r.status,
    settings: r.settings as RoomSettings,
    hasPassword: !!r.hasPassword,
    players: seats.filter((s) => s.roomId === r.id).length,
  }));
}

/** Kullanıcının üyesi olduğu odalar (panel için). */
export async function myRooms(userId: string) {
  const db = await getDb();
  return db
    .select({ code: schema.rooms.code, name: schema.rooms.name, status: schema.rooms.status, currentMatchId: schema.rooms.currentMatchId, seat: schema.roomMembers.seat })
    .from(schema.roomMembers)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomMembers.roomId))
    .where(and(eq(schema.roomMembers.userId, userId), eq(schema.roomMembers.hidden, false)))
    .orderBy(desc(schema.rooms.updatedAt))
    .limit(20);
}

export async function inviteToRoom(code: string, user: AuthUser, friendId: string) {
  const room = await roomByCode(code);
  await requireMember(room.id, user.id);
  const db = await getDb();
  const [friend] = await db
    .select()
    .from(schema.friendships)
    .where(and(eq(schema.friendships.userId, user.id), eq(schema.friendships.friendId, friendId)))
    .limit(1);
  if (!friend) fail("FORBIDDEN", "Yalnızca arkadaşlarınızı davet edebilirsiniz.");
  const [inv] = await db.insert(schema.roomInvitations).values({ roomId: room.id, fromUserId: user.id, toUserId: friendId }).returning();
  await publish(userChannel(friendId), {
    type: "notify",
    kind: "invitation",
    data: { invitationId: inv.id, roomCode: room.code, roomName: room.name, from: user.displayName },
  });
  return { invitationId: inv.id };
}

export async function myInvitations(userId: string) {
  const db = await getDb();
  return db
    .select({
      id: schema.roomInvitations.id,
      roomCode: schema.rooms.code,
      roomName: schema.rooms.name,
      from: schema.users.displayName,
      createdAt: schema.roomInvitations.createdAt,
    })
    .from(schema.roomInvitations)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomInvitations.roomId))
    .innerJoin(schema.users, eq(schema.users.id, schema.roomInvitations.fromUserId))
    .where(and(eq(schema.roomInvitations.toUserId, userId), eq(schema.roomInvitations.status, "pending")))
    .orderBy(desc(schema.roomInvitations.createdAt))
    .limit(20);
}

export async function respondInvitation(userId: string, invitationId: string, accept: boolean, user: AuthUser) {
  const db = await getDb();
  const [inv] = await db
    .select({ id: schema.roomInvitations.id, code: schema.rooms.code })
    .from(schema.roomInvitations)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomInvitations.roomId))
    .where(and(eq(schema.roomInvitations.id, invitationId), eq(schema.roomInvitations.toUserId, userId)))
    .limit(1);
  if (!inv) fail("NOT_FOUND", "Davet bulunamadı.");
  if (!accept) {
    await db.update(schema.roomInvitations).set({ status: "declined" }).where(eq(schema.roomInvitations.id, invitationId));
    return { roomCode: null };
  }
  await joinRoom(inv!.code, user, { invitationId });
  return { roomCode: inv!.code };
}
