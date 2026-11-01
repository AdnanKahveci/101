import { effectiveFace, isJoker, sameFace, describeTile } from "./tiles";
import {
  COLORS,
  type Color,
  type Face,
  type MeldCell,
  type MeldKind,
  type MeldSpec,
  type Result,
  type RuleProfile,
  type TableMeld,
  type Tile,
  type TileId,
} from "./types";

export interface ResolvedMeld {
  kind: MeldKind;
  cells: MeldCell[];
  points: number;
}

/** Hücrenin puan değeri (13'ten sonra gelen 1 için profil değeri). */
export function cellPoints(cell: MeldCell, rules: RuleProfile): number {
  return cell.value === 14 ? rules.aceAfterThirteenPoints : cell.value;
}

export function meldPoints(cells: MeldCell[], rules: RuleProfile): number {
  return cells.reduce((s, c) => s + cellPoints(c, rules), 0);
}

function resolveRun(
  tiles: Tile[],
  okey: Face,
  rules: RuleProfile,
  jokerFaces?: Record<TileId, Face>,
): ResolvedMeld | string {
  const naturals = tiles.filter((t) => !isJoker(t, okey));
  const jokers = tiles.filter((t) => isJoker(t, okey));
  const n = tiles.length;
  if (naturals.length === 0) return "Per yalnızca okeylerden oluşamaz.";
  const faces = naturals.map((t) => effectiveFace(t, okey));
  const color = faces[0].color;
  if (faces.some((f) => f.color !== color)) return "Seri perdeki bütün taşlar aynı renkte olmalı.";

  const candidates: ResolvedMeld[] = [];
  for (const highAce of rules.allowThirteenOne ? [false, true] : [false]) {
    const values = faces.map((f) => (highAce && f.value === 1 ? 14 : f.value));
    if (new Set(values).size !== values.length) continue;
    const maxEnd = highAce ? 14 : 13;
    const minStart = highAce ? 2 : 1;
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    if (highAce && !values.includes(14)) continue;
    for (let s = Math.max(minStart, maxV - n + 1); s <= Math.min(minV, maxEnd - n + 1); s++) {
      // s..s+n-1 aralığı tüm doğal değerleri içerir; kalan konumları okeyler doldurur.
      const cells: MeldCell[] = [];
      const jokerPool = jokers.slice();
      let ok = true;
      for (let v = s; v < s + n; v++) {
        const idx = values.indexOf(v);
        if (idx >= 0) {
          cells.push({ tileId: naturals[idx].id, color, value: v, isJoker: false });
        } else {
          const j = jokerPool.shift();
          if (!j) {
            ok = false;
            break;
          }
          cells.push({ tileId: j.id, color, value: v, isJoker: true });
        }
      }
      if (!ok || jokerPool.length > 0) continue;
      const finalCells = jokerFaces ? assignJokersToFaces(cells, jokerFaces) : cells;
      if (!finalCells) continue;
      candidates.push({ kind: "run", cells: finalCells, points: meldPoints(finalCells, rules) });
    }
  }
  if (candidates.length === 0) {
    if (rules.allowThirteenOne === false && faces.some((f) => f.value === 1) && faces.some((f) => f.value >= 12)) {
      return "Bu masada 13'ten sonra 1 gelen seriler (12-13-1) geçersizdir.";
    }
    return "Seri perdeki sayılar ardışık olmalı (okeyler boşlukları doldurabilir).";
  }
  candidates.sort((a, b) => b.points - a.points);
  return candidates[0];
}

/**
 * Okey konumları (yüzleri) sabittir; okey kimliklerini, oyuncunun istediği yüzlere göre bu konumlara dağıtır.
 */
function assignJokersToFaces(cells: MeldCell[], jokerFaces: Record<TileId, Face>): MeldCell[] | null {
  const result = cells.map((c) => ({ ...c }));
  const slots = result.filter((c) => c.isJoker);
  const ids = slots.map((c) => c.tileId);
  const taken = new Set<MeldCell>();
  for (const id of ids) {
    const want = jokerFaces[id];
    if (!want) continue;
    const slot = slots.find((c) => !taken.has(c) && c.color === want.color && c.value === want.value);
    if (!slot) return null;
    slot.tileId = id;
    taken.add(slot);
  }
  const rest = ids.filter((id) => !jokerFaces[id]);
  for (const slot of slots) {
    if (taken.has(slot)) continue;
    slot.tileId = rest.shift()!;
  }
  return result;
}

function resolveGroup(
  tiles: Tile[],
  okey: Face,
  rules: RuleProfile,
  jokerFaces?: Record<TileId, Face>,
): ResolvedMeld | string {
  const naturals = tiles.filter((t) => !isJoker(t, okey));
  const jokers = tiles.filter((t) => isJoker(t, okey));
  if (tiles.length > 4) return "Grup per en fazla dört taştan oluşabilir.";
  if (naturals.length === 0) return "Per yalnızca okeylerden oluşamaz.";
  const faces = naturals.map((t) => effectiveFace(t, okey));
  const value = faces[0].value;
  if (faces.some((f) => f.value !== value)) return "Grup perdeki bütün taşlar aynı sayıda olmalı.";
  const colors = faces.map((f) => f.color);
  if (new Set(colors).size !== colors.length) return "Grup perde aynı renk tekrar edemez.";
  const missing = COLORS.filter((c) => !colors.includes(c));
  const cells: MeldCell[] = naturals.map((t, i) => ({ tileId: t.id, color: faces[i].color, value, isJoker: false }));
  const free = missing.slice();
  for (const j of jokers) {
    const want = jokerFaces?.[j.id];
    let color: Color | undefined;
    if (want) {
      if (want.value !== value || !free.includes(want.color)) return "Okey için belirtilen yüz bu grup pere uymuyor.";
      color = want.color;
    } else {
      color = free.find((c) => !jokers.some((jj) => jokerFaces?.[jj.id]?.color === c));
    }
    if (!color) return "Grup perde aynı renk tekrar edemez.";
    free.splice(free.indexOf(color), 1);
    cells.push({ tileId: j.id, color, value, isJoker: true });
  }
  return { kind: "group", cells, points: meldPoints(cells, rules) };
}

/**
 * Bir taş kümesinin geçerli per olup olmadığını doğrular.
 * Tür belirtilmezse en yüksek puanlı geçerli yorum seçilir.
 */
export function validateMeld(
  tiles: Tile[],
  okey: Face,
  rules: RuleProfile,
  opts: { kind?: MeldKind; jokerFaces?: Record<TileId, Face> } = {},
): Result<ResolvedMeld> {
  if (tiles.length < 3) return { ok: false, error: "Per en az üç taştan oluşmalı." };
  if (new Set(tiles.map((t) => t.id)).size !== tiles.length)
    return { ok: false, error: "Aynı taş bir perde iki kez kullanılamaz." };
  const options: ResolvedMeld[] = [];
  const errors: string[] = [];
  if (opts.kind !== "group") {
    const r = resolveRun(tiles, okey, rules, opts.jokerFaces);
    if (typeof r === "string") errors.push(r);
    else options.push(r);
  }
  if (opts.kind !== "run") {
    const g = resolveGroup(tiles, okey, rules, opts.jokerFaces);
    if (typeof g === "string") errors.push(g);
    else options.push(g);
  }
  if (options.length === 0) {
    // Kullanıcıya en anlamlı hata: taşların çoğu aynı renkteyse seri hatası, değilse grup hatası.
    const naturals = tiles.filter((t) => !isJoker(t, okey)).map((t) => effectiveFace(t, okey));
    const sameColor = naturals.length > 0 && naturals.every((f) => f.color === naturals[0].color);
    const err = opts.kind === "group" ? errors[0] : opts.kind === "run" ? errors[0] : sameColor ? errors[0] : errors[1] ?? errors[0];
    return { ok: false, error: err ?? "Geçersiz per." };
  }
  options.sort((a, b) => b.points - a.points);
  return { ok: true, value: options[0] };
}

/** Birden fazla perin açılış puanını hesaplar; geçersiz per varsa hata döner. */
export function calculateOpeningPoints(
  melds: MeldSpec[],
  tilesById: Map<TileId, Tile>,
  okey: Face,
  rules: RuleProfile,
): Result<{ total: number; resolved: ResolvedMeld[] }> {
  const seen = new Set<TileId>();
  const resolved: ResolvedMeld[] = [];
  for (const spec of melds) {
    const tiles: Tile[] = [];
    for (const id of spec.tileIds) {
      if (seen.has(id)) return { ok: false, error: "Aynı taş birden fazla perde kullanılamaz." };
      seen.add(id);
      const t = tilesById.get(id);
      if (!t) return { ok: false, error: "Elinizde olmayan bir taş seçildi." };
      tiles.push(t);
    }
    const r = validateMeld(tiles, okey, rules, { kind: spec.kind, jokerFaces: spec.jokerFaces });
    if (!r.ok) return r;
    resolved.push(r.value);
  }
  return { ok: true, value: { total: resolved.reduce((s, m) => s + m.points, 0), resolved } };
}

// --------------------------------------------------------------------- Çiftler

export interface ResolvedPair {
  tileIds: [TileId, TileId];
  face: Face;
}

/** İki taşın çift oluşturup oluşturmadığını kontrol eder. */
export function validatePair(a: Tile, b: Tile, okey: Face, rules: RuleProfile): Result<ResolvedPair> {
  if (a.id === b.id) return { ok: false, error: "Aynı taş iki kez kullanılamaz." };
  const ja = isJoker(a, okey);
  const jb = isJoker(b, okey);
  if (ja && jb) {
    if (!rules.allowDoubleJokerPair) return { ok: false, error: "İki okey bu masada çift sayılmaz." };
    return { ok: true, value: { tileIds: [a.id, b.id], face: okey } };
  }
  if (ja || jb) {
    if (!rules.allowJokerPair) return { ok: false, error: "Bu masada okey çift tamamlayamaz." };
    const natural = ja ? b : a;
    return { ok: true, value: { tileIds: [a.id, b.id], face: effectiveFace(natural, okey) } };
  }
  const fa = effectiveFace(a, okey);
  const fb = effectiveFace(b, okey);
  if (!sameFace(fa, fb))
    return { ok: false, error: `${describeTile(a)} ile ${describeTile(b)} çift oluşturmaz (aynı renk ve sayı olmalı).` };
  return { ok: true, value: { tileIds: [a.id, b.id], face: fa } };
}

export function validatePairs(
  pairs: [TileId, TileId][],
  tilesById: Map<TileId, Tile>,
  okey: Face,
  rules: RuleProfile,
): Result<ResolvedPair[]> {
  const seen = new Set<TileId>();
  const out: ResolvedPair[] = [];
  for (const [x, y] of pairs) {
    for (const id of [x, y]) {
      if (seen.has(id)) return { ok: false, error: "Aynı taş iki farklı çiftte kullanılamaz." };
      seen.add(id);
    }
    const a = tilesById.get(x);
    const b = tilesById.get(y);
    if (!a || !b) return { ok: false, error: "Elinizde olmayan bir taş seçildi." };
    const r = validatePair(a, b, okey, rules);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return { ok: true, value: out };
}

// --------------------------------------------------------------- Taş işleme

/** Masadaki pere taş eklemenin sonucu (yeni hücreler) veya hata. */
export function addTileToMeld(
  meld: TableMeld,
  tile: Tile,
  okey: Face,
  rules: RuleProfile,
  side?: "start" | "end",
): Result<MeldCell[]> {
  const joker = isJoker(tile, okey);
  if (meld.kind === "group") {
    if (meld.cells.length >= 4) return { ok: false, error: "Bu grup per dolu (dört renk tamam)." };
    const value = meld.cells[0].value;
    const used = meld.cells.map((c) => c.color);
    if (joker) {
      const color = COLORS.find((c) => !used.includes(c))!;
      return { ok: true, value: [...meld.cells, { tileId: tile.id, color, value, isJoker: true }] };
    }
    const f = effectiveFace(tile, okey);
    if (f.value !== value) return { ok: false, error: "Grup pere yalnızca aynı sayıdaki taş işlenebilir." };
    if (used.includes(f.color)) return { ok: false, error: "Bu renk grup perde zaten var." };
    return { ok: true, value: [...meld.cells, { tileId: tile.id, color: f.color, value, isJoker: false }] };
  }
  // Seri
  const color = meld.cells[0].color;
  const start = meld.cells[0].value;
  const end = meld.cells[meld.cells.length - 1].value;
  const maxEnd = rules.allowThirteenOne ? 14 : 13;
  const canStart = start > 1 && !(start === 2 && meld.cells.some((c) => c.value === 14));
  const canEnd = end < maxEnd && !(end === 13 && meld.cells.some((c) => c.value === 1));
  if (joker) {
    const where = side ?? (canEnd ? "end" : "start");
    if (where === "end" && canEnd)
      return { ok: true, value: [...meld.cells, { tileId: tile.id, color, value: end + 1, isJoker: true }] };
    if (where === "start" && canStart)
      return { ok: true, value: [{ tileId: tile.id, color, value: start - 1, isJoker: true }, ...meld.cells] };
    return { ok: false, error: "Okey bu serinin o ucuna eklenemez." };
  }
  const f = effectiveFace(tile, okey);
  if (f.color !== color) return { ok: false, error: "Seri pere yalnızca aynı renkte taş işlenebilir." };
  const asHigh = f.value === 1 && end === 13 && rules.allowThirteenOne ? 14 : f.value;
  if (canEnd && asHigh === end + 1 && side !== "start")
    return { ok: true, value: [...meld.cells, { tileId: tile.id, color, value: asHigh, isJoker: false }] };
  if (canStart && f.value === start - 1 && side !== "end")
    return { ok: true, value: [{ tileId: tile.id, color, value: f.value, isJoker: false }, ...meld.cells] };
  return { ok: false, error: `${describeTile(tile)} bu serinin başına veya sonuna uymuyor.` };
}

/** Taş masadaki herhangi bir pere işlenebilir mi? (işlek taş tespiti) */
export function isPlayableOnTable(tile: Tile, melds: TableMeld[], okey: Face, rules: RuleProfile): boolean {
  if (isJoker(tile, okey)) return melds.length > 0;
  return melds.some((m) => addTileToMeld(m, tile, okey, rules).ok);
}

/**
 * Okey değiştirme: masadaki okeyin yerine onun temsil ettiği gerçek taşı koyar.
 * Sonuç: yeni hücreler ve geri alınan okeyin kimliği.
 */
export function replaceJokerInMeld(
  meld: TableMeld,
  tile: Tile,
  okey: Face,
): Result<{ cells: MeldCell[]; jokerTileId: TileId }> {
  if (isJoker(tile, okey)) return { ok: false, error: "Okeyin yerine yine okey konulamaz." };
  const f = effectiveFace(tile, okey);
  if (meld.kind === "run") {
    const idx = meld.cells.findIndex((c) => c.isJoker && c.color === f.color && (c.value === f.value || (c.value === 14 && f.value === 1)));
    if (idx < 0) return { ok: false, error: "Bu taş perdeki hiçbir okeyin temsil ettiği taş değil." };
    const cells = meld.cells.map((c) => ({ ...c }));
    const jokerTileId = cells[idx].tileId;
    cells[idx] = { tileId: tile.id, color: f.color, value: cells[idx].value, isJoker: false };
    return { ok: true, value: { cells, jokerTileId } };
  }
  const value = meld.cells[0].value;
  if (f.value !== value) return { ok: false, error: "Bu taş grubun sayısıyla uyuşmuyor." };
  const naturalColors = meld.cells.filter((c) => !c.isJoker).map((c) => c.color);
  if (naturalColors.includes(f.color)) return { ok: false, error: "Bu renk grupta zaten gerçek taşla var." };
  // Grup perde okey herhangi bir eksik rengi temsil edebilir: önce aynı renkli okey, yoksa ilk okey.
  let idx = meld.cells.findIndex((c) => c.isJoker && c.color === f.color);
  if (idx < 0) idx = meld.cells.findIndex((c) => c.isJoker);
  if (idx < 0) return { ok: false, error: "Bu perde okey yok." };
  const cells = meld.cells.map((c) => ({ ...c }));
  const jokerTileId = cells[idx].tileId;
  cells[idx] = { tileId: tile.id, color: f.color, value, isJoker: false };
  return { ok: true, value: { cells, jokerTileId } };
}
