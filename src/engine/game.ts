import { createRng, shuffle, type Rng } from "./rng";
import { createTileSet, isJoker, okeyFromIndicator, describeTile, tileById } from "./tiles";
import {
  addTileToMeld,
  calculateOpeningPoints,
  isPlayableOnTable,
  replaceJokerInMeld,
  validateMeld,
  validatePairs,
} from "./melds";
import { calculateHandScore } from "./scoring";
import {
  SEATS,
  type GameAction,
  type GameEvent,
  type GameState,
  type HandState,
  type PlayerInfo,
  type Result,
  type RuleProfile,
  type Seat,
  type TableMeld,
  type Tile,
  type TileId,
  type FinishType,
} from "./types";

/** El sonucu ekranından sonra otomatik devam süresi. */
export const NEXT_HAND_AUTO_MS = 90_000;

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}
export function prevSeat(seat: Seat): Seat {
  return ((seat + 3) % 4) as Seat;
}
export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}
export function teamOf(seat: Seat): 0 | 1 {
  return (seat % 2) as 0 | 1;
}

function emptySeatRecord<T>(make: () => T): Record<Seat, T> {
  return { 0: make(), 1: make(), 2: make(), 3: make() };
}

/** Bir eli dağıtır. rng deterministiktir; üretimde seed sunucuda kriptografik olarak üretilir. */
export function dealHand(rules: RuleProfile, handNumber: number, dealer: Seat, rng: Rng, now: number): HandState {
  const deck = shuffle(createTileSet(), rng);
  const firstPlayer = nextSeat(dealer);
  const hands = emptySeatRecord<Tile[]>(() => []);
  // İlk oyuncuya 22, diğerlerine 21 taş.
  let seat = firstPlayer;
  for (let i = 0; i < 4; i++) {
    const count = seat === firstPlayer ? 22 : 21;
    hands[seat] = deck.splice(0, count);
    seat = nextSeat(seat);
  }
  // Gösterge: kalan desteden açılan taş. Sahte okey gösterge olamaz; çıkarsa bir sonraki taş seçilir.
  let indicatorIdx = 0;
  while (deck[indicatorIdx]?.isFakeJoker) indicatorIdx++;
  const [indicator] = deck.splice(indicatorIdx, 1);
  const okey = okeyFromIndicator(indicator);
  return {
    handNumber,
    dealer,
    firstPlayer,
    indicator,
    okey,
    drawPile: deck,
    discards: emptySeatRecord<Tile[]>(() => []),
    hands,
    melds: [],
    pairs: [],
    opened: emptySeatRecord(() => null),
    highestRunOpening: [],
    highestPairOpening: [],
    currentTurn: firstPlayer,
    turnPhase: "awaitingAction", // ilk oyuncu taş çekmeden atar
    turnNumber: 1,
    drawnTileId: null,
    takeObligation: null,
    openedAtTurnStart: false,
    penalties: [],
    turnDeadline: rules.turnSeconds > 0 ? now + rules.turnSeconds * 1000 : null,
    nextMeldSeq: 1,
  };
}

export interface CreateMatchInput {
  matchId: string;
  roomId: string;
  rules: RuleProfile;
  players: PlayerInfo[];
  seed: string;
  now: number;
  startDealer?: Seat;
}

export function createMatch(input: CreateMatchInput): GameState {
  if (input.players.length !== 4) throw new Error("101 Okey dört oyuncu ile oynanır.");
  const seats = new Set(input.players.map((p) => p.seat));
  if (seats.size !== 4) throw new Error("Her koltukta bir oyuncu olmalı.");
  const rng = createRng(`${input.seed}:hand:1`);
  const startDealer = input.startDealer ?? (Math.floor(rng() * 4) as Seat);
  return {
    matchId: input.matchId,
    roomId: input.roomId,
    rules: Object.freeze({ ...input.rules }) as RuleProfile,
    players: [...input.players].sort((a, b) => a.seat - b.seat),
    phase: "playing",
    startDealer,
    hand: dealHand(input.rules, 1, startDealer, createRng(`${input.seed}:deal:1`), input.now),
    handResults: [],
    totals: { 0: 0, 1: 0, 2: 0, 3: 0 },
    readyForNext: [],
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
    winner: null,
  };
}

// ------------------------------------------------------------------ Yardımcılar

function clone<T>(v: T): T {
  return structuredClone(v);
}

function err(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function tilesMap(tiles: Tile[]): Map<TileId, Tile> {
  return new Map(tiles.map((t) => [t.id, t]));
}

/** Seri açılış için gereken minimum puan (katlama ve eş politikası dahil). */
export function requiredRunPoints(state: GameState, seat: Seat): number {
  return requiredOpening(state, seat, "melds");
}
export function requiredPairCount(state: GameState, seat: Seat): number {
  return requiredOpening(state, seat, "pairs");
}

function requiredOpening(state: GameState, seat: Seat, kind: "melds" | "pairs"): number {
  const r = state.rules;
  const base = kind === "melds" ? r.minOpeningPoints : r.minOpeningPairs;
  if (!r.folding) return base;
  let history = kind === "melds" ? state.hand.highestRunOpening : state.hand.highestPairOpening;
  if (r.teamMode) {
    if (r.teamOpeningPolicy === "partnerBase" && state.hand.opened[partnerOf(seat)]) return base;
    if (r.teamOpeningPolicy === "independent") history = history.filter((h) => teamOf(h.seat) !== teamOf(seat));
  }
  if (history.length === 0) return base;
  const highest = Math.max(...history.map((h) => h.value));
  return Math.max(base, highest + 1);
}

function canAddToMelds(state: GameState, seat: Seat): string | null {
  const opened = state.hand.opened[seat];
  if (!opened) return "Taş işlemek için önce elinizi açmalısınız.";
  if (opened.kind === "pairs" && !state.rules.pairOpenerCanAddToMelds)
    return "Bu masada çift açan oyuncu pere taş işleyemez.";
  return null;
}

function removeFromHand(hand: Tile[], ids: TileId[]): Tile[] {
  const set = new Set(ids);
  return hand.filter((t) => !set.has(t.id));
}

function ensureLeavesTile(hand: Tile[], usedIds: TileId[]): string | null {
  return hand.length - usedIds.length < 1 ? "Elinizde atmak için en az bir taş kalmalı." : null;
}

/** Taşın elden kullanılabileceği durum kontrolü: alınan yan taş bu hamlede kullanıldı mı? */
function obligationSatisfied(h: HandState, usedIds: TileId[]): boolean {
  return !!h.takeObligation && usedIds.includes(h.takeObligation.tileId);
}

// ---------------------------------------------------------------- Doğrulama

export interface ApplyContext {
  now: number;
  /** Yeni el dağıtımı için seed (sunucu tarafından sağlanır). */
  seed: string;
}

export interface ApplyOutput {
  state: GameState;
  events: GameEvent[];
}

/**
 * Bir aksiyonu doğrular ve uygular. Saf fonksiyondur: girdi state değiştirilmez.
 * Geçersiz aksiyonda hata döner ve state değişmez.
 */
export function applyAction(
  input: GameState,
  action: GameAction,
  seat: Seat,
  ctx: ApplyContext,
): Result<ApplyOutput> {
  const v = validateAction(input, action, seat, ctx.now);
  if (!v.ok) return v;
  const state = clone(input);
  const events: GameEvent[] = [];
  const h = state.hand;
  const rules = state.rules;
  const hand = () => h.hands[seat];

  switch (action.type) {
    case "DRAW_TILE": {
      const tile = h.drawPile.shift()!;
      h.hands[seat].push(tile);
      h.drawnTileId = tile.id;
      h.turnPhase = "awaitingAction";
      events.push({ type: "TILE_DRAWN", seat, data: { remaining: h.drawPile.length } });
      break;
    }
    case "TAKE_DISCARD": {
      const from = prevSeat(seat);
      const tile = h.discards[from].pop()!;
      h.hands[seat].push(tile);
      h.drawnTileId = tile.id;
      h.takeObligation = { tileId: tile.id, wasOpened: !!h.opened[seat], fromSeat: from };
      h.turnPhase = "awaitingAction";
      events.push({ type: "DISCARD_TAKEN", seat, data: { tile, from } });
      break;
    }
    case "RETURN_DISCARD": {
      const ob = h.takeObligation!;
      const tile = hand().find((t) => t.id === ob.tileId)!;
      h.hands[seat] = removeFromHand(hand(), [tile.id]);
      h.discards[ob.fromSeat].push(tile);
      h.takeObligation = null;
      h.drawnTileId = null;
      h.turnPhase = "awaitingDraw";
      if (rules.penaltiesEnabled && rules.failedTakePenalty > 0) {
        h.penalties.push({ seat, amount: rules.failedTakePenalty, reason: "Yandan alınan taş kullanılamadı", turnNumber: h.turnNumber });
      }
      events.push({ type: "DISCARD_RETURNED", seat, data: { tile, penalty: rules.penaltiesEnabled ? rules.failedTakePenalty : 0 } });
      break;
    }
    case "OPEN_MELDS": {
      const map = tilesMap(hand());
      const r = calculateOpeningPoints(action.melds, map, h.okey, rules);
      if (!r.ok) return r;
      const used = action.melds.flatMap((m) => m.tileIds);
      const wasOpened = !!h.opened[seat];
      for (const res of r.value.resolved) {
        const meld: TableMeld = { id: `m${h.nextMeldSeq++}`, kind: res.kind, owner: seat, cells: res.cells };
        h.melds.push(meld);
      }
      h.hands[seat] = removeFromHand(hand(), used);
      if (!wasOpened) {
        h.opened[seat] = { kind: "melds", value: r.value.total, turnNumber: h.turnNumber };
        h.highestRunOpening.push({ seat, value: r.value.total });
      }
      if (obligationSatisfied(h, used)) h.takeObligation = null;
      events.push({
        type: wasOpened ? "MELDS_LAID" : "HAND_OPENED",
        seat,
        data: { kind: "melds", points: r.value.total, melds: h.melds.slice(-r.value.resolved.length) },
      });
      break;
    }
    case "OPEN_PAIRS": {
      const map = tilesMap(hand());
      const r = validatePairs(action.pairs, map, h.okey, rules);
      if (!r.ok) return r;
      const used = action.pairs.flat();
      const wasOpened = !!h.opened[seat];
      for (const p of r.value) {
        h.pairs.push({ id: `p${h.nextMeldSeq++}`, owner: seat, tileIds: p.tileIds, face: p.face });
      }
      h.hands[seat] = removeFromHand(hand(), used);
      if (!wasOpened) {
        h.opened[seat] = { kind: "pairs", value: r.value.length, turnNumber: h.turnNumber };
        h.highestPairOpening.push({ seat, value: r.value.length });
      }
      if (obligationSatisfied(h, used)) h.takeObligation = null;
      events.push({
        type: wasOpened ? "PAIRS_LAID" : "HAND_OPENED",
        seat,
        data: { kind: "pairs", count: r.value.length, pairs: h.pairs.slice(-r.value.length) },
      });
      break;
    }
    case "ADD_TO_MELD": {
      const meld = h.melds.find((m) => m.id === action.meldId)!;
      const tile = hand().find((t) => t.id === action.tileId)!;
      const r = addTileToMeld(meld, tile, h.okey, rules, action.side);
      if (!r.ok) return r;
      meld.cells = r.value;
      h.hands[seat] = removeFromHand(hand(), [tile.id]);
      if (obligationSatisfied(h, [tile.id])) h.takeObligation = null;
      events.push({ type: "TILE_ADDED", seat, data: { meldId: meld.id, tile, cells: meld.cells } });
      break;
    }
    case "REPLACE_JOKER": {
      const meld = h.melds.find((m) => m.id === action.meldId)!;
      const tile = hand().find((t) => t.id === action.tileId)!;
      const r = replaceJokerInMeld(meld, tile, h.okey);
      if (!r.ok) return r;
      const jokerTile = tileById(r.value.jokerTileId);
      meld.cells = r.value.cells;
      let newHand = removeFromHand(hand(), [tile.id]);
      const used: TileId[] = [tile.id];
      // Geri alınan okey aynı hamlede kullanılmak zorunda (atomik işlem).
      const use = action.jokerUse;
      if (use.type === "addToMeld") {
        const target = h.melds.find((m) => m.id === use.meldId);
        if (!target) return err("Okeyin işleneceği per bulunamadı.");
        const ar = addTileToMeld(target, jokerTile, h.okey, rules, use.side);
        if (!ar.ok) return ar;
        target.cells = ar.value;
      } else {
        if (!use.meld.tileIds.includes(jokerTile.id)) return err("Yeni per geri alınan okeyi içermeli.");
        const map = tilesMap([...newHand, jokerTile]);
        const tiles: Tile[] = [];
        for (const id of use.meld.tileIds) {
          const t = map.get(id);
          if (!t) return err("Elinizde olmayan bir taş seçildi.");
          tiles.push(t);
        }
        const mr = validateMeld(tiles, h.okey, rules, { kind: use.meld.kind, jokerFaces: use.meld.jokerFaces });
        if (!mr.ok) return mr;
        const others = use.meld.tileIds.filter((id) => id !== jokerTile.id);
        if (newHand.length - others.length < 1) return err("Elinizde atmak için en az bir taş kalmalı.");
        newHand = removeFromHand(newHand, others);
        used.push(...others);
        h.melds.push({ id: `m${h.nextMeldSeq++}`, kind: mr.value.kind, owner: seat, cells: mr.value.cells });
      }
      h.hands[seat] = newHand;
      if (obligationSatisfied(h, used)) h.takeObligation = null;
      events.push({ type: "JOKER_REPLACED", seat, data: { meldId: meld.id, tile } });
      break;
    }
    case "DISCARD_TILE":
    case "FINISH_HAND": {
      const tile = hand().find((t) => t.id === action.tileId)!;
      const finishing = hand().length === 1;
      const jokerDiscard = isJoker(tile, h.okey);
      if (rules.penaltiesEnabled && !finishing) {
        if (jokerDiscard && rules.discardJokerPenalty > 0) {
          h.penalties.push({ seat, amount: rules.discardJokerPenalty, reason: "Okey atıldı", turnNumber: h.turnNumber });
        } else if (!jokerDiscard && rules.discardPlayablePenalty > 0 && isPlayableOnTable(tile, h.melds, h.okey, rules)) {
          h.penalties.push({ seat, amount: rules.discardPlayablePenalty, reason: `İşlek taş atıldı (${describeTile(tile)})`, turnNumber: h.turnNumber });
        }
      }
      h.hands[seat] = removeFromHand(hand(), [tile.id]);
      h.discards[seat].push(tile);
      events.push({ type: "TILE_DISCARDED", seat, data: { tile } });
      if (finishing) {
        const opened = h.opened[seat]!;
        let finishType: FinishType;
        const handFinish = !h.openedAtTurnStart;
        if (handFinish) finishType = jokerDiscard ? "handJoker" : "hand";
        else if (jokerDiscard) finishType = "joker";
        else if (opened.kind === "pairs") finishType = "pairs";
        else finishType = "normal";
        endHand(state, seat, finishType, events, ctx);
      } else if (h.drawPile.length === 0) {
        endHand(state, null, "deckExhausted", events, ctx);
      } else {
        advanceTurn(state, ctx.now);
        events.push({ type: "TURN_CHANGED", seat: h.currentTurn, data: {} });
      }
      break;
    }
    case "READY_NEXT_HAND": {
      if (!state.readyForNext.includes(seat)) state.readyForNext.push(seat);
      events.push({ type: "PLAYER_READY_NEXT", seat, data: {} });
      if (state.readyForNext.length === 4) startNextHand(state, ctx, events);
      break;
    }
    case "TIMEOUT": {
      if (state.phase === "handResult") {
        events.push({ type: "AUTO_NEXT_HAND", seat: null, data: {} });
        startNextHand(state, ctx, events);
        break;
      }
      return applyTimeout(input, seat, ctx);
    }
  }
  state.version += 1;
  state.updatedAt = ctx.now;
  return { ok: true, value: { state, events } };
}

/** Sırayı bir sonraki oyuncuya geçirir. */
export function advanceTurn(state: GameState, now: number): void {
  const h = state.hand;
  h.currentTurn = nextSeat(h.currentTurn);
  h.turnPhase = "awaitingDraw";
  h.turnNumber += 1;
  h.drawnTileId = null;
  h.takeObligation = null;
  h.openedAtTurnStart = !!h.opened[h.currentTurn];
  h.turnDeadline = state.rules.turnSeconds > 0 ? now + state.rules.turnSeconds * 1000 : null;
}

function endHand(state: GameState, finisher: Seat | null, finishType: FinishType, events: GameEvent[], ctx: ApplyContext) {
  const result = calculateHandScore(state, state.rules, { finisher, finishType });
  state.handResults.push(result);
  for (const s of SEATS) state.totals[s] += result.playerScores[s];
  if (state.rules.silerEnabled && finisher !== null && (finishType === "handJoker" || finishType === "hand")) {
    // Siler: elden biten oyuncu (eşliyse takımı) maç boyunca biriken pozitif cezalarını siler.
    const seatsToClear = state.rules.teamMode ? [finisher, partnerOf(finisher)] : [finisher];
    for (const s of seatsToClear) {
      if (state.totals[s] > 0) {
        result.reasons.push(`Siler: ${state.players[s].displayName} oyuncusunun ${state.totals[s]} puanlık toplamı silindi.`);
        state.totals[s] = 0;
      }
    }
  }
  // El sonucu ekranında bağlantısı kopan oyuncu maçı kilitlemesin: süre dolunca sonraki el başlar.
  state.hand.turnDeadline = ctx.now + NEXT_HAND_AUTO_MS;
  state.readyForNext = [];
  events.push({ type: "HAND_FINISHED", seat: finisher, data: { result } });
  if (state.handResults.length >= state.rules.totalHands) {
    finishMatch(state);
    events.push({ type: "MATCH_FINISHED", seat: null, data: { winner: state.winner, totals: state.totals } });
  } else {
    state.phase = "handResult";
  }
}

/** Maçı bitirir ve kazananı belirler (en düşük toplam ceza kazanır). */
export function finishMatch(state: GameState): void {
  state.phase = "finished";
  if (state.rules.teamMode) {
    const t0 = state.totals[0] + state.totals[2];
    const t1 = state.totals[1] + state.totals[3];
    if (t0 === t1) state.winner = { seats: [0, 1, 2, 3], team: null };
    else state.winner = t0 < t1 ? { seats: [0, 2], team: 0 } : { seats: [1, 3], team: 1 };
  } else {
    const min = Math.min(...SEATS.map((s) => state.totals[s]));
    state.winner = { seats: SEATS.filter((s) => state.totals[s] === min), team: null };
  }
}

function startNextHand(state: GameState, ctx: ApplyContext, events: GameEvent[]) {
  const handNumber = state.handResults.length + 1;
  const dealer = ((state.startDealer + handNumber - 1) % 4) as Seat;
  state.hand = dealHand(state.rules, handNumber, dealer, createRng(`${ctx.seed}:deal:${handNumber}`), ctx.now);
  state.phase = "playing";
  state.readyForNext = [];
  events.push({ type: "HAND_STARTED", seat: state.hand.firstPlayer, data: { handNumber, dealer } });
}

/**
 * Süre aşımı: yasadışı veya rastgele hamle üretilmez.
 * autoPlay politikasında deterministik ve her zaman yasal olan "desteden çek + çekilen taşı at" uygulanır.
 */
function applyTimeout(input: GameState, seat: Seat, ctx: ApplyContext): Result<ApplyOutput> {
  let state = input;
  const events: GameEvent[] = [{ type: "TURN_TIMEOUT", seat, data: {} }];
  const step = (a: GameAction): Result<void> => {
    const r = applyAction(state, a, seat, { ...ctx, now: ctx.now });
    if (!r.ok) return r;
    state = r.value.state;
    events.push(...r.value.events);
    return { ok: true, value: undefined };
  };
  if (state.hand.takeObligation) {
    const r = step({ type: "RETURN_DISCARD" });
    if (!r.ok) return r;
  }
  if (state.hand.turnPhase === "awaitingDraw") {
    const r = step({ type: "DRAW_TILE" });
    if (!r.ok) return r;
  }
  const h = state.hand;
  const myHand = h.hands[seat];
  let discard = myHand.find((t) => t.id === h.drawnTileId);
  if (!discard || (isJoker(discard, h.okey) && myHand.length > 1)) {
    // İlk oyuncu (çekmeden başlar) veya çekilen okey: okey olmayan en yüksek taşı at.
    const nonJokers = myHand.filter((t) => !isJoker(t, h.okey));
    discard = nonJokers.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.id.localeCompare(b.id))[0] ?? myHand[0];
  }
  const r = step({ type: myHand.length === 1 ? "FINISH_HAND" : "DISCARD_TILE", tileId: discard.id });
  if (!r.ok) return r;
  return { ok: true, value: { state, events } };
}

/** Aksiyonun geçerli olup olmadığını kontrol eder (state değiştirmez). */
export function validateAction(state: GameState, action: GameAction, seat: Seat, now: number): Result<true> {
  const h = state.hand;
  const r = state.rules;
  if (action.type === "READY_NEXT_HAND") {
    if (state.phase !== "handResult") return err("Şu an sonraki ele hazır olunamaz.");
    if (state.readyForNext.includes(seat)) return err("Zaten hazırsınız.");
    return { ok: true, value: true };
  }
  if (action.type === "TIMEOUT" && state.phase === "handResult") {
    if (h.turnDeadline === null || now < h.turnDeadline) return err("Bekleme süresi henüz dolmadı.");
    return { ok: true, value: true };
  }
  if (state.phase !== "playing") return err("El şu anda oynanmıyor.");
  if (h.currentTurn !== seat) return err("Sıra sizde değil.");
  const myHand = h.hands[seat];
  const has = (id: TileId) => myHand.some((t) => t.id === id);

  switch (action.type) {
    case "TIMEOUT":
      if (r.timeoutPolicy !== "autoPlay") return err("Bu masada süre aşımında otomatik hamle yapılmaz.");
      if (h.turnDeadline === null || now < h.turnDeadline) return err("Hamle süresi henüz dolmadı.");
      return { ok: true, value: true };
    case "DRAW_TILE":
      if (h.turnPhase !== "awaitingDraw") return err("Bu turda zaten taş aldınız.");
      if (h.drawPile.length === 0) return err("Destede taş kalmadı.");
      return { ok: true, value: true };
    case "TAKE_DISCARD": {
      if (h.turnPhase !== "awaitingDraw") return err("Bu turda zaten taş aldınız.");
      const pile = h.discards[prevSeat(seat)];
      if (pile.length === 0) return err("Alınabilecek atılmış taş yok.");
      return { ok: true, value: true };
    }
    case "RETURN_DISCARD":
      if (!h.takeObligation) return err("Geri bırakılacak yandan alınmış taş yok.");
      return { ok: true, value: true };
    case "OPEN_MELDS": {
      if (h.turnPhase !== "awaitingAction") return err("Önce taş çekmelisiniz.");
      if (!r.allowRunOpening) return err("Bu masada seri açılış kapalı.");
      if (action.melds.length === 0) return err("En az bir per seçmelisiniz.");
      const ids = action.melds.flatMap((m) => m.tileIds);
      if (ids.some((id) => !has(id))) return err("Elinizde olmayan bir taş seçildi.");
      const leave = ensureLeavesTile(myHand, ids);
      if (leave) return err(leave);
      const opened = h.opened[seat];
      if (opened?.kind === "pairs" && !r.pairOpenerCanOpenMelds) return err("Çift açan oyuncu bu masada seri per açamaz.");
      const calc = calculateOpeningPoints(action.melds, tilesMap(myHand), h.okey, r);
      if (!calc.ok) return calc;
      if (!opened) {
        const need = requiredRunPoints(state, seat);
        if (calc.value.total < need) return err(`Açılış için en az ${need} puan gerekiyor (seçilen: ${calc.value.total}).`);
      }
      if (h.takeObligation && !ids.includes(h.takeObligation.tileId) && !opened) {
        return err("Yandan aldığınız taşı açılışta kullanmalısınız.");
      }
      return { ok: true, value: true };
    }
    case "OPEN_PAIRS": {
      if (h.turnPhase !== "awaitingAction") return err("Önce taş çekmelisiniz.");
      if (!r.allowPairOpening) return err("Bu masada çift açılış kapalı.");
      if (action.pairs.length === 0) return err("En az bir çift seçmelisiniz.");
      const ids = action.pairs.flat();
      if (ids.some((id) => !has(id))) return err("Elinizde olmayan bir taş seçildi.");
      const leave = ensureLeavesTile(myHand, ids);
      if (leave) return err(leave);
      const opened = h.opened[seat];
      if (opened?.kind === "melds" && !r.meldOpenerCanOpenPairs) return err("Seri açan oyuncu bu masada çift açamaz.");
      const pv = validatePairs(action.pairs, tilesMap(myHand), h.okey, r);
      if (!pv.ok) return pv;
      if (!opened) {
        const need = requiredPairCount(state, seat);
        if (action.pairs.length < need) return err(`Çift açılış için en az ${need} çift gerekiyor (seçilen: ${action.pairs.length}).`);
      }
      if (h.takeObligation && !ids.includes(h.takeObligation.tileId) && !opened) {
        return err("Yandan aldığınız taşı açılışta kullanmalısınız.");
      }
      return { ok: true, value: true };
    }
    case "ADD_TO_MELD": {
      if (h.turnPhase !== "awaitingAction") return err("Önce taş çekmelisiniz.");
      const block = canAddToMelds(state, seat);
      if (block) return err(block);
      if (!has(action.tileId)) return err("Elinizde olmayan bir taş seçildi.");
      const leave = ensureLeavesTile(myHand, [action.tileId]);
      if (leave) return err(leave);
      const meld = h.melds.find((m) => m.id === action.meldId);
      if (!meld) return err("Per bulunamadı.");
      const tile = myHand.find((t) => t.id === action.tileId)!;
      const ar = addTileToMeld(meld, tile, h.okey, r, action.side);
      if (!ar.ok) return ar;
      return { ok: true, value: true };
    }
    case "REPLACE_JOKER": {
      if (h.turnPhase !== "awaitingAction") return err("Önce taş çekmelisiniz.");
      if (r.jokerReplacePolicy === "disabled") return err("Bu masada okey değiştirme kapalı.");
      const block = canAddToMelds(state, seat);
      if (block) return err(block);
      if (!has(action.tileId)) return err("Elinizde olmayan bir taş seçildi.");
      const meld = h.melds.find((m) => m.id === action.meldId);
      if (!meld) return err("Per bulunamadı.");
      const tile = myHand.find((t) => t.id === action.tileId)!;
      const rr = replaceJokerInMeld(meld, tile, h.okey);
      if (!rr.ok) return rr;
      // Kalan kontroller (okeyin kullanımı) applyAction içinde atomik olarak yapılır.
      return { ok: true, value: true };
    }
    case "DISCARD_TILE":
    case "FINISH_HAND": {
      if (h.turnPhase !== "awaitingAction") return err("Taş atmadan önce taş çekmelisiniz.");
      if (!has(action.tileId)) return err("Elinizde olmayan bir taş seçildi.");
      if (h.takeObligation) {
        return err(
          h.takeObligation.wasOpened
            ? "Yandan aldığınız taşı bir pere işlemeli veya yeni perde kullanmalısınız."
            : "Yandan aldığınız taşla elinizi açmalısınız; açamıyorsanız taşı geri bırakın.",
        );
      }
      const finishing = myHand.length === 1;
      if (action.type === "FINISH_HAND" && !finishing) return err("Bitmek için elinizde yalnızca bir taş kalmalı.");
      if (finishing && !h.opened[seat]) return err("Açmadan bitemezsiniz.");
      return { ok: true, value: true };
    }
  }
}

/** Oyuncunun şu an yapabileceği aksiyon türleri (yalnızca kamuya açık bilgilerle). */
export function getLegalActions(state: GameState, seat: Seat): GameAction["type"][] {
  if (state.phase === "handResult") return state.readyForNext.includes(seat) ? [] : ["READY_NEXT_HAND"];
  if (state.phase !== "playing" || state.hand.currentTurn !== seat) return [];
  const h = state.hand;
  const r = state.rules;
  const out: GameAction["type"][] = [];
  if (h.turnPhase === "awaitingDraw") {
    if (h.drawPile.length > 0) out.push("DRAW_TILE");
    if (h.discards[prevSeat(seat)].length > 0) out.push("TAKE_DISCARD");
    return out;
  }
  const opened = h.opened[seat];
  if (h.takeObligation) out.push("RETURN_DISCARD");
  if (r.allowRunOpening && (!opened || opened.kind === "melds" || r.pairOpenerCanOpenMelds)) out.push("OPEN_MELDS");
  if (r.allowPairOpening && (!opened || opened.kind === "pairs" || r.meldOpenerCanOpenPairs)) out.push("OPEN_PAIRS");
  if (opened && (opened.kind === "melds" || r.pairOpenerCanAddToMelds) && h.melds.length > 0) {
    out.push("ADD_TO_MELD");
    if (r.jokerReplacePolicy !== "disabled" && h.melds.some((m) => m.cells.some((c) => c.isJoker))) out.push("REPLACE_JOKER");
  }
  if (!h.takeObligation) {
    out.push("DISCARD_TILE");
    if (h.hands[seat].length === 1 && opened) out.push("FINISH_HAND");
  }
  return out;
}
