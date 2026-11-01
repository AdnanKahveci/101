/**
 * Bot oyuncunun karar mantığı (saf fonksiyonlar; yalnızca oyuncunun kendi görünümünü kullanır).
 * Strateji:
 *  - Açmadan önce: yüksek taşları ve per adaylarını tut, işe yaramayan düşük taşları at; açabildiği an aç.
 *  - Yandan alınan taş 101'i (veya çift barajını) hemen geçirtiyorsa yandan al.
 *  - Çiftleri çoksa çift açılışına yönel.
 *  - Açtıktan sonra: yeni perleri koy, işle, elde kalan ceza puanını azaltmak için yüksek taşları at.
 */
import { calculateOpeningPoints, replaceJokerInMeld, validatePairs } from "./melds";
import { playableTargets, suggestBestMelds, suggestPairs } from "./assist";
import { effectiveFace, isJoker } from "./tiles";
import type { GameAction, MeldSpec, Tile, TileId } from "./types";
import type { GameView } from "./view";

type Plan = { type: "melds"; melds: MeldSpec[]; total: number } | { type: "pairs"; pairs: [TileId, TileId][] } | null;

/** Bu elle şu an yapılabilecek açılış (baraj ve "bir taş elde kalmalı" kuralı dahil). */
function openingPlan(v: GameView, hand: Tile[], mustInclude?: TileId): Plan {
  const okey = v.hand.okey;
  const rules = v.rules;
  const me = v.players.find((p) => p.seat === v.mySeat)!;
  if (rules.allowRunOpening && (!me.opened || me.opened.kind === "melds")) {
    let melds = suggestBestMelds(hand, okey, rules).melds;
    while (melds.length && melds.reduce((n, m) => n + m.tileIds.length, 0) >= hand.length) melds = melds.slice(0, -1);
    const calc = calculateOpeningPoints(melds, tilesMapOf(hand), okey, rules);
    const total = calc.ok ? calc.value.total : 0;
    const ok = melds.length > 0 && (me.opened ? true : total >= v.hand.requiredRunPoints);
    if (ok && (!mustInclude || melds.some((m) => m.tileIds.includes(mustInclude)))) return { type: "melds", melds, total };
  }
  const canPairs = rules.allowPairOpening && (!me.opened || me.opened.kind === "pairs" || v.hand.pairs.length > 0);
  if (canPairs) {
    let pairs = suggestPairs(hand, okey, rules);
    while (pairs.length * 2 >= hand.length) pairs = pairs.slice(0, -1);
    const need = me.opened ? 1 : v.hand.requiredPairCount;
    if (pairs.length >= need && validatePairs(pairs, tilesMapOf(hand), okey, rules).ok) {
      if (!mustInclude || pairs.some((p) => p.includes(mustInclude))) return { type: "pairs", pairs };
    }
  }
  return null;
}

const tilesMapOf = (hand: Tile[]) => new Map(hand.map((t) => [t.id, t]));

export function planBotAction(v: GameView, done: Set<string>): GameAction {
  const seat = v.mySeat!;
  const okey = v.hand.okey;
  const rules = v.rules;
  const me = v.players.find((p) => p.seat === seat)!;

  // 1) Çekme: yandan alınan taş hemen açtırıyorsa (veya açıkken işleniyorsa) yandan al, yoksa desteden çek.
  if (v.hand.turnPhase === "awaitingDraw") {
    const left = ((seat + 3) % 4) as 0 | 1 | 2 | 3;
    const top = v.hand.discards[left].at(-1);
    if (top && !done.has("TAKE_DISCARD")) {
      const withTop = [...v.myHand, top];
      if (!me.opened) {
        if (openingPlan(v, withTop, top.id)) return { type: "TAKE_DISCARD" };
      } else if (me.opened.kind === "melds" || rules.pairOpenerCanAddToMelds) {
        if (playableTargets([top], v.hand.melds, okey, rules)[top.id] && !isJoker(top, okey)) return { type: "TAKE_DISCARD" };
      }
    }
    if (v.hand.drawPileCount > 0) return { type: "DRAW_TILE" };
    return { type: "TAKE_DISCARD" };
  }

  // Yandan alınan taş zorunluluğu: kullanamıyorsa geri bırak.
  const ob = v.hand.myTakeObligation;
  if (ob) {
    if (!done.has("OPEN_MELDS") && !done.has("OPEN_PAIRS")) {
      const plan = openingPlan(v, v.myHand, ob);
      if (plan?.type === "melds") return { type: "OPEN_MELDS", melds: plan.melds };
      if (plan?.type === "pairs") return { type: "OPEN_PAIRS", pairs: plan.pairs };
    }
    const obTile = v.myHand.find((t) => t.id === ob);
    if (me.opened && obTile && !done.has("ADD_TO_MELD")) {
      const target = playableTargets([obTile], v.hand.melds, okey, rules)[ob];
      if (target) return { type: "ADD_TO_MELD", tileId: ob, meldId: target[0] };
    }
    return { type: "RETURN_DISCARD" };
  }

  // 2) Açılış / yeni per / çift
  if (!done.has("OPEN_MELDS") && !done.has("OPEN_PAIRS")) {
    const plan = openingPlan(v, v.myHand);
    if (plan?.type === "melds") return { type: "OPEN_MELDS", melds: plan.melds };
    if (plan?.type === "pairs") return { type: "OPEN_PAIRS", pairs: plan.pairs };
  }

  // 3) İşleme (okey dışı taşlar; bir taş elde kalmalı)
  if (me.opened && (me.opened.kind === "melds" || rules.pairOpenerCanAddToMelds) && v.myHand.length > 1 && !done.has("ADD_TO_MELD")) {
    const targets = playableTargets(v.myHand.filter((t) => !isJoker(t, okey)), v.hand.melds, okey, rules);
    const entry = Object.entries(targets)[0];
    if (entry) return { type: "ADD_TO_MELD", tileId: entry[0], meldId: entry[1][0] };
  }

  // 4) Bitir / at
  if (v.myHand.length === 1 && me.opened) return { type: "FINISH_HAND", tileId: v.myHand[0].id };
  return { type: "DISCARD_TILE", tileId: pickDiscard(v).id };
}

/** Her taşın elde tutma değeri: per adayı, yarım per (komşu/aynı sayı), çift, yüksek sayı. */
function pickDiscard(v: GameView): Tile {
  const okey = v.hand.okey;
  const rules = v.rules;
  const me = v.players.find((p) => p.seat === v.mySeat)!;
  const hand = v.myHand;
  const best = new Set(suggestBestMelds(hand, okey, rules).melds.flatMap((m) => m.tileIds));
  const pairs = suggestPairs(hand, okey, rules).filter((p) => p.every((id) => !isJoker(hand.find((t) => t.id === id)!, okey)));
  const goPairs = !me.opened && rules.allowPairOpening && pairs.length >= Math.max(3, v.hand.requiredPairCount - 2);
  const pairIds = new Set(pairs.flat());
  const faces = hand.filter((t) => !isJoker(t, okey)).map((t) => ({ t, f: effectiveFace(t, okey) }));

  const score = (t: Tile): number => {
    if (isJoker(t, okey)) return 1e6;
    const f = effectiveFace(t, okey);
    // İşlek taş atmak cezalı: asla atma
    if (playableTargets([t], v.hand.melds, okey, rules)[t.id] || v.hand.melds.some((m) => replaceJokerInMeld(m, t, okey).ok)) return 1e5;
    let s = 0;
    if (best.has(t.id)) s += 1000;
    if (goPairs && pairIds.has(t.id)) s += 900;
    for (const o of faces) {
      if (o.t.id === t.id) continue;
      if (o.f.color === f.color) {
        const d = Math.abs(o.f.value - f.value);
        if (d === 1) s += 60;
        else if (d === 2) s += 30;
        else if (d === 0) s += goPairs ? 80 : 10;
      } else if (o.f.value === f.value) s += 50;
    }
    // Açmadan önce yüksek taş değerli (101'e katkı); açtıktan sonra elde kalan ceza → yüksek taşı at.
    s += me.opened ? -f.value * 2 : f.value * 2;
    return s;
  };
  return hand.slice().sort((a, b) => score(a) - score(b))[0];
}
