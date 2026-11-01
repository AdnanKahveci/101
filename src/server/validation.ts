import { z } from "zod";
import { DEFAULT_RULES, MAX_CUSTOM_HANDS, validateRuleProfile, type RuleProfile } from "@/engine";
import { fail } from "./errors";

/** Oda ayarları: kural profilinin oda sahibinin değiştirebildiği alanları + oda düzeyi seçenekler. */
export const roomSettingsSchema = z
  .object({
    teamMode: z.boolean(),
    folding: z.boolean(),
    assisted: z.boolean(),
    penaltiesEnabled: z.boolean(),
    allowRunOpening: z.boolean(),
    allowPairOpening: z.boolean(),
    allowThirteenOne: z.boolean(),
    allowJokerPair: z.boolean(),
    pairOpenerCanAddToMelds: z.boolean(),
    teamOpeningPolicy: z.enum(["table", "independent", "partnerBase"]),
    jokerReplacePolicy: z.enum(["disabled", "openedOnly"]),
    jokerFinishMultiplier: z.number().int().min(1).max(4),
    pairFinishMultiplier: z.number().int().min(1).max(4),
    handFinishMultiplier: z.number().int().min(1).max(4),
    stackMultipliers: z.boolean(),
    partnerOfFinisherScoresZero: z.boolean(),
    silerEnabled: z.boolean(),
    deckExhaustedScoring: z.enum(["penalties", "noScore"]),
    totalHands: z.number().int().min(1).max(MAX_CUSTOM_HANDS),
    turnSeconds: z.number().int().refine((n) => n === 0 || (n >= 15 && n <= 600), "Hamle süresi 0 veya 15-600 sn olmalı."),
    timeoutPolicy: z.enum(["autoPlay", "wait"]),
    allowSpectators: z.boolean(),
  })
  .strict();

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  teamMode: DEFAULT_RULES.teamMode,
  folding: DEFAULT_RULES.folding,
  assisted: DEFAULT_RULES.assisted,
  penaltiesEnabled: DEFAULT_RULES.penaltiesEnabled,
  allowRunOpening: DEFAULT_RULES.allowRunOpening,
  allowPairOpening: DEFAULT_RULES.allowPairOpening,
  allowThirteenOne: DEFAULT_RULES.allowThirteenOne,
  allowJokerPair: DEFAULT_RULES.allowJokerPair,
  pairOpenerCanAddToMelds: DEFAULT_RULES.pairOpenerCanAddToMelds,
  teamOpeningPolicy: DEFAULT_RULES.teamOpeningPolicy,
  jokerReplacePolicy: DEFAULT_RULES.jokerReplacePolicy,
  jokerFinishMultiplier: DEFAULT_RULES.jokerFinishMultiplier,
  pairFinishMultiplier: DEFAULT_RULES.pairFinishMultiplier,
  handFinishMultiplier: DEFAULT_RULES.handFinishMultiplier,
  stackMultipliers: DEFAULT_RULES.stackMultipliers,
  partnerOfFinisherScoresZero: DEFAULT_RULES.partnerOfFinisherScoresZero,
  silerEnabled: DEFAULT_RULES.silerEnabled,
  deckExhaustedScoring: DEFAULT_RULES.deckExhaustedScoring,
  totalHands: DEFAULT_RULES.totalHands,
  turnSeconds: DEFAULT_RULES.turnSeconds,
  timeoutPolicy: DEFAULT_RULES.timeoutPolicy,
  allowSpectators: true,
};

export function parseRoomSettings(input: unknown, base: RoomSettings = DEFAULT_ROOM_SETTINGS): RoomSettings {
  const merged = { ...base, ...(typeof input === "object" && input ? input : {}) };
  const r = roomSettingsSchema.safeParse(merged);
  if (!r.success) fail("BAD_REQUEST", `Geçersiz oda ayarı: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const settings = r.data!;
  const err = validateRuleProfile(settingsToRules(settings));
  if (err) fail("BAD_REQUEST", err);
  return settings;
}

/** Oda ayarlarından maç kural profilini üretir (maç başında dondurulur). */
export function settingsToRules(s: RoomSettings): RuleProfile {
  const { allowSpectators: _ignored, ...rules } = s;
  const profileName = [s.teamMode ? "Eşli" : "Eşsiz", s.folding ? "Katlamalı" : "Katlamasız", s.assisted ? "Yardımlı" : "Yardımsız"].join(" · ");
  // Gösterge sahte okey çıkarsa her zaman yeni gösterge açılır (sahte okey gösterge olamaz).
  // 12-13-1 serisi bu sitede her zaman geçersizdir (oda ayarıyla açılamaz).
  return { ...DEFAULT_RULES, ...rules, allowThirteenOne: false, failedTakePenalty: 0, redrawFakeJokerIndicator: true, profileName };
}

// ----------------------------------------------------------------- Komutlar

const tileId = z.string().regex(/^([rybk](1[0-3]|[1-9])-[01]|f-[01])$/, "Geçersiz taş kimliği");
const face = z.object({ color: z.enum(["red", "yellow", "blue", "black"]), value: z.number().int().min(1).max(14) });
const meldSpec = z.object({
  tileIds: z.array(tileId).min(3).max(14),
  kind: z.enum(["run", "group"]).optional(),
  jokerFaces: z.record(z.string(), face).optional(),
});

export const gameActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("DRAW_TILE") }),
  z.object({ type: z.literal("TAKE_DISCARD") }),
  z.object({ type: z.literal("RETURN_DISCARD") }),
  z.object({ type: z.literal("TAKE_INDICATOR") }),
  z.object({ type: z.literal("RETURN_INDICATOR") }),
  z.object({ type: z.literal("OPEN_MELDS"), melds: z.array(meldSpec).min(1).max(8) }),
  z.object({ type: z.literal("OPEN_PAIRS"), pairs: z.array(z.tuple([tileId, tileId])).min(1).max(11) }),
  z.object({ type: z.literal("ADD_TO_MELD"), meldId: z.string().max(16), tileId, side: z.enum(["start", "end"]).optional() }),
  z.object({
    type: z.literal("REPLACE_JOKER"),
    meldId: z.string().max(16),
    tileId,
    jokerUse: z.discriminatedUnion("type", [
      z.object({ type: z.literal("newMeld"), meld: meldSpec }),
      z.object({ type: z.literal("addToMeld"), meldId: z.string().max(16), side: z.enum(["start", "end"]).optional() }),
    ]).optional(),
  }),
  z.object({ type: z.literal("DISCARD_TILE"), tileId }),
  z.object({ type: z.literal("FINISH_HAND"), tileId }),
  z.object({ type: z.literal("READY_NEXT_HAND") }),
  z.object({ type: z.literal("TIMEOUT") }),
]);

export const commandSchema = z.object({
  commandId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
  matchId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  action: gameActionSchema,
});

export type GameCommand = z.infer<typeof commandSchema>;

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) fail("BAD_REQUEST", r.error.issues.map((i) => `${i.path.join(".") || "istek"}: ${i.message}`).join("; "));
  return r.data!;
}
