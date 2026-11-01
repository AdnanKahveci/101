import { isJoker, tileFaceValue } from "./tiles";
import {
  FINISH_LABELS,
  SEATS,
  type FinishType,
  type GameState,
  type HandResult,
  type RuleProfile,
  type ScoreLine,
  type Seat,
} from "./types";

function partner(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

export interface FinishInfo {
  finisher: Seat | null;
  finishType: FinishType;
}

/**
 * El sonu puanlaması. Her satır oyunculara açıklanabilir biçimde döner.
 * 101'de düşük puan iyidir: bitiren eksi puan yazar, diğerleri ceza alır.
 */
export function calculateHandScore(state: GameState, rules: RuleProfile, info: FinishInfo): HandResult {
  const h = state.hand;
  const { finisher, finishType } = info;
  const breakdown: ScoreLine[] = [];
  const bonuses: ScoreLine[] = [];
  const reasons: string[] = [];
  const scores: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const name = (s: Seat) => state.players.find((p) => p.seat === s)?.displayName ?? `Oyuncu ${s + 1}`;

  // Bitiş çarpanları
  const applied: { label: string; factor: number }[] = [];
  if (finisher !== null) {
    const opened = h.opened[finisher];
    const jokerFinish = finishType === "joker" || finishType === "handJoker";
    const handFinish = finishType === "hand" || finishType === "handJoker";
    if (jokerFinish && rules.jokerFinishMultiplier !== 1) applied.push({ label: "Okeyle bitiş", factor: rules.jokerFinishMultiplier });
    if (opened?.kind === "pairs" && rules.pairFinishMultiplier !== 1) applied.push({ label: "Çiftten bitiş", factor: rules.pairFinishMultiplier });
    if (handFinish && rules.handFinishMultiplier !== 1) applied.push({ label: "Elden bitiş", factor: rules.handFinishMultiplier });
  }
  let multiplier = 1;
  if (applied.length > 0) {
    multiplier = rules.stackMultipliers
      ? applied.reduce((m, a) => m * a.factor, 1)
      : Math.max(...applied.map((a) => a.factor));
  }

  // Bitiren oyuncu
  if (finisher !== null) {
    const opened = h.opened[finisher];
    let amount: number;
    switch (finishType) {
      case "handJoker":
        amount = rules.handJokerFinishScore;
        break;
      case "hand":
        amount = rules.handFinishScore;
        break;
      case "joker":
        amount = rules.jokerFinishScore;
        break;
      default:
        amount = opened?.kind === "pairs" ? rules.pairFinishScore : rules.finishScore;
    }
    scores[finisher] += amount;
    bonuses.push({ seat: finisher, label: FINISH_LABELS[finishType], amount });
    breakdown.push({ seat: finisher, label: `${FINISH_LABELS[finishType]} (bitiren)`, amount });
    reasons.push(`${name(finisher)} ${FINISH_LABELS[finishType].toLowerCase()} yaptı: ${amount}.`);
    if (applied.length > 0) {
      reasons.push(
        `Rakip cezalarına uygulanan çarpan: ×${multiplier} (${applied.map((a) => `${a.label} ×${a.factor}`).join(", ")}).`,
      );
    }
  } else {
    reasons.push("Destede taş kalmadı; el bitirensiz sona erdi.");
  }

  const scoreHands = finisher !== null || rules.deckExhaustedScoring === "penalties";
  for (const s of SEATS) {
    if (s === finisher) continue;
    if (!scoreHands) {
      breakdown.push({ seat: s, label: "Deste bitti – el puanı yazılmaz", amount: 0 });
      continue;
    }
    if (finisher !== null && rules.teamMode && rules.partnerOfFinisherScoresZero && s === partner(finisher)) {
      breakdown.push({ seat: s, label: "Eşi bitirdi – el cezası sıfırlandı", amount: 0 });
      reasons.push(`${name(s)} eşi bitirdiği için el cezası yazılmadı.`);
      continue;
    }
    const opened = h.opened[s];
    const tiles = h.hands[s];
    if (!opened) {
      const amount = rules.unopenedPenalty * multiplier;
      scores[s] += amount;
      breakdown.push({
        seat: s,
        label: multiplier > 1 ? `Açmadı (${rules.unopenedPenalty} ×${multiplier})` : "Açmadı",
        amount,
      });
      continue;
    }
    const jokers = tiles.filter((t) => isJoker(t, h.okey));
    const plain = tiles.filter((t) => !isJoker(t, h.okey));
    const plainSum = plain.reduce((sum, t) => sum + tileFaceValue(t, h.okey), 0);
    const jokerSum = jokers.length * rules.jokerInHandPenalty;
    let base = plainSum + jokerSum;
    const parts: string[] = [`eldeki taşlar ${plainSum}`];
    if (jokers.length > 0) parts.push(`${jokers.length} okey × ${rules.jokerInHandPenalty}`);
    if (opened.kind === "pairs" && rules.pairOpenerHandMultiplier !== 1) {
      base *= rules.pairOpenerHandMultiplier;
      parts.push(`çift açtı ×${rules.pairOpenerHandMultiplier}`);
    }
    const amount = base * multiplier;
    if (multiplier > 1) parts.push(`bitiş çarpanı ×${multiplier}`);
    scores[s] += amount;
    breakdown.push({ seat: s, label: `Açtı: ${parts.join(", ")}`, amount });
  }

  // El içi cezalar (okey atma, işlek taş, yandan alıp kullanamama...)
  for (const p of h.penalties) {
    scores[p.seat] += p.amount;
    breakdown.push({ seat: p.seat, label: `Ceza: ${p.reason}`, amount: p.amount });
  }

  const teamScores: [number, number] | null = rules.teamMode
    ? [scores[0] + scores[2], scores[1] + scores[3]]
    : null;

  return {
    handNumber: h.handNumber,
    dealer: h.dealer,
    firstPlayer: h.firstPlayer,
    indicator: h.indicator,
    okey: h.okey,
    finisher,
    finishType,
    multiplier,
    appliedMultipliers: applied,
    playerScores: scores,
    teamScores,
    breakdown,
    penalties: h.penalties.slice(),
    bonuses,
    reasons,
  };
}
