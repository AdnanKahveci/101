/**
 * Yardımlı mod algoritmaları. YALNIZCA oyuncunun kendi taşlarını ve kamuya açık masa bilgisini kullanır.
 */
import { addTileToMeld, validateMeld } from "./melds";
import { effectiveFace, isJoker } from "./tiles";
import { COLORS, type Color, type Face, type MeldSpec, type RuleProfile, type TableMeld, type Tile, type TileId } from "./types";

interface Candidate {
  kind: "run" | "group";
  faces: Face[]; // doğal taş yüzleri
  jokers: number;
  points: number;
}

const key = (f: Face) => `${f.color}:${f.value}`;

function buildCandidates(naturals: Tile[], jokerCount: number, okey: Face, rules: RuleProfile): Candidate[] {
  const count = new Map<string, number>();
  for (const t of naturals) {
    const k = key(effectiveFace(t, okey));
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const has = (c: Color, v: number) => (count.get(`${c}:${v === 14 ? 1 : v}`) ?? 0) > 0;
  const out: Candidate[] = [];
  const maxEnd = rules.allowThirteenOne ? 14 : 13;
  for (const color of COLORS) {
    for (let s = 1; s <= maxEnd - 2; s++) {
      for (let len = 3; s + len - 1 <= maxEnd && len <= 13; len++) {
        if (s === 1 && s + len - 1 === 14) continue;
        const faces: Face[] = [];
        let missing = 0;
        let points = 0;
        for (let v = s; v < s + len; v++) {
          points += v === 14 ? rules.aceAfterThirteenPoints : v;
          if (has(color, v)) faces.push({ color, value: v === 14 ? 1 : v });
          else missing++;
        }
        if (missing > jokerCount) break;
        if (faces.length === 0) continue;
        out.push({ kind: "run", faces, jokers: missing, points });
      }
    }
  }
  for (let v = 1; v <= 13; v++) {
    const present = COLORS.filter((c) => has(c, v));
    const subsets = (1 << present.length) - 1;
    for (let mask = 1; mask <= subsets; mask++) {
      const cols = present.filter((_, i) => mask & (1 << i));
      for (let j = 0; j <= jokerCount; j++) {
        const size = cols.length + j;
        if (size < 3 || size > 4) continue;
        out.push({ kind: "group", faces: cols.map((c) => ({ color: c, value: v })), jokers: j, points: v * size });
      }
    }
  }
  return out.sort((a, b) => b.points - a.points);
}

/** Elde açılabilecek en yüksek puanlı per kombinasyonunu bulur. */
export function suggestBestMelds(hand: Tile[], okey: Face, rules: RuleProfile): { melds: MeldSpec[]; total: number } {
  const naturals = hand.filter((t) => !isJoker(t, okey));
  const jokerTiles = hand.filter((t) => isJoker(t, okey));
  const cands = buildCandidates(naturals, jokerTiles.length, okey, rules);
  const avail = new Map<string, number>();
  for (const t of naturals) {
    const k = key(effectiveFace(t, okey));
    avail.set(k, (avail.get(k) ?? 0) + 1);
  }
  let best: Candidate[] = [];
  let bestPoints = 0;
  let iterations = 0;
  const chosen: Candidate[] = [];
  const dfs = (start: number, points: number, jokersLeft: number) => {
    if (++iterations > 40000) return;
    if (points > bestPoints) {
      bestPoints = points;
      best = chosen.slice();
    }
    for (let i = start; i < cands.length; i++) {
      const c = cands[i];
      if (c.jokers > jokersLeft) continue;
      if (!c.faces.every((f) => (avail.get(key(f)) ?? 0) > 0)) continue;
      c.faces.forEach((f) => avail.set(key(f), avail.get(key(f))! - 1));
      chosen.push(c);
      dfs(i + 1, points + c.points, jokersLeft - c.jokers);
      chosen.pop();
      c.faces.forEach((f) => avail.set(key(f), avail.get(key(f))! + 1));
    }
  };
  dfs(0, 0, jokerTiles.length);

  // Somut taş kimliklerine dönüştür ve motorun doğrulayıcısıyla teyit et.
  const pool = naturals.slice();
  const jpool = jokerTiles.slice();
  const melds: MeldSpec[] = [];
  let total = 0;
  for (const c of best) {
    const ids: TileId[] = [];
    for (const f of c.faces) {
      const idx = pool.findIndex((t) => key(effectiveFace(t, okey)) === key(f));
      ids.push(pool[idx].id);
      pool.splice(idx, 1);
    }
    for (let j = 0; j < c.jokers; j++) ids.push(jpool.shift()!.id);
    const tiles = ids.map((id) => hand.find((t) => t.id === id)!);
    const r = validateMeld(tiles, okey, rules, { kind: c.kind });
    if (!r.ok) continue;
    melds.push({ tileIds: r.value.cells.map((cell) => cell.tileId), kind: c.kind });
    total += r.value.points;
  }
  return { melds, total };
}

/** Eldeki olası çiftler (önce doğal çiftler, sonra okeyle tamamlananlar). */
export function suggestPairs(hand: Tile[], okey: Face, rules: RuleProfile): [TileId, TileId][] {
  const naturals = hand.filter((t) => !isJoker(t, okey));
  const jokers = hand.filter((t) => isJoker(t, okey));
  const byFace = new Map<string, Tile[]>();
  for (const t of naturals) {
    const k = key(effectiveFace(t, okey));
    byFace.set(k, [...(byFace.get(k) ?? []), t]);
  }
  const pairs: [TileId, TileId][] = [];
  const singles: Tile[] = [];
  for (const tiles of byFace.values()) {
    if (tiles.length >= 2) pairs.push([tiles[0].id, tiles[1].id]);
    else singles.push(tiles[0]);
  }
  if (rules.allowJokerPair) {
    singles.sort((a, b) => effectiveFace(b, okey).value - effectiveFace(a, okey).value);
    for (const j of jokers) {
      const s = singles.shift();
      if (!s) break;
      pairs.push([s.id, j.id]);
    }
  }
  return pairs;
}

/** Eldeki her taş için işlenebileceği perlerin listesi. */
export function playableTargets(hand: Tile[], melds: TableMeld[], okey: Face, rules: RuleProfile): Record<TileId, string[]> {
  const out: Record<TileId, string[]> = {};
  for (const t of hand) {
    const targets = melds.filter((m) => addTileToMeld(m, t, okey, rules).ok).map((m) => m.id);
    if (targets.length > 0) out[t.id] = targets;
  }
  return out;
}

/** Potansiyel seri/grup oluşturan taşları vurgulamak için: en az bir adayın parçası olan taş kimlikleri. */
export function tilesInPotentialMelds(hand: Tile[], okey: Face, rules: RuleProfile): Set<TileId> {
  const best = suggestBestMelds(hand, okey, rules);
  return new Set(best.melds.flatMap((m) => m.tileIds));
}

/** Istaka sıralama: renge göre veya sayıya göre. */
export function sortHand(hand: Tile[], okey: Face, mode: "color" | "value"): Tile[] {
  const colorIdx = (t: Tile) => (t.isFakeJoker ? COLORS.indexOf(okey.color) : COLORS.indexOf(t.color as Color));
  const val = (t: Tile) => effectiveFace(t, okey).value;
  return hand.slice().sort((a, b) => {
    const ja = isJoker(a, okey) ? 1 : 0;
    const jb = isJoker(b, okey) ? 1 : 0;
    if (ja !== jb) return ja - jb;
    if (mode === "color") return colorIdx(a) - colorIdx(b) || val(a) - val(b) || a.id.localeCompare(b.id);
    return val(a) - val(b) || colorIdx(a) - colorIdx(b) || a.id.localeCompare(b.id);
  });
}
