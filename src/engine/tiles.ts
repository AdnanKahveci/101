import { COLORS, type Color, type Face, type Tile } from "./types";

const COLOR_CODE: Record<Color, string> = { red: "r", yellow: "y", blue: "b", black: "k" };

/** Standart 106 taşlık 101 Okey seti: 4 renk × 13 sayı × 2 kopya + 2 sahte okey. */
export function createTileSet(): Tile[] {
  const tiles: Tile[] = [];
  for (const color of COLORS) {
    for (let value = 1; value <= 13; value++) {
      for (const copyIndex of [0, 1] as const) {
        tiles.push({
          id: `${COLOR_CODE[color]}${value}-${copyIndex}`,
          color,
          value,
          copyIndex,
          isFakeJoker: false,
        });
      }
    }
  }
  tiles.push({ id: "f-0", color: null, value: null, copyIndex: 0, isFakeJoker: true });
  tiles.push({ id: "f-1", color: null, value: null, copyIndex: 1, isFakeJoker: true });
  return tiles;
}

const TILE_INDEX: ReadonlyMap<string, Tile> = new Map(createTileSet().map((t) => [t.id, t]));

/** Kimliğe göre fiziksel taş. Bilinmeyen kimlikte hata fırlatır. */
export function tileById(id: string): Tile {
  const t = TILE_INDEX.get(id);
  if (!t) throw new Error(`Bilinmeyen taş: ${id}`);
  return t;
}

export function isValidTileId(id: string): boolean {
  return TILE_INDEX.has(id);
}

/** Göstergeye göre okey: aynı renkte bir üst sayı, 13'ten sonra 1. */
export function okeyFromIndicator(indicator: Tile): Face {
  if (indicator.isFakeJoker || indicator.color === null || indicator.value === null) {
    throw new Error("Sahte okey gösterge olamaz");
  }
  return { color: indicator.color, value: indicator.value === 13 ? 1 : indicator.value + 1 };
}

/** Gerçek okey (joker) mu? Sahte okey asla joker değildir. */
export function isJoker(tile: Tile, okey: Face): boolean {
  return !tile.isFakeJoker && tile.color === okey.color && tile.value === okey.value;
}

/**
 * Taşın oyundaki yüzü. Sahte okey, gerçek okeyin basılı değerini temsil eder.
 * Gerçek okey için kendi basılı yüzü döner (joker olarak kullanılması ayrıca ele alınır).
 */
export function effectiveFace(tile: Tile, okey: Face): Face {
  if (tile.isFakeJoker) return { color: okey.color, value: okey.value };
  return { color: tile.color as Color, value: tile.value as number };
}

/** Elde kalan taşın ceza puanı (okey hariç; okey cezası ayrıca hesaplanır). */
export function tileFaceValue(tile: Tile, okey: Face): number {
  return effectiveFace(tile, okey).value;
}

export function sameFace(a: Face, b: Face): boolean {
  return a.color === b.color && a.value === b.value;
}

export function describeTile(tile: Tile): string {
  if (tile.isFakeJoker) return "Sahte okey";
  const names: Record<Color, string> = { red: "Kırmızı", yellow: "Sarı", blue: "Mavi", black: "Siyah" };
  return `${names[tile.color as Color]} ${tile.value}`;
}

export function describeFace(face: Face): string {
  const names: Record<Color, string> = { red: "Kırmızı", yellow: "Sarı", blue: "Mavi", black: "Siyah" };
  return `${names[face.color]} ${face.value}`;
}
