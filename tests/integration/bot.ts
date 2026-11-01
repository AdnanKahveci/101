import {
  calculateOpeningPoints,
  isJoker,
  tilesMap,
  playableTargets,
  suggestBestMelds,
  suggestPairs,
  tilesInPotentialMelds,
  type GameAction,
  type Tile,
} from "@/engine";
import type { ClientGameView } from "@/server/game-service";
import type { TestClient } from "./env";

export interface BotStats {
  opens: number;
  pairOpens: number;
  adds: number;
  finishes: number;
  commands: number;
}

/**
 * Yalnızca kendi görünümünü (kendi taşları + kamuya açık masa) kullanan basit oyuncu.
 * Yardımlı moddaki öneri algoritmalarını kullanır; her hamle sunucuda doğrulanır.
 */
export async function botTurn(client: TestClient, stats: BotStats): Promise<void> {
  const send = async (action: GameAction) => {
    const res = await client.command(action);
    stats.commands++;
    if (res.t === "nack") throw new Error(`Bot hamlesi reddedildi (${action.type}): ${res.error}`);
    await client.waitForVersion(res.version);
    return client.view!;
  };
  let v: ClientGameView = client.view!;
  if (v.phase === "handResult") {
    if (!v.readyForNext.includes(v.mySeat!)) await send({ type: "READY_NEXT_HAND" });
    return;
  }
  if (v.phase !== "playing" || v.hand.currentTurn !== v.mySeat) return;
  const seat = v.mySeat!;
  if (v.hand.turnPhase === "awaitingDraw") v = await send({ type: "DRAW_TILE" });

  const okey = v.hand.okey;
  const rules = v.rules;
  const me = () => v.players.find((p) => p.seat === seat)!;

  if (!me().opened) {
    let melds = suggestBestMelds(v.myHand, okey, rules).melds;
    const used = () => melds.reduce((n, m) => n + m.tileIds.length, 0);
    while (melds.length && used() >= v.myHand.length) melds = melds.slice(0, -1);
    const calc = calculateOpeningPoints(melds, tilesMap(v.myHand), okey, rules);
    const total = calc.ok ? calc.value.total : 0;
    if (rules.allowRunOpening && melds.length && total >= v.hand.requiredRunPoints) {
      v = await send({ type: "OPEN_MELDS", melds });
      stats.opens++;
    } else if (rules.allowPairOpening) {
      let pairs = suggestPairs(v.myHand, okey, rules);
      while (pairs.length * 2 >= v.myHand.length) pairs = pairs.slice(0, -1);
      if (pairs.length >= v.hand.requiredPairCount) {
        v = await send({ type: "OPEN_PAIRS", pairs });
        stats.pairOpens++;
      }
    }
  } else if (me().opened!.kind === "melds") {
    // Açıkken yeni perler ve işleme
    const best = suggestBestMelds(v.myHand, okey, rules);
    const usedCount = best.melds.reduce((s, m) => s + m.tileIds.length, 0);
    if (best.melds.length && usedCount < v.myHand.length) v = await send({ type: "OPEN_MELDS", melds: best.melds });
  }
  // İşlenebilir taşları işle (bir taş bırakarak)
  if (me().opened && (me().opened!.kind === "melds" || rules.pairOpenerCanAddToMelds)) {
    for (let guard = 0; guard < 10 && v.myHand.length > 1; guard++) {
      const targets = playableTargets(v.myHand.filter((t) => !isJoker(t, okey)), v.hand.melds, okey, rules);
      const entry = Object.entries(targets)[0];
      if (!entry) break;
      v = await send({ type: "ADD_TO_MELD", tileId: entry[0], meldId: entry[1][0] });
      stats.adds++;
    }
  }
  // At / bit
  if (v.myHand.length === 1) {
    if (me().opened) {
      await send({ type: "FINISH_HAND", tileId: v.myHand[0].id });
      stats.finishes++;
      return;
    }
  }
  await send({ type: "DISCARD_TILE", tileId: pickDiscard(v).id });
}

function pickDiscard(v: ClientGameView): Tile {
  const okey = v.hand.okey;
  const keep = tilesInPotentialMelds(v.myHand, okey, v.rules);
  const playable = playableTargets(v.myHand, v.hand.melds, okey, v.rules);
  const candidates = v.myHand.filter((t) => !isJoker(t, okey) && !playable[t.id]);
  const loose = candidates.filter((t) => !keep.has(t.id));
  const pool = loose.length ? loose : candidates.length ? candidates : v.myHand;
  return pool.slice().sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
}
