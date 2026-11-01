import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createRng,
  createTileSet,
  dealHand,
  DEFAULT_RULES,
  effectiveFace,
  isJoker,
  okeyFromIndicator,
  type Seat,
} from "@/engine";
import { T, countAllTiles, newMatch } from "../helpers";

describe("Taş seti", () => {
  it("tam 106 fiziksel taş vardır", () => {
    expect(createTileSet()).toHaveLength(106);
  });

  it("her renk/sayı için tam iki kopya ve iki sahte okey vardır", () => {
    const set = createTileSet();
    const counts = new Map<string, number>();
    for (const t of set.filter((t) => !t.isFakeJoker)) {
      const k = `${t.color}-${t.value}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(52);
    expect([...counts.values()].every((c) => c === 2)).toBe(true);
    expect(set.filter((t) => t.isFakeJoker)).toHaveLength(2);
  });

  it("her taşın benzersiz kimliği vardır", () => {
    const ids = createTileSet().map((t) => t.id);
    expect(new Set(ids).size).toBe(106);
  });

  it("göstergeye göre okey bir üst sayıdır", () => {
    expect(okeyFromIndicator(T("r5-0"))).toEqual({ color: "red", value: 6 });
  });

  it("gösterge 13 ise okey 1 olur", () => {
    expect(okeyFromIndicator(T("k13-1"))).toEqual({ color: "black", value: 1 });
  });

  it("sahte okey gösterge olamaz", () => {
    expect(() => okeyFromIndicator(T("f-0"))).toThrow();
  });

  it("sahte okey joker değildir ve gerçek okeyin basılı değerini temsil eder", () => {
    const okey = okeyFromIndicator(T("b3-0")); // mavi 4
    expect(isJoker(T("f-0"), okey)).toBe(false);
    expect(effectiveFace(T("f-1"), okey)).toEqual({ color: "blue", value: 4 });
    expect(isJoker(T("b4-0"), okey)).toBe(true);
    expect(isJoker(T("b4-1"), okey)).toBe(true);
    expect(isJoker(T("r4-0"), okey)).toBe(false);
  });
});

describe("Dağıtım", () => {
  it("ilk oyuncuya 22, diğerlerine 21 taş verilir; destede 20 taş kalır", () => {
    const h = dealHand(DEFAULT_RULES, 1, 3, createRng("x"), 0);
    expect(h.firstPlayer).toBe(0);
    expect(h.hands[0]).toHaveLength(22);
    expect(h.hands[1]).toHaveLength(21);
    expect(h.hands[2]).toHaveLength(21);
    expect(h.hands[3]).toHaveLength(21);
    expect(h.drawPile).toHaveLength(20);
    expect(h.turnPhase).toBe("awaitingAction");
  });

  it("aynı seed aynı dağıtımı üretir (deterministik)", () => {
    const a = dealHand(DEFAULT_RULES, 1, 0, createRng("seed-1"), 0);
    const b = dealHand(DEFAULT_RULES, 1, 0, createRng("seed-1"), 0);
    const c = dealHand(DEFAULT_RULES, 1, 0, createRng("seed-2"), 0);
    expect(a.hands[1].map((t) => t.id)).toEqual(b.hands[1].map((t) => t.id));
    expect(a.hands[1].map((t) => t.id)).not.toEqual(c.hands[1].map((t) => t.id));
  });

  it("dağıtıcı rotasyonu: ilk oyuncu dağıtıcının sağındaki koltuktur", () => {
    for (const dealer of [0, 1, 2, 3] as Seat[]) {
      const h = dealHand(DEFAULT_RULES, 1, dealer, createRng("r"), 0);
      expect(h.firstPlayer).toBe((dealer + 1) % 4);
      expect(h.hands[h.firstPlayer]).toHaveLength(22);
    }
  });

  it("property: hiçbir seed'de bir taş iki yerde bulunmaz, gösterge sahte okey olmaz", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), (seed) => {
        const s = newMatch({}, seed);
        const ids = countAllTiles(s);
        expect(ids).toHaveLength(106);
        expect(new Set(ids).size).toBe(106);
        expect(s.hand.indicator.isFakeJoker).toBe(false);
      }),
      { numRuns: 300 },
    );
  });
});
