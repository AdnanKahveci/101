import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Küçük harfli, benzersiz kullanıcı adı. Misafirlerde otomatik üretilir. */
    username: varchar("username", { length: 32 }).notNull(),
    displayName: varchar("display_name", { length: 32 }).notNull(),
    passwordHash: text("password_hash"),
    isGuest: boolean("is_guest").notNull().default(false),
    avatar: varchar("avatar", { length: 32 }).notNull().default("cay"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_username_uq").on(t.username)],
);

/** Misafir kimliklerinin kaydı (misafir → kayıtlı dönüşümü izlenir). */
export const guestIdentities = pgTable("guest_identities", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  upgradedAt: timestamp("upgraded_at", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    /** Oturum belirtecinin SHA-256 özeti; belirtecin kendisi saklanmaz. */
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    userAgent: varchar("user_agent", { length: 256 }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  sortMode: varchar("sort_mode", { length: 16 }).notNull().default("color"),
  confirmDiscard: boolean("confirm_discard").notNull().default(true),
  animations: boolean("animations").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerStatistics = pgTable("player_statistics", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  matchesPlayed: integer("matches_played").notNull().default(0),
  matchesWon: integer("matches_won").notNull().default(0),
  matchesLost: integer("matches_lost").notNull().default(0),
  handsPlayed: integer("hands_played").notNull().default(0),
  normalFinishes: integer("normal_finishes").notNull().default(0),
  jokerFinishes: integer("joker_finishes").notNull().default(0),
  pairFinishes: integer("pair_finishes").notNull().default(0),
  handFinishes: integer("hand_finishes").notNull().default(0),
  teamMatchesPlayed: integer("team_matches_played").notNull().default(0),
  teamMatchesWon: integer("team_matches_won").notNull().default(0),
  totalScore: integer("total_score").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const friendRequests = pgTable(
  "friend_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("friend_requests_pair_uq").on(t.fromUserId, t.toUserId), index("friend_requests_to_idx").on(t.toUserId)],
);

/** Arkadaşlık iki yönlü saklanır (A→B ve B→A). */
export const friendships = pgTable(
  "friendships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.friendId] })],
);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 8 }).notNull(),
    name: varchar("name", { length: 48 }).notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    visibility: varchar("visibility", { length: 16 }).notNull().default("private"),
    passwordHash: text("password_hash"),
    /** Özel oda davet linkindeki tahmin edilemez belirteç. */
    inviteToken: varchar("invite_token", { length: 64 }).notNull(),
    settings: jsonb("settings").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("lobby"),
    currentMatchId: uuid("current_match_id"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rooms_code_uq").on(t.code), index("rooms_visibility_status_idx").on(t.visibility, t.status)],
);

export const roomMembers = pgTable(
  "room_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull().default("spectator"),
    /** 0=Alt, 1=Sağ, 2=Üst, 3=Sol. Aynı koltuğa iki kişi oturamaz (kısmi benzersiz index). */
    seat: integer("seat"),
    ready: boolean("ready").notNull().default(false),
    /** Oyuncu odayı "Masalarım" listesinden kaldırdı (devam eden maçta koltuk korunur). */
    hidden: boolean("hidden").notNull().default(false),
    joinedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("room_members_room_user_uq").on(t.roomId, t.userId),
    uniqueIndex("room_members_room_seat_uq").on(t.roomId, t.seat).where(sql`seat is not null`),
  ],
);

export const roomInvitations = pgTable(
  "room_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("room_invitations_to_idx").on(t.toUserId, t.status)],
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("playing"),
    rules: jsonb("rules").notNull(),
    teamMode: boolean("team_mode").notNull(),
    totalHands: integer("total_hands").notNull(),
    /** Dağıtım seed'i. Yalnızca sunucuda kullanılır, istemciye gönderilmez. */
    seedSecret: varchar("seed_secret", { length: 128 }).notNull(),
    winnerTeam: integer("winner_team"),
    startedAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("matches_room_idx").on(t.roomId)],
);

export const matchPlayers = pgTable(
  "match_players",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    seat: integer("seat").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    displayName: varchar("display_name", { length: 32 }).notNull(),
    team: integer("team"),
    finalScore: integer("final_score"),
    isWinner: boolean("is_winner"),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.seat] }),
    uniqueIndex("match_players_match_user_uq").on(t.matchId, t.userId),
    index("match_players_user_idx").on(t.userId),
  ],
);

export const matchTeams = pgTable(
  "match_teams",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    team: integer("team").notNull(),
    name: varchar("name", { length: 32 }).notNull(),
    finalScore: integer("final_score"),
    isWinner: boolean("is_winner"),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.team] })],
);

/** Maçın yetkili (authoritative) son durumu. version ile optimistic concurrency uygulanır. */
export const gameSnapshots = pgTable("game_snapshots", {
  matchId: uuid("match_id")
    .primaryKey()
    .references(() => matches.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  state: jsonb("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gameEvents = pgTable(
  "game_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    seq: integer("seq").notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    seat: integer("seat"),
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("game_events_order_uq").on(t.matchId, t.version, t.seq)],
);

/** İşlenmiş komut kimlikleri: aynı komut iki kez uygulanmaz. */
export const processedCommands = pgTable(
  "processed_commands",
  {
    userId: uuid("user_id").notNull(),
    commandId: varchar("command_id", { length: 64 }).notNull(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    resultVersion: integer("result_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.commandId] })],
);

export const hands = pgTable(
  "hands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    handNumber: integer("hand_number").notNull(),
    dealer: integer("dealer").notNull(),
    firstPlayer: integer("first_player").notNull(),
    indicator: jsonb("indicator").notNull(),
    okey: jsonb("okey").notNull(),
    finisherSeat: integer("finisher_seat"),
    finishType: varchar("finish_type", { length: 16 }).notNull(),
    multiplier: integer("multiplier").notNull(),
    result: jsonb("result").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("hands_match_number_uq").on(t.matchId, t.handNumber)],
);

export const handPlayerResults = pgTable(
  "hand_player_results",
  {
    handId: uuid("hand_id")
      .notNull()
      .references(() => hands.id, { onDelete: "cascade" }),
    seat: integer("seat").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    score: integer("score").notNull(),
    cumulative: integer("cumulative").notNull(),
    opened: varchar("opened", { length: 8 }),
  },
  (t) => [primaryKey({ columns: [t.handId, t.seat] }), index("hand_player_results_user_idx").on(t.userId)],
);
