import {
  createMatch,
  createTileSet,
  DEFAULT_RULES,
  okeyFromIndicator,
  tileById,
  type GameState,
  type RuleProfile,
  type Seat,
  type Tile,
} from "@/engine";

export const players = [0, 1, 2, 3].map((s) => ({
  seat: s as Seat,
  userId: `u${s}`,
  displayName: `Oyuncu${s}`,
}));

export function newMatch(rules: Partial<RuleProfile> = {}, seed = "test-seed"): GameState {
  return createMatch({
    matchId: "m1",
    roomId: "r1",
    rules: { ...DEFAULT_RULES, turnSeconds: 0, ...rules },
    players,
    seed,
    now: 1000,
    startDealer: 3, // ilk oyuncu koltuk 0
  });
}

export const T = (id: string): Tile => tileById(id);

/**
 * Elleri, göstergeyi ve desteyi elle belirleyerek test senaryosu kurar.
 * Belirtilmeyen taşlar desteye konur; böylece 106 taşın korunumu sağlanır.
 */
export function scenario(opts: {
  rules?: Partial<RuleProfile>;
  indicator: string;
  hands: Partial<Record<Seat, string[]>>;
  drawPile?: string[];
  currentTurn?: Seat;
  turnPhase?: "awaitingDraw" | "awaitingAction";
  discards?: Partial<Record<Seat, string[]>>;
}): GameState {
  const s = newMatch(opts.rules);
  const used = new Set<string>([opts.indicator]);
  const hands: Record<Seat, Tile[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    for (const id of opts.hands[seat] ?? []) {
      if (used.has(id)) throw new Error(`Taş iki kez kullanıldı: ${id}`);
      used.add(id);
      hands[seat].push(T(id));
    }
  }
  const discards: Record<Seat, Tile[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    for (const id of opts.discards?.[seat] ?? []) {
      if (used.has(id)) throw new Error(`Taş iki kez kullanıldı: ${id}`);
      used.add(id);
      discards[seat].push(T(id));
    }
  }
  const explicitPile = (opts.drawPile ?? []).map((id) => {
    if (used.has(id)) throw new Error(`Taş iki kez kullanıldı: ${id}`);
    used.add(id);
    return T(id);
  });
  const rest = createTileSet().filter((t) => !used.has(t.id));
  const indicator = T(opts.indicator);
  s.hand = {
    ...s.hand,
    indicator,
    okey: okeyFromIndicator(indicator),
    hands,
    discards,
    drawPile: opts.drawPile ? [...explicitPile, ...rest] : rest,
    currentTurn: opts.currentTurn ?? 0,
    turnPhase: opts.turnPhase ?? "awaitingAction",
    openedAtTurnStart: false,
  };
  return s;
}

export const ctx = { now: 2000, seed: "ctx-seed" };

export function countAllTiles(s: GameState): string[] {
  const h = s.hand;
  const ids: string[] = [h.indicator.id, ...h.drawPile.map((t) => t.id)];
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    ids.push(...h.hands[seat].map((t) => t.id), ...h.discards[seat].map((t) => t.id));
  }
  for (const m of h.melds) ids.push(...m.cells.map((c) => c.tileId));
  for (const p of h.pairs) ids.push(...p.tileIds);
  return ids;
}
