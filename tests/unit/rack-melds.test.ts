import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, meldsFromRack, okeyFromIndicator, pairsFromRack } from "@/engine";
import { T } from "../helpers";

const okey = okeyFromIndicator(T("b3-0")); // Mavi 4 okey
const COLS = 15;
const row = (ids: (string | null)[]) => [...ids, ...Array(COLS * 2 - ids.length).fill(null)];

describe("Istaka diziliminden per çıkarma", () => {
  it("boşlukla ayrılmış perleri ayrı ayrı bulur ve puanı toplar", () => {
    const ids = ["r10-0", "r11-0", "r12-0", "r13-0", null, "k9-0", "y9-0", "r9-0", null, "y1-0"];
    const slots = row(ids);
    const hand = ids.filter(Boolean).map((id) => T(id!));
    const r = meldsFromRack(slots, COLS, hand, okey, DEFAULT_RULES);
    expect(r.melds).toHaveLength(2);
    expect(r.total).toBe(46 + 27);
  });
  it("bitişik dizilmiş seri + grubu en iyi şekilde böler", () => {
    const ids = ["r3-0", "r4-0", "r5-0", "k7-0", "y7-0", "r7-0"];
    const r = meldsFromRack(row(ids), COLS, ids.map(T), okey, DEFAULT_RULES);
    expect(r.melds.map((m) => m.tileIds.length)).toEqual([3, 3]);
    expect(r.total).toBe(12 + 21);
  });
  it("sıra sonu perleri ayırır", () => {
    const top = Array(COLS).fill(null);
    top[13] = "r1-0";
    top[14] = "r2-0";
    const slots = [...top, "r3-0", ...Array(COLS - 1).fill(null)];
    const r = meldsFromRack(slots, COLS, ["r1-0", "r2-0", "r3-0"].map(T), okey, DEFAULT_RULES);
    expect(r.melds).toHaveLength(0);
  });
  it("bitişik çiftleri bulur", () => {
    const ids = ["r5-0", "r5-1", "k2-0", "k2-1", null, "y9-0"];
    const p = pairsFromRack(row(ids), COLS, ids.filter(Boolean).map((id) => T(id!)), okey, DEFAULT_RULES);
    expect(p).toEqual([
      ["r5-0", "r5-1"],
      ["k2-0", "k2-1"],
    ]);
  });
});

describe("Istaka dizilimi – ters sıra ve okey", () => {
  it("ters dizilmiş seri ve okeyli seri de algılanır", () => {
    const ids = ["k13-0", "k12-0", "k11-0", null, "y5-0", "b4-0", "y7-0"]; // Mavi 4 = okey → Sarı 6 yerine
    const r = meldsFromRack(row(ids), COLS, ids.filter(Boolean).map((id) => T(id!)), okey, DEFAULT_RULES);
    expect(r.melds).toHaveLength(2);
    expect(r.total).toBe(36 + 18);
  });
});
