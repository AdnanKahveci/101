import { and, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { getDb, schema } from "./db";
import { fail } from "./errors";
import { onlineMap, publish, userChannel } from "./channels";
import type { AuthUser } from "./auth";

export async function searchUsers(viewerId: string, q: string) {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];
  const db = await getDb();
  const escaped = query.replace(/[%_\\]/g, (c) => `\\${c}`);
  return db
    .select({ id: schema.users.id, username: schema.users.username, displayName: schema.users.displayName, avatar: schema.users.avatar })
    .from(schema.users)
    .where(and(ilike(schema.users.username, `${escaped}%`), eq(schema.users.isGuest, false), ne(schema.users.id, viewerId)))
    .limit(20);
}

export async function sendFriendRequest(user: AuthUser, username: string) {
  if (user.isGuest) fail("FORBIDDEN", "Arkadaş eklemek için kayıtlı hesap gerekir.");
  const db = await getDb();
  const [target] = await db.select().from(schema.users).where(eq(schema.users.username, username.toLowerCase())).limit(1);
  if (!target || target.isGuest) fail("NOT_FOUND", "Kullanıcı bulunamadı.");
  if (target!.id === user.id) fail("BAD_REQUEST", "Kendinize istek gönderemezsiniz.");
  const [friend] = await db
    .select()
    .from(schema.friendships)
    .where(and(eq(schema.friendships.userId, user.id), eq(schema.friendships.friendId, target!.id)))
    .limit(1);
  if (friend) fail("CONFLICT", "Zaten arkadaşsınız.");
  // Karşı taraf zaten istek gönderdiyse doğrudan kabul et.
  const [reverse] = await db
    .select()
    .from(schema.friendRequests)
    .where(and(eq(schema.friendRequests.fromUserId, target!.id), eq(schema.friendRequests.toUserId, user.id), eq(schema.friendRequests.status, "pending")))
    .limit(1);
  if (reverse) {
    await respondFriendRequest(user, reverse.id, true);
    return { status: "accepted" as const };
  }
  await db
    .insert(schema.friendRequests)
    .values({ fromUserId: user.id, toUserId: target!.id })
    .onConflictDoUpdate({ target: [schema.friendRequests.fromUserId, schema.friendRequests.toUserId], set: { status: "pending", createdAt: new Date() } });
  await publish(userChannel(target!.id), { type: "notify", kind: "friendRequest", data: { from: user.displayName } });
  return { status: "pending" as const };
}

export async function respondFriendRequest(user: AuthUser, requestId: string, accept: boolean) {
  const db = await getDb();
  const [req] = await db
    .select()
    .from(schema.friendRequests)
    .where(and(eq(schema.friendRequests.id, requestId), eq(schema.friendRequests.toUserId, user.id)))
    .limit(1);
  if (!req || req.status !== "pending") fail("NOT_FOUND", "İstek bulunamadı.");
  await db.transaction(async (tx) => {
    await tx.update(schema.friendRequests).set({ status: accept ? "accepted" : "declined" }).where(eq(schema.friendRequests.id, requestId));
    if (accept) {
      await tx
        .insert(schema.friendships)
        .values([
          { userId: req!.fromUserId, friendId: req!.toUserId },
          { userId: req!.toUserId, friendId: req!.fromUserId },
        ])
        .onConflictDoNothing();
    }
  });
  if (accept) await publish(userChannel(req!.fromUserId), { type: "notify", kind: "friendAccepted", data: { by: user.displayName } });
}

export async function removeFriend(user: AuthUser, friendId: string) {
  const db = await getDb();
  await db
    .delete(schema.friendships)
    .where(
      or(
        and(eq(schema.friendships.userId, user.id), eq(schema.friendships.friendId, friendId)),
        and(eq(schema.friendships.userId, friendId), eq(schema.friendships.friendId, user.id)),
      ),
    );
}

export async function friendsOverview(userId: string) {
  const db = await getDb();
  const friends = await db
    .select({ id: schema.users.id, username: schema.users.username, displayName: schema.users.displayName, avatar: schema.users.avatar })
    .from(schema.friendships)
    .innerJoin(schema.users, eq(schema.users.id, schema.friendships.friendId))
    .where(eq(schema.friendships.userId, userId));
  const online = await onlineMap(friends.map((f) => f.id));
  // Arkadaşın bulunduğu oda (katılmak için)
  const rooms = friends.length
    ? await db
        .select({ userId: schema.roomMembers.userId, code: schema.rooms.code, name: schema.rooms.name, status: schema.rooms.status })
        .from(schema.roomMembers)
        .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomMembers.roomId))
        .where(inArray(schema.roomMembers.userId, friends.map((f) => f.id)))
        .orderBy(desc(schema.rooms.updatedAt))
    : [];
  const incoming = await db
    .select({ id: schema.friendRequests.id, username: schema.users.username, displayName: schema.users.displayName, avatar: schema.users.avatar })
    .from(schema.friendRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.friendRequests.fromUserId))
    .where(and(eq(schema.friendRequests.toUserId, userId), eq(schema.friendRequests.status, "pending")));
  const outgoing = await db
    .select({ id: schema.friendRequests.id, username: schema.users.username, displayName: schema.users.displayName })
    .from(schema.friendRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.friendRequests.toUserId))
    .where(and(eq(schema.friendRequests.fromUserId, userId), eq(schema.friendRequests.status, "pending")));
  return {
    friends: friends.map((f) => {
      const room = rooms.find((r) => r.userId === f.id);
      return { ...f, online: online[f.id] ?? false, room: room ? { code: room.code, name: room.name, status: room.status } : null };
    }),
    incoming,
    outgoing,
  };
}

// --------------------------------------------------------- Profil ve geçmiş

export async function profile(username: string) {
  const db = await getDb();
  const [u] = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      avatar: schema.users.avatar,
      isGuest: schema.users.isGuest,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.username, username.toLowerCase()))
    .limit(1);
  if (!u) fail("NOT_FOUND", "Oyuncu bulunamadı.");
  const [stats] = await db.select().from(schema.playerStatistics).where(eq(schema.playerStatistics.userId, u!.id)).limit(1);
  const s = stats ?? null;
  return {
    user: u!,
    stats: s && {
      ...s,
      winRate: s.matchesPlayed ? Math.round((s.matchesWon / s.matchesPlayed) * 1000) / 10 : 0,
      teamWinRate: s.teamMatchesPlayed ? Math.round((s.teamMatchesWon / s.teamMatchesPlayed) * 1000) / 10 : 0,
    },
    recent: await matchHistory(u!.id, 10),
  };
}

export async function matchHistory(userId: string, limit = 50) {
  const db = await getDb();
  const mine = await db
    .select({
      matchId: schema.matches.id,
      status: schema.matches.status,
      teamMode: schema.matches.teamMode,
      totalHands: schema.matches.totalHands,
      startedAt: schema.matches.startedAt,
      finishedAt: schema.matches.finishedAt,
      seat: schema.matchPlayers.seat,
      finalScore: schema.matchPlayers.finalScore,
      isWinner: schema.matchPlayers.isWinner,
    })
    .from(schema.matchPlayers)
    .innerJoin(schema.matches, eq(schema.matches.id, schema.matchPlayers.matchId))
    .where(eq(schema.matchPlayers.userId, userId))
    .orderBy(desc(schema.matches.startedAt))
    .limit(limit);
  const ids = mine.map((m) => m.matchId);
  const all = ids.length
    ? await db
        .select({ matchId: schema.matchPlayers.matchId, seat: schema.matchPlayers.seat, displayName: schema.matchPlayers.displayName, finalScore: schema.matchPlayers.finalScore })
        .from(schema.matchPlayers)
        .where(inArray(schema.matchPlayers.matchId, ids))
    : [];
  return mine.map((m) => ({
    ...m,
    players: all.filter((p) => p.matchId === m.matchId).sort((a, b) => a.seat - b.seat),
  }));
}

/** Maç ayrıntısı: el bazlı sonuçlar (yalnızca maçın oyuncuları görebilir). */
export async function matchDetail(userId: string, matchId: string) {
  const db = await getDb();
  const [me] = await db
    .select()
    .from(schema.matchPlayers)
    .where(and(eq(schema.matchPlayers.matchId, matchId), eq(schema.matchPlayers.userId, userId)))
    .limit(1);
  if (!me) fail("FORBIDDEN", "Bu maçın ayrıntılarını görme yetkiniz yok.");
  const handsRows = await db.select().from(schema.hands).where(eq(schema.hands.matchId, matchId)).orderBy(schema.hands.handNumber);
  const players = await db.select().from(schema.matchPlayers).where(eq(schema.matchPlayers.matchId, matchId));
  return { players, hands: handsRows.map((h) => h.result) };
}

export async function getPreferences(userId: string) {
  const db = await getDb();
  const [p] = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, userId)).limit(1);
  return p ?? { userId, soundEnabled: true, sortMode: "color", confirmDiscard: true, animations: true };
}

export async function updatePreferences(
  userId: string,
  input: Partial<{ soundEnabled: boolean; sortMode: "color" | "value"; confirmDiscard: boolean; animations: boolean }>,
) {
  const db = await getDb();
  await db
    .insert(schema.userPreferences)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: schema.userPreferences.userId, set: { ...input, updatedAt: new Date() } });
  return getPreferences(userId);
}

export async function updateProfile(userId: string, input: { displayName?: string; avatar?: string }) {
  const db = await getDb();
  const patch: Partial<typeof schema.users.$inferInsert> = {};
  if (input.displayName !== undefined) {
    const n = input.displayName.trim();
    if (n.length < 2 || n.length > 20) fail("BAD_REQUEST", "Görünen ad 2-20 karakter olmalı.");
    patch.displayName = n;
  }
  if (input.avatar !== undefined) patch.avatar = input.avatar;
  if (Object.keys(patch).length) await db.update(schema.users).set(patch).where(eq(schema.users.id, userId));
}
