import type { RuleProfile } from "./types";

/**
 * Varsayılan Türk 101 profili ("Klasik 101").
 * Her değer docs/GAME_RULES.md içinde açıklanmış ve testlerle doğrulanmıştır.
 */
export const DEFAULT_RULES: RuleProfile = {
  profileName: "Klasik 101",
  teamMode: false,
  folding: false,
  assisted: true,
  penaltiesEnabled: true,
  allowRunOpening: true,
  allowPairOpening: true,
  allowThirteenOne: false,
  aceAfterThirteenPoints: 14,
  minOpeningPoints: 101,
  minOpeningPairs: 5,
  allowJokerPair: true,
  allowDoubleJokerPair: false,
  pairOpenerCanAddToMelds: true,
  pairOpenerCanOpenMelds: false,
  meldOpenerCanOpenPairs: false,
  teamOpeningPolicy: "independent",
  jokerReplacePolicy: "openedOnly",
  redrawFakeJokerIndicator: true,
  finishScore: -101,
  jokerFinishScore: -202,
  pairFinishScore: -202,
  handFinishScore: -202,
  handJokerFinishScore: -404,
  unopenedPenalty: 202,
  jokerInHandPenalty: 101,
  jokerFinishMultiplier: 2,
  pairFinishMultiplier: 2,
  handFinishMultiplier: 2,
  stackMultipliers: true,
  pairOpenerHandMultiplier: 2,
  partnerOfFinisherScoresZero: true,
  discardJokerPenalty: 101,
  discardPlayablePenalty: 101,
  failedTakePenalty: 101,
  takenTileMeldMultiplier: 10,
  jokerTakenPenalty: 101,
  headFinishPenalty: 404,
  takenTilePairMultiplier: 20,
  silerEnabled: false,
  deckExhaustedScoring: "penalties",
  totalHands: 11,
  turnSeconds: 60,
  timeoutPolicy: "autoPlay",
};

export const HAND_COUNT_OPTIONS = [3, 5, 7, 9, 11, 15, 21] as const;
export const MAX_CUSTOM_HANDS = 51;

/** Kural profilinin iç tutarlılığını doğrular. Hata mesajı veya null döner. */
export function validateRuleProfile(r: RuleProfile): string | null {
  if (!r.allowRunOpening && !r.allowPairOpening) return "En az bir açılış türü (seri veya çift) açık olmalı.";
  if (!Number.isInteger(r.totalHands) || r.totalHands < 1 || r.totalHands > MAX_CUSTOM_HANDS)
    return `El sayısı 1 ile ${MAX_CUSTOM_HANDS} arasında bir tam sayı olmalı.`;
  if (!Number.isInteger(r.turnSeconds) || (r.turnSeconds !== 0 && (r.turnSeconds < 15 || r.turnSeconds > 600)))
    return "Hamle süresi 0 (süresiz) veya 15-600 saniye arasında olmalı.";
  if (r.minOpeningPoints < 1 || r.minOpeningPoints > 300) return "Açılış puanı 1-300 arasında olmalı.";
  if (r.minOpeningPairs < 1 || r.minOpeningPairs > 10) return "Minimum çift sayısı 1-10 arasında olmalı.";
  return null;
}
