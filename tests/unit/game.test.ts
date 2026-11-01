import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  applyAction,
  getLegalActions,
  getPlayerView,
  requiredPairCount,
  requiredRunPoints,
  type GameAction,
  type GameState,
  type Seat,
} from "@/engine";
import { countAllTiles, ctx, newMatch, scenario } from "../helpers";

function act(s: GameState, seat: Seat, a: GameAction): GameState {
  const r = applyAction(s, a, seat, ctx);
  if (!r.ok) throw new Error(`Beklenmeyen hata: ${r.error}`);
  return r.value.state;
}
function reject(s: GameState, seat: Seat, a: GameAction): string {
  const r = applyAction(s, a, seat, ctx);
  if (r.ok) throw new Error("Aksiyon reddedilmeliydi");
  return r.error;
}

// Gösterge Mavi 3 → okey Mavi 4 (b4-0, b4-1)
const IND = "b3-0";
const filler = ["y1-0", "y1-1", "k2-0", "k2-1", "r2-0"];

// Açılış perleri
const RUN46_R = ["r10-0", "r11-0", "r12-0", "r13-0"]; // 46
const RUN46_K = ["k10-0", "k11-0", "k12-0", "k13-0"]; // 46
const GROUP9 = ["r3-0", "k3-0", "y3-0"]; // 9
const RUN36_K = ["k11-0", "k12-0", "k13-0"]; // 36
const RUN18_Y = ["y5-0", "y6-0", "y7-0"]; // 18

describe("Sıra ve taş çekme", () => {
  it("ilk oyuncu taş çekmeden taş atarak başlar", () => {
    const s = newMatch();
    expect(s.hand.currentTurn).toBe(0);
    expect(getLegalActions(s, 0)).toContain("DISCARD_TILE");
    expect(reject(s, 0, { type: "DRAW_TILE" })).toContain("zaten");
    const tile = s.hand.hands[0][0].id;
    const s2 = act(s, 0, { type: "DISCARD_TILE", tileId: tile });
    expect(s2.hand.hands[0]).toHaveLength(21);
    expect(s2.hand.currentTurn).toBe(1);
    expect(s2.version).toBe(s.version + 1);
  });

  it("sırası olmayan oyuncu hamle yapamaz ve state değişmez", () => {
    const s = newMatch();
    const before = JSON.stringify(s);
    expect(reject(s, 2, { type: "DISCARD_TILE", tileId: s.hand.hands[2][0].id })).toBe("Sıra sizde değil.");
    expect(JSON.stringify(s)).toBe(before);
  });

  it("aynı turda iki kez taş çekilemez", () => {
    let s = newMatch();
    s = act(s, 0, { type: "DISCARD_TILE", tileId: s.hand.hands[0][0].id });
    s = act(s, 1, { type: "DRAW_TILE" });
    expect(reject(s, 1, { type: "DRAW_TILE" })).toContain("zaten");
    expect(reject(s, 1, { type: "TAKE_DISCARD" })).toContain("zaten");
  });

  it("taş çekmeden taş atılamaz", () => {
    let s = newMatch();
    s = act(s, 0, { type: "DISCARD_TILE", tileId: s.hand.hands[0][0].id });
    expect(reject(s, 1, { type: "DISCARD_TILE", tileId: s.hand.hands[1][0].id })).toContain("çekmelisiniz");
  });

  it("sahte / başkasına ait taş kimliği reddedilir", () => {
    const s = newMatch();
    expect(reject(s, 0, { type: "DISCARD_TILE", tileId: "zz99" })).toContain("Elinizde olmayan");
    expect(reject(s, 0, { type: "DISCARD_TILE", tileId: s.hand.hands[1][0].id })).toContain("Elinizde olmayan");
  });
});

describe("Normal açma (katlamasız)", () => {
  it("100 puanla açılamaz", () => {
    const s = scenario({ indicator: IND, hands: { 0: [...RUN46_R, ...RUN36_K, ...RUN18_Y, ...filler] } });
    const e = reject(s, 0, { type: "OPEN_MELDS", melds: [{ tileIds: RUN46_R }, { tileIds: RUN36_K }, { tileIds: RUN18_Y }] });
    expect(e).toContain("101");
    expect(e).toContain("100");
  });

  it("101 puanla açılır", () => {
    const s = scenario({ indicator: IND, hands: { 0: [...RUN46_R, ...RUN46_K, ...GROUP9, ...filler] } });
    const s2 = act(s, 0, { type: "OPEN_MELDS", melds: [{ tileIds: RUN46_R }, { tileIds: RUN46_K }, { tileIds: GROUP9 }] });
    expect(s2.hand.opened[0]).toMatchObject({ kind: "melds", value: 101 });
    expect(s2.hand.melds).toHaveLength(3);
    expect(s2.hand.hands[0]).toHaveLength(filler.length);
  });

  it("jokerle geçerli seri açılabilir (okey eksik taşı tamamlar)", () => {
    const withJoker = ["r10-0", "b4-0", "r12-0", "r13-0"]; // okey = 11
    const s = scenario({ indicator: IND, hands: { 0: [...withJoker, ...RUN46_K, ...GROUP9, ...filler] } });
    const s2 = act(s, 0, { type: "OPEN_MELDS", melds: [{ tileIds: withJoker }, { tileIds: RUN46_K }, { tileIds: GROUP9 }] });
    expect(s2.hand.opened[0]!.value).toBe(101);
  });

  it("geçersiz per içeren açılış reddedilir, state değişmez", () => {
    const bad = ["r3-0", "r3-1", "y3-0"]; // aynı renk tekrar
    const s = scenario({ indicator: IND, hands: { 0: [...RUN46_R, ...RUN46_K, ...bad, ...filler] } });
    expect(reject(s, 0, { type: "OPEN_MELDS", melds: [{ tileIds: RUN46_R }, { tileIds: RUN46_K }, { tileIds: bad }] })).toContain(
      "aynı renk",
    );
  });

  it("bütün taşlar açılamaz; atmak için bir taş kalmalı", () => {
    const s = scenario({ indicator: IND, hands: { 0: [...RUN46_R, ...RUN46_K, ...GROUP9] } });
    expect(reject(s, 0, { type: "OPEN_MELDS", melds: [{ tileIds: RUN46_R }, { tileIds: RUN46_K }, { tileIds: GROUP9 }] })).toContain(
      "en az bir taş",
    );
  });
});

describe("Çift açma", () => {
  const P = (n: number) =>
    [
      ["r1-0", "r1-1"],
      ["r5-0", "r5-1"],
      ["y7-0", "y7-1"],
      ["k9-0", "k9-1"],
      ["b11-0", "b11-1"],
      ["y12-0", "y12-1"],
      ["k13-0", "k13-1"],
    ].slice(0, n) as [string, string][];

  it("4 çiftle açılamaz", () => {
    const s = scenario({ indicator: IND, hands: { 0: [...P(4).flat(), ...filler] } });
    expect(reject(s, 0, { type: "OPEN_PAIRS", pairs: P(4) })).toContain("5 çift");
  });
  it("5 çiftle açılır", () => {
    const s = scenario({ indicator: IND, hands: { 0: [...P(5).flat(), ...filler] } });
    const s2 = act(s, 0, { type: "OPEN_PAIRS", pairs: P(5) });
    expect(s2.hand.opened[0]).toMatchObject({ kind: "pairs", value: 5 });
    expect(s2.hand.pairs).toHaveLength(5);
  });
  it("aynı taş iki çiftte kullanılamaz", () => {
    const s = scenario({ indicator: IND, hands: { 0: [...P(5).flat(), ...filler] } });
    const pairs = P(5);
    pairs[4] = ["r1-0", "b11-1"];
    expect(reject(s, 0, { type: "OPEN_PAIRS", pairs })).toContain("iki farklı çiftte");
  });
  it("katlamalı: 5 çift sonrası bir sonraki oyuncu en az 6 çift açmalı, sonra 7", () => {
    let s = scenario({
      rules: { folding: true },
      indicator: IND,
      hands: {
        0: [...P(5).flat(), ...filler],
        1: ["r2-1", "r6-0", "r6-1", "y2-0", "y2-1", "y8-0", "y8-1", "k5-0", "k5-1", "b9-0", "b9-1", "b12-0", "b12-1", "r8-0"],
      },
    });
    s = act(s, 0, { type: "OPEN_PAIRS", pairs: P(5) });
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "y1-0" });
    expect(requiredPairCount(s, 1)).toBe(6);
    s = act(s, 1, { type: "DRAW_TILE" });
    const five: [string, string][] = [["r6-0", "r6-1"], ["y2-0", "y2-1"], ["y8-0", "y8-1"], ["k5-0", "k5-1"], ["b9-0", "b9-1"]];
    expect(reject(s, 1, { type: "OPEN_PAIRS", pairs: five })).toContain("6 çift");
    s = act(s, 1, { type: "OPEN_PAIRS", pairs: [...five, ["b12-0", "b12-1"]] });
    expect(requiredPairCount(s, 2)).toBe(7);
  });
});

describe("Katlamalı seri açma", () => {
  const OPEN105 = [RUN46_R, ["k10-0", "k11-0", "k12-0"], ["y5-0", "y6-0", "y7-0", "y8-0"]]; // 46+33+26
  const seat1_105 = [["r10-1", "r11-1", "r12-1", "r13-1"], ["k10-1", "k11-1", "k12-1"], ["y5-1", "y6-1", "y7-1", "y8-1"]];
  const seat1_106 = [["r10-1", "r11-1", "r12-1", "r13-1"], ["k11-1", "k12-1", "k13-1"], ["y7-1", "y8-1", "y9-1"]]; // 46+36+24

  function setup(rules: Record<string, unknown> = {}) {
    let s = scenario({
      rules: { folding: true, ...rules },
      indicator: IND,
      hands: {
        0: [...OPEN105.flat(), ...filler],
        1: [...new Set([...seat1_105.flat(), ...seat1_106.flat()]), "r1-1"],
      },
    });
    s = act(s, 0, { type: "OPEN_MELDS", melds: OPEN105.map((tileIds) => ({ tileIds })) });
    expect(s.hand.opened[0]!.value).toBe(105);
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "y1-0" });
    s = act(s, 1, { type: "DRAW_TILE" });
    return s;
  }

  it("ilk seri açılış en az 101", () => {
    const s = scenario({ rules: { folding: true }, indicator: IND, hands: { 0: [] } });
    expect(requiredRunPoints(s, 0)).toBe(101);
  });
  it("105 sonrası 105 ile açılamaz", () => {
    const s = setup();
    expect(requiredRunPoints(s, 1)).toBe(106);
    expect(reject(s, 1, { type: "OPEN_MELDS", melds: seat1_105.map((tileIds) => ({ tileIds })) })).toContain("106");
  });
  it("105 sonrası 106 ile açılır; sonraki baraj 107", () => {
    let s = setup();
    s = act(s, 1, { type: "OPEN_MELDS", melds: seat1_106.map((tileIds) => ({ tileIds })) });
    expect(s.hand.opened[1]!.value).toBe(106);
    expect(requiredRunPoints(s, 2)).toBe(107);
  });
  it("seri ve çift barajları ayrı yönetilir", () => {
    const s = setup();
    expect(requiredPairCount(s, 1)).toBe(5);
  });
  it("katlamasız masada baraj hep 101 kalır", () => {
    const s = scenario({ indicator: IND, hands: { 0: [...OPEN105.flat(), ...filler] } });
    const s2 = act(s, 0, { type: "OPEN_MELDS", melds: OPEN105.map((tileIds) => ({ tileIds })) });
    expect(requiredRunPoints(s2, 1)).toBe(101);
  });

  describe("eşli açma politikası (teamOpeningPolicy)", () => {
    it("table: masa barajı herkese uygulanır (eş dahil)", () => {
      const s = setup({ teamMode: true, teamOpeningPolicy: "table" });
      expect(requiredRunPoints(s, 2)).toBe(106); // seat 0'ın eşi
      expect(requiredRunPoints(s, 1)).toBe(106);
    });
    it("partnerBase: eşi açan oyuncu temel 101 ile açar", () => {
      const s = setup({ teamMode: true, teamOpeningPolicy: "partnerBase" });
      expect(requiredRunPoints(s, 2)).toBe(101);
      expect(requiredRunPoints(s, 1)).toBe(106);
    });
    it("independent: yalnızca rakip takımın açılışları barajı yükseltir", () => {
      const s = setup({ teamMode: true, teamOpeningPolicy: "independent" });
      expect(requiredRunPoints(s, 2)).toBe(101);
      expect(requiredRunPoints(s, 1)).toBe(106);
      expect(requiredRunPoints(s, 3)).toBe(106);
    });
  });
});

describe("Yandan alınan taş cezası ve çift işleme", () => {
  const PAIRS5 = ["r5-0", "r5-1", "k6-0", "k6-1", "y8-0", "y8-1", "r9-0", "r9-1"]; // 4 çift + yan taşla 5.

  it("yan taşla çift açılırsa taşı atana taş değeri ×20 ceza yazılır", () => {
    let s = scenario({ indicator: IND, hands: { 0: ["r1-0", "r2-1", "y7-0"], 1: [...PAIRS5, "y7-1", "k1-0", "k1-1", "r13-1"] } });
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "y7-0" });
    s = act(s, 1, { type: "TAKE_DISCARD" });
    s = act(s, 1, {
      type: "OPEN_PAIRS",
      pairs: [["r5-0", "r5-1"], ["k6-0", "k6-1"], ["y8-0", "y8-1"], ["r9-0", "r9-1"], ["y7-0", "y7-1"]],
    });
    expect(s.hand.penalties).toEqual([expect.objectContaining({ seat: 0, amount: 140 })]);
  });

  it("açmış oyuncu yandan aldığı taşı işlerse taşı atana ×10 ceza yazılır", () => {
    let s = scenario({
      indicator: IND,
      currentTurn: 1,
      turnPhase: "awaitingAction",
      hands: { 0: ["r1-0", "r2-1", "r9-0"], 1: [...RUN46_K, ...RUN46_R, "y3-0", "k3-0", "r3-0", "y12-1", "y13-1"], 2: ["y1-0", "y2-0"], 3: ["k5-0", "k6-0"] },
    });
    s = act(s, 1, { type: "OPEN_MELDS", melds: [{ tileIds: RUN46_R }, { tileIds: RUN46_K }, { tileIds: GROUP9 }] });
    s = act(s, 1, { type: "DISCARD_TILE", tileId: "y13-1" });
    s = act(s, 2, { type: "DRAW_TILE" });
    s = act(s, 2, { type: "DISCARD_TILE", tileId: s.hand.hands[2][0].id });
    s = act(s, 3, { type: "DRAW_TILE" });
    s = act(s, 3, { type: "DISCARD_TILE", tileId: s.hand.hands[3][0].id });
    s = act(s, 0, { type: "DRAW_TILE" });
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "r9-0" });
    s = act(s, 1, { type: "TAKE_DISCARD" });
    const meld = s.hand.melds.find((m) => m.cells.some((c) => c.tileId === "r10-0"))!;
    s = act(s, 1, { type: "ADD_TO_MELD", tileId: "r9-0", meldId: meld.id });
    expect(s.hand.takeObligation).toBeNull();
    expect(s.hand.penalties.at(-1)).toEqual(expect.objectContaining({ seat: 0, amount: 90 }));
  });

  it("seri açan oyuncu, masada çift açan varsa elindeki çiftleri işleyebilir", () => {
    let s = scenario({
      indicator: IND,
      currentTurn: 1,
      turnPhase: "awaitingAction",
      hands: { 1: [...RUN46_K, ...RUN46_R, ...GROUP9, "y12-0", "y12-1", "k1-0", "k1-1"], 2: [...PAIRS5, "y7-0", "y7-1", "k2-0"] },
    });
    s = act(s, 1, { type: "OPEN_MELDS", melds: [{ tileIds: RUN46_R }, { tileIds: RUN46_K }, { tileIds: GROUP9 }] });
    // Henüz kimse çift açmadı → seri açan çift işleyemez
    expect(getLegalActions({ ...s, hand: { ...s.hand, currentTurn: 1, turnPhase: "awaitingAction" } }, 1)).not.toContain("OPEN_PAIRS");
    s = act(s, 1, { type: "DISCARD_TILE", tileId: "k1-0" });
    s = act(s, 2, { type: "DRAW_TILE" });
    s = act(s, 2, {
      type: "OPEN_PAIRS",
      pairs: [["r5-0", "r5-1"], ["k6-0", "k6-1"], ["y8-0", "y8-1"], ["r9-0", "r9-1"], ["y7-0", "y7-1"]],
    });
    const back = { ...s, hand: { ...s.hand, currentTurn: 1 as Seat, turnPhase: "awaitingAction" as const } };
    expect(getLegalActions(back, 1)).toContain("OPEN_PAIRS");
    const r = applyAction(back, { type: "OPEN_PAIRS", pairs: [["y12-0", "y12-1"]] }, 1, ctx);
    expect(r.ok).toBe(true);
  });

  it("işlek taş: masadaki perde okeyin yerine geçebilecek taşı atmak da cezalıdır", () => {
    let s = scenario({
      indicator: IND,
      currentTurn: 1,
      turnPhase: "awaitingAction",
      hands: { 1: ["r10-0", "b4-0", "r12-0", "r13-0", ...RUN46_K, "y3-0", "k3-0", "r3-0", "k1-0", "k1-1"], 2: ["r11-1", "y2-0"] },
    });
    s = act(s, 1, { type: "OPEN_MELDS", melds: [{ tileIds: ["r10-0", "b4-0", "r12-0", "r13-0"] }, { tileIds: RUN46_K }, { tileIds: GROUP9 }] });
    s = act(s, 1, { type: "DISCARD_TILE", tileId: "k1-0" });
    s = act(s, 2, { type: "DRAW_TILE" });
    s = act(s, 2, { type: "DISCARD_TILE", tileId: "r11-1" });
    expect(s.hand.penalties.at(-1)).toEqual(expect.objectContaining({ seat: 2, amount: 101 }));
  });
});

describe("Göstergeyle çift açma", () => {
  // Gösterge Mavi 3 (b3-0); eşi b3-1 elde
  const PAIRS4 = ["r5-0", "r5-1", "k6-0", "k6-1", "y8-0", "y8-1", "r9-0", "r9-1"];
  const base = () =>
    scenario({ indicator: IND, currentTurn: 0, turnPhase: "awaitingAction", hands: { 0: [...PAIRS4, "b3-1", "k1-0", "y13-0"] } });

  it("göstergenin eşi eldeyse masadaki gösterge alınıp çift açılabilir", () => {
    let s = base();
    expect(getLegalActions(s, 0)).toContain("TAKE_INDICATOR");
    s = act(s, 0, { type: "TAKE_INDICATOR" });
    expect(s.hand.hands[0].map((t) => t.id)).toContain("b3-0");
    // Göstergeyi kullanmadan taş atılamaz, seri açılamaz
    expect(reject(s, 0, { type: "DISCARD_TILE", tileId: "k1-0" })).toContain("Göstergeyi");
    // Göstergesiz çift açılışı reddedilir
    expect(reject(s, 0, { type: "OPEN_PAIRS", pairs: [["r5-0", "r5-1"], ["k6-0", "k6-1"], ["y8-0", "y8-1"], ["r9-0", "r9-1"], ["k1-0", "y13-0"]] })).toBeTruthy();
    s = act(s, 0, {
      type: "OPEN_PAIRS",
      pairs: [["r5-0", "r5-1"], ["k6-0", "k6-1"], ["y8-0", "y8-1"], ["r9-0", "r9-1"], ["b3-1", "b3-0"]],
    });
    expect(s.hand.pairs).toHaveLength(5);
    expect(s.hand.indicatorTaken).toEqual({ seat: 0, inPair: true });
    expect(countAllTiles(s)).toHaveLength(106);
    expect(new Set(countAllTiles(s)).size).toBe(106);
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "k1-0" });
    expect(getLegalActions(s, 1)).not.toContain("TAKE_INDICATOR");
  });

  it("alınan gösterge cezasız geri bırakılabilir; eşi olmayan gösterge alamaz", () => {
    let s = base();
    s = act(s, 0, { type: "TAKE_INDICATOR" });
    s = act(s, 0, { type: "RETURN_INDICATOR" });
    expect(s.hand.hands[0].map((t) => t.id)).not.toContain("b3-0");
    expect(s.hand.penalties).toHaveLength(0);
    expect(countAllTiles(s)).toHaveLength(106);
    const other = scenario({ indicator: IND, currentTurn: 0, turnPhase: "awaitingAction", hands: { 0: [...PAIRS4, "k1-0"] } });
    expect(reject(other, 0, { type: "TAKE_INDICATOR" })).toContain("eşi");
  });
});

describe("Yandan taş alma", () => {
  it("açmamış oyuncu yandan aldığı taşla açmak zorundadır; açamazsa geri bırakır (bakıp denemek cezasız)", () => {
    let s = scenario({
      indicator: IND,
      hands: { 0: ["r1-0", "r2-1", "y9-0"], 1: [...RUN46_R, ...RUN46_K, "r3-0", "k3-0", "k9-1", "y11-1"] },
    });
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "y9-0" });
    s = act(s, 1, { type: "TAKE_DISCARD" });
    expect(s.hand.takeObligation?.tileId).toBe("y9-0");
    // Taşı kullanmadan atamaz
    expect(reject(s, 1, { type: "DISCARD_TILE", tileId: "k9-1" })).toContain("açmalısınız");
    // Yan taşı içermeyen açılış reddedilir
    expect(
      reject(s, 1, { type: "OPEN_MELDS", melds: [{ tileIds: RUN46_R }, { tileIds: RUN46_K }, { tileIds: ["r3-0", "k3-0", "k9-1"] }] }),
    ).toBeTruthy();
    s = act(s, 1, { type: "RETURN_DISCARD" });
    expect(s.hand.discards[0].at(-1)?.id).toBe("y9-0");
    expect(s.hand.penalties).toEqual([]);
    expect(s.hand.turnPhase).toBe("awaitingDraw");
    s = act(s, 1, { type: "DRAW_TILE" });
  });

  it("yan taşla açılış başarılı olursa zorunluluk kalkar", () => {
    let s = scenario({
      indicator: IND,
      hands: { 0: ["r1-0", "r2-1", "y3-0"], 1: [...RUN46_R, ...RUN46_K, "r3-0", "k3-0", "k9-1", "y11-1"] },
    });
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "y3-0" });
    s = act(s, 1, { type: "TAKE_DISCARD" });
    s = act(s, 1, { type: "OPEN_MELDS", melds: [{ tileIds: RUN46_R }, { tileIds: RUN46_K }, { tileIds: GROUP9 }] });
    expect(s.hand.takeObligation).toBeNull();
    // Taşı atan oyuncuya (0) taş değeri ×10 ceza: Sarı 3 → 30
    expect(s.hand.penalties).toEqual([expect.objectContaining({ seat: 0, amount: 30 })]);
    s = act(s, 1, { type: "DISCARD_TILE", tileId: "k9-1" });
  });

  it("yalnızca önceki oyuncunun attığı taş alınabilir; aynı taş iki kez alınamaz", () => {
    let s = scenario({ indicator: IND, hands: { 0: ["r1-0", "r2-1"], 1: ["y5-0", "y6-0"], 2: ["k1-0", "k2-0"] } });
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "r1-0" });
    s = act(s, 1, { type: "DRAW_TILE" });
    s = act(s, 1, { type: "DISCARD_TILE", tileId: "y5-0" });
    // Koltuk 2 yalnızca koltuk 1'in taşını alabilir
    s = act(s, 2, { type: "TAKE_DISCARD" });
    expect(s.hand.hands[2].some((t) => t.id === "y5-0")).toBe(true);
    expect(s.hand.discards[1]).toHaveLength(0);
  });
});

describe("Taş işleme, okey değiştirme ve cezalar", () => {
  function opened() {
    let s = scenario({
      indicator: IND,
      hands: {
        0: [...RUN46_R, ...RUN46_K, ...GROUP9, "r9-0", "b3-1", "y4-0", "b4-0", "r5-0"],
        1: ["r6-0", "r7-0", "y9-1", "k9-0", "b9-1"],
      },
    });
    s = act(s, 0, { type: "OPEN_MELDS", melds: [{ tileIds: RUN46_R }, { tileIds: RUN46_K }, { tileIds: GROUP9 }] });
    return s;
  }

  it("açmamış oyuncu taş işleyemez", () => {
    let s = opened();
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "y4-0" });
    s = act(s, 1, { type: "DRAW_TILE" });
    expect(reject(s, 1, { type: "ADD_TO_MELD", meldId: s.hand.melds[0].id, tileId: "y9-1" })).toContain("açmalısınız");
  });

  it("açmış oyuncu seri başına taş işler; grup pere eksik renk ekler", () => {
    let s = opened();
    s = act(s, 0, { type: "ADD_TO_MELD", meldId: s.hand.melds[0].id, tileId: "r9-0" });
    expect(s.hand.melds[0].cells.map((c) => c.value)).toEqual([9, 10, 11, 12, 13]);
    s = act(s, 0, { type: "ADD_TO_MELD", meldId: s.hand.melds[2].id, tileId: "b3-1" });
    expect(s.hand.melds[2].cells).toHaveLength(4);
  });

  it("işlek taş atmak cezalı masada +101 ceza verir; okey atmak +101", () => {
    let s = opened();
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "r9-0" }); // r9 seriye işlenebilirdi
    expect(s.hand.penalties).toEqual([expect.objectContaining({ seat: 0, amount: 101 })]);
    let s2 = opened();
    s2 = act(s2, 0, { type: "DISCARD_TILE", tileId: "b4-0" });
    expect(s2.hand.penalties[0]).toMatchObject({ reason: "Okey atıldı", amount: 101 });
    let s3 = opened();
    s3 = { ...s3, rules: { ...s3.rules, penaltiesEnabled: false } };
    s3 = act(s3, 0, { type: "DISCARD_TILE", tileId: "r9-0" });
    expect(s3.hand.penalties).toHaveLength(0);
  });

  it("okey değiştirme: gerçek taş konur, okey aynı hamlede başka pere işlenir (atomik)", () => {
    let s = scenario({
      indicator: IND,
      hands: {
        0: ["r10-0", "b4-0", "r12-0", "r13-0", ...RUN46_K, ...GROUP9, "r11-1", "y1-0", "y2-0", "k1-0"],
      },
    });
    s = act(s, 0, { type: "OPEN_MELDS", melds: [{ tileIds: ["r10-0", "b4-0", "r12-0", "r13-0"] }, { tileIds: RUN46_K }, { tileIds: GROUP9 }] });
    const runId = s.hand.melds[0].id;
    // Okey yeni pere girmezse (geçersiz) bütün hamle reddedilir
    expect(
      reject(s, 0, { type: "REPLACE_JOKER", meldId: runId, tileId: "r11-1", jokerUse: { type: "newMeld", meld: { tileIds: ["b4-0", "y1-0", "k9-9"] } } }),
    ).toBeTruthy();
    const before = JSON.stringify(s);
    s = act(s, 0, {
      type: "REPLACE_JOKER",
      meldId: runId,
      tileId: "r11-1",
      jokerUse: { type: "newMeld", meld: { tileIds: ["y1-0", "y2-0", "b4-0"] } },
    });
    expect(JSON.stringify(s)).not.toBe(before);
    expect(s.hand.melds[0].cells[1]).toMatchObject({ tileId: "r11-1", isJoker: false });
    expect(s.hand.melds.at(-1)!.cells.map((c) => c.tileId)).toContain("b4-0");
    expect(s.hand.penalties).toHaveLength(0); // kendi perinden okey almak cezasız
  });

  it("rakibin perindeki okey alınırsa per sahibine 101 ceza yazılır", () => {
    let s = scenario({
      indicator: IND, // okey Mavi 4
      hands: {
        0: ["r10-0", "r11-0", "b4-0", ...RUN46_K, "y10-0", "y11-0", "y12-0", "k1-0", "k2-0"],
        1: ["r10-1", "r11-1", "r12-1", "r13-1", "b10-0", "b11-0", "b12-0", "b13-0", ...GROUP9, "r12-0", "y5-0", "y6-0", "k5-0"],
      },
    });
    // Koltuk 0: Kırmızı 10-11-okey(12) = 33 + 46 + 33 = 112 ile açar
    s = act(s, 0, { type: "OPEN_MELDS", melds: [{ tileIds: ["r10-0", "r11-0", "b4-0"] }, { tileIds: RUN46_K }, { tileIds: ["y10-0", "y11-0", "y12-0"] }] });
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "k1-0" });
    s = act(s, 1, { type: "DRAW_TILE" });
    s = act(s, 1, { type: "OPEN_MELDS", melds: [{ tileIds: ["r10-1", "r11-1", "r12-1", "r13-1"] }, { tileIds: ["b10-0", "b11-0", "b12-0", "b13-0"] }, { tileIds: GROUP9 }] });
    const before = s.hand.penalties.length;
    const meldId = s.hand.melds.find((m) => m.owner === 0 && m.cells.some((c) => c.tileId === "b4-0"))!.id;
    s = act(s, 1, { type: "REPLACE_JOKER", meldId, tileId: "r12-0", jokerUse: { type: "newMeld", meld: { tileIds: ["y5-0", "y6-0", "b4-0"] } } });
    expect(s.hand.penalties.slice(before)).toEqual([expect.objectContaining({ seat: 0, amount: 101 })]);
  });

  it("okey değiştirme: kullanım belirtilmezse okey ıstakaya gelir, sonra kendi perinde kullanılabilir", () => {
    let s = scenario({
      indicator: IND,
      hands: {
        0: ["r10-0", "b4-0", "r12-0", "r13-0", ...RUN46_K, ...GROUP9, "r11-1", "y1-0", "y2-0", "k1-0"],
      },
    });
    s = act(s, 0, { type: "OPEN_MELDS", melds: [{ tileIds: ["r10-0", "b4-0", "r12-0", "r13-0"] }, { tileIds: RUN46_K }, { tileIds: GROUP9 }] });
    const runId = s.hand.melds[0].id;
    s = act(s, 0, { type: "REPLACE_JOKER", meldId: runId, tileId: "r11-1" });
    expect(s.hand.hands[0].map((t) => t.id)).toContain("b4-0");
    expect(s.hand.hands[0].map((t) => t.id)).not.toContain("r11-1");
    // Okeyle hemen kendi perini açabilir
    s = act(s, 0, { type: "OPEN_MELDS", melds: [{ tileIds: ["y1-0", "y2-0", "b4-0"] }] });
    expect(s.hand.melds.at(-1)!.cells.map((c) => c.tileId)).toContain("b4-0");
    expect(countAllTiles(s)).toHaveLength(106);
  });

  it("okey değiştirme kapalı profilde reddedilir", () => {
    const s = scenario({ rules: { jokerReplacePolicy: "disabled" }, indicator: IND, hands: { 0: ["r1-0"] } });
    expect(reject(s, 0, { type: "REPLACE_JOKER", meldId: "x", tileId: "r1-0", jokerUse: { type: "addToMeld", meldId: "y" } })).toContain(
      "kapalı",
    );
  });
});

describe("Bitiş ve puanlama", () => {
  // Koltuk 0 açık ve elinde tek taş kalacak şekilde kurulum.
  function nearFinish(lastTile: string, rules: Record<string, unknown> = {}, pairs = false) {
    const pairList: [string, string][] = [["r1-0", "r1-1"], ["r5-0", "r5-1"], ["y7-0", "y7-1"], ["k9-0", "k9-1"], ["b11-0", "b11-1"]];
    let s = scenario({
      rules,
      indicator: IND,
      hands: {
        0: pairs ? [...pairList.flat(), "y2-0", lastTile] : [...RUN46_R, ...RUN46_K, ...GROUP9, "y2-0", lastTile],
        1: ["k6-0", "k7-0", "y12-0"], // açmamış: 202
        2: ["y10-0", "y11-0", "y12-1", "k5-0", "k8-0", "k1-1"], // açacak
        3: ["r6-0", "b4-1"], // açmamış, okey elinde
      },
    });
    s = pairs
      ? act(s, 0, { type: "OPEN_PAIRS", pairs: pairList })
      : act(s, 0, { type: "OPEN_MELDS", melds: [{ tileIds: RUN46_R }, { tileIds: RUN46_K }, { tileIds: GROUP9 }] });
    s = act(s, 0, { type: "DISCARD_TILE", tileId: "y2-0" });
    // Koltuk 2'yi "açmış" olarak işaretle (elinde 5+8+1 = 14 + seri dışı taşlar)
    s.hand.opened[2] = { kind: "melds", value: 120, turnNumber: 1 };
    s.hand.hands[2] = s.hand.hands[2].filter((t) => ["k5-0", "k8-0", "k1-1"].includes(t.id));
    s.hand.currentTurn = 0;
    s.hand.turnPhase = "awaitingAction";
    s.hand.openedAtTurnStart = true;
    return s;
  }

  it("normal bitiş: bitiren -101, açmayan +202, açmış oyuncu elindeki toplam, eldeki okeyi olan açmamış +202", () => {
    let s = nearFinish("y13-0");
    s = act(s, 0, { type: "FINISH_HAND", tileId: "y13-0" });
    const res = s.handResults[0];
    expect(res.finishType).toBe("normal");
    expect(res.playerScores).toEqual({ 0: -101, 1: 202, 2: 14, 3: 202 });
    expect(res.breakdown.length).toBeGreaterThan(0);
    expect(s.phase).toBe("handResult");
  });

  it("açmış oyuncunun elindeki okey +101 sayılır", () => {
    let s = nearFinish("y13-0");
    s.hand.hands[2].push(...[s.hand.hands[3].find((t) => t.id === "b4-1")!]);
    s.hand.hands[3] = s.hand.hands[3].filter((t) => t.id !== "b4-1");
    s = act(s, 0, { type: "FINISH_HAND", tileId: "y13-0" });
    expect(s.handResults[0].playerScores[2]).toBe(14 + 101);
  });

  it("okey atarak bitiş: bitiren -202, rakip cezaları ×2", () => {
    let s = nearFinish("b4-0");
    s = act(s, 0, { type: "FINISH_HAND", tileId: "b4-0" });
    const res = s.handResults[0];
    expect(res.finishType).toBe("joker");
    expect(res.multiplier).toBe(2);
    expect(res.playerScores).toEqual({ 0: -202, 1: 404, 2: 28, 3: 404 });
    expect(s.hand.penalties).toHaveLength(0); // bitişte okey atma cezası yok
  });

  it("çiftten bitiş: bitiren -202, rakip cezaları ×2", () => {
    let s = nearFinish("y13-0", {}, true);
    s = act(s, 0, { type: "FINISH_HAND", tileId: "y13-0" });
    const res = s.handResults[0];
    expect(res.finishType).toBe("pairs");
    expect(res.playerScores).toEqual({ 0: -202, 1: 404, 2: 28, 3: 404 });
  });

  it("çift açan oyuncunun eli ×2 yazılır", () => {
    let s = nearFinish("y13-0");
    s.hand.opened[2] = { kind: "pairs", value: 5, turnNumber: 1 };
    s = act(s, 0, { type: "FINISH_HAND", tileId: "y13-0" });
    expect(s.handResults[0].playerScores[2]).toBe(28);
  });

  it("kafadan bitiş (kimse açmamışken tek turda açıp bitme): bitirene ve eşine 0, rakiplere +404", () => {
    let s = scenario({
      rules: { teamMode: true },
      indicator: IND,
      hands: { 0: [...RUN46_R, ...RUN46_K, ...GROUP9, "y5-0", "y6-0", "y7-0", "y8-0", "y9-0", "y10-0", "y11-0", "y12-0", "y13-0"], 1: ["k1-0"] },
    });
    s = act(s, 0, {
      type: "OPEN_MELDS",
      melds: [{ tileIds: RUN46_R }, { tileIds: RUN46_K }, { tileIds: GROUP9 }, { tileIds: ["y5-0", "y6-0", "y7-0", "y8-0", "y9-0", "y10-0", "y11-0", "y12-0"] }],
    });
    s = act(s, 0, { type: "FINISH_HAND", tileId: "y13-0" });
    const res = s.handResults[0];
    expect(res.playerScores).toEqual({ 0: 0, 1: 404, 2: 0, 3: 404 });
    expect(res.teamScores).toEqual([0, 808]);
  });

  it("elden bitiş (başkası açmışken tek turda açıp bitme): biten -202, rakipler ×2", () => {
    let s = scenario({
      indicator: IND,
      currentTurn: 1,
      turnPhase: "awaitingAction",
      drawPile: ["k5-0", "k6-0", "y5-0"],
      hands: {
        0: [...RUN46_R, ...RUN46_K, ...GROUP9, "y6-0", "y7-0", "y8-0", "y9-0", "y10-0", "y11-0", "y12-0", "y13-0"],
        1: ["b10-0", "b11-0", "b12-0", "b13-0", "r10-1", "r11-1", "r12-1", "r13-1", "r3-1", "k3-1", "y3-1", "k1-0", "k2-0"],
        2: ["y1-0", "y2-0"],
        3: ["k5-1", "k6-1"],
      },
    });
    s = act(s, 1, { type: "OPEN_MELDS", melds: [{ tileIds: ["b10-0", "b11-0", "b12-0", "b13-0"] }, { tileIds: ["r10-1", "r11-1", "r12-1", "r13-1"] }, { tileIds: ["r3-1", "k3-1", "y3-1"] }] });
    s = act(s, 1, { type: "DISCARD_TILE", tileId: "k1-0" });
    s = act(s, 2, { type: "DRAW_TILE" });
    s = act(s, 2, { type: "DISCARD_TILE", tileId: "y1-0" });
    s = act(s, 3, { type: "DRAW_TILE" });
    s = act(s, 3, { type: "DISCARD_TILE", tileId: "k5-1" });
    s = act(s, 0, { type: "DRAW_TILE" });
    s = act(s, 0, {
      type: "OPEN_MELDS",
      melds: [{ tileIds: RUN46_R }, { tileIds: RUN46_K }, { tileIds: GROUP9 }, { tileIds: ["y5-0", "y6-0", "y7-0", "y8-0", "y9-0", "y10-0", "y11-0", "y12-0"] }],
    });
    s = act(s, 0, { type: "FINISH_HAND", tileId: "y13-0" });
    expect(s.handResults[0].finishType).toBe("hand");
    expect(s.handResults[0].playerScores[0]).toBe(-202);
    expect(s.handResults[0].playerScores[2]).toBe(404); // açmadı 202 ×2
  });

  it("açmadan bitilemez", () => {
    const s = scenario({ indicator: IND, hands: { 0: ["r1-0"] } });
    expect(reject(s, 0, { type: "FINISH_HAND", tileId: "r1-0" })).toContain("Açmadan");
  });

  it("eşli: bitirenin eşinin el cezası sıfırlanır, takım puanları toplanır", () => {
    let s = nearFinish("y13-0", { teamMode: true });
    s = act(s, 0, { type: "FINISH_HAND", tileId: "y13-0" });
    const res = s.handResults[0];
    expect(res.playerScores).toEqual({ 0: -101, 1: 202, 2: 0, 3: 202 });
    expect(res.teamScores).toEqual([-101, 404]);
  });

  it("eşli: partnerOfFinisherScoresZero kapalıysa eşin cezası yazılır", () => {
    let s = nearFinish("y13-0", { teamMode: true, partnerOfFinisherScoresZero: false });
    s = act(s, 0, { type: "FINISH_HAND", tileId: "y13-0" });
    expect(s.handResults[0].teamScores).toEqual([-101 + 14, 404]);
  });

  it("deste bitmesi: son taş atıldığında el bitirensiz biter", () => {
    let s = newMatch();
    s.hand.drawPile = s.hand.drawPile.slice(0, 1);
    s = act(s, 0, { type: "DISCARD_TILE", tileId: s.hand.hands[0][0].id });
    s = act(s, 1, { type: "DRAW_TILE" });
    expect(s.hand.drawPile).toHaveLength(0);
    s = act(s, 1, { type: "DISCARD_TILE", tileId: s.hand.hands[1][0].id });
    expect(s.handResults[0].finishType).toBe("deckExhausted");
    expect(s.handResults[0].finisher).toBeNull();
    expect(Object.values(s.handResults[0].playerScores).every((v) => v === 202)).toBe(true);
  });

  it("el içi cezalar el sonucuna eklenir", () => {
    let s = nearFinish("y13-0");
    s.hand.penalties.push({ seat: 1, amount: 101, reason: "Okey atıldı", turnNumber: 1 });
    s = act(s, 0, { type: "FINISH_HAND", tileId: "y13-0" });
    expect(s.handResults[0].playerScores[1]).toBe(303);
  });
});

/** Rastgele ama yasal hamlelerle (çek + rastgele at) bir eli sonuna kadar oynatır. */
function playRandomHand(s: GameState, rand: () => number): GameState {
  let guard = 0;
  while (s.phase === "playing" && guard++ < 500) {
    const seat = s.hand.currentTurn;
    if (s.hand.turnPhase === "awaitingDraw") s = act(s, seat, { type: "DRAW_TILE" });
    const hand = s.hand.hands[seat];
    const tile = hand[Math.floor(rand() * hand.length)];
    s = act(s, seat, { type: "DISCARD_TILE", tileId: tile.id });
  }
  return s;
}
function readyAll(s: GameState): GameState {
  for (const seat of [0, 1, 2, 3] as Seat[]) s = act(s, seat, { type: "READY_NEXT_HAND" });
  return s;
}

describe("Maç akışı", () => {
  for (const total of [3, 11]) {
    it(`${total} ellik maç doğru biter, toplam skor el skorlarının toplamıdır, kazanan en düşük puanlıdır`, () => {
      let s = newMatch({ totalHands: total }, `match-${total}`);
      let r = 0.42;
      const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
      for (let i = 1; i <= total; i++) {
        expect(s.hand.handNumber).toBe(i);
        expect(s.hand.dealer).toBe((s.startDealer + i - 1) % 4);
        s = playRandomHand(s, rand);
        if (i < total) {
          expect(s.phase).toBe("handResult");
          expect(reject(s, 0, { type: "DRAW_TILE" })).toBeTruthy();
          s = readyAll(s);
          expect(s.phase).toBe("playing");
        }
      }
      expect(s.phase).toBe("finished");
      expect(s.handResults).toHaveLength(total);
      for (const seat of [0, 1, 2, 3] as Seat[]) {
        expect(s.totals[seat]).toBe(s.handResults.reduce((sum, h) => sum + h.playerScores[seat], 0));
      }
      const min = Math.min(...Object.values(s.totals));
      expect(s.winner!.seats.every((seat) => s.totals[seat] === min)).toBe(true);
    });
  }

  it("eşli maçta kazanan takım toplam ceza puanına göre belirlenir", () => {
    let s = newMatch({ totalHands: 3, teamMode: true }, "team");
    let r = 0.1;
    const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 3; i++) {
      s = playRandomHand(s, rand);
      if (s.phase === "handResult") s = readyAll(s);
    }
    const t0 = s.totals[0] + s.totals[2];
    const t1 = s.totals[1] + s.totals[3];
    if (t0 !== t1) expect(s.winner!.team).toBe(t0 < t1 ? 0 : 1);
  });

  it("süre aşımı (autoPlay): yasal deterministik hamle uygular; süre dolmadan reddedilir", () => {
    let s = newMatch({ turnSeconds: 30 });
    expect(reject(s, 0, { type: "TIMEOUT" })).toContain("dolmadı");
    const later = { now: s.hand.turnDeadline! + 1, seed: "x" };
    const r = applyAction(s, { type: "TIMEOUT" }, 0, later);
    expect(r.ok).toBe(true);
    if (r.ok) {
      s = r.value.state;
      expect(s.hand.currentTurn).toBe(1);
      expect(s.hand.hands[0]).toHaveLength(21);
    }
    const s2 = newMatch({ turnSeconds: 30, timeoutPolicy: "wait" });
    expect(applyAction(s2, { type: "TIMEOUT" }, 0, { now: 10 ** 13, seed: "x" }).ok).toBe(false);
  });

  it("property: rastgele yasal oyunlarda 106 taş korunur, tekrar eden taş olmaz, versiyon monoton artar", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 ** 6 }), (seedNum) => {
        let s = newMatch({}, `p${seedNum}`);
        let r = seedNum / 10 ** 6;
        const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
        let lastVersion = s.version;
        let guard = 0;
        while (s.phase === "playing" && guard++ < 200) {
          const seat = s.hand.currentTurn;
          if (s.hand.turnPhase === "awaitingDraw") s = act(s, seat, { type: "DRAW_TILE" });
          const tile = s.hand.hands[seat][Math.floor(rand() * s.hand.hands[seat].length)];
          s = act(s, seat, { type: "DISCARD_TILE", tileId: tile.id });
          expect(s.version).toBeGreaterThan(lastVersion);
          lastVersion = s.version;
          const ids = countAllTiles(s);
          expect(ids).toHaveLength(106);
          expect(new Set(ids).size).toBe(106);
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe("Gizli bilgi projeksiyonu", () => {
  it("oyuncu yalnızca kendi taşlarını görür; deste sırası sızmaz", () => {
    const s = newMatch();
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const view = getPlayerView(s, seat);
      expect(view.myHand.map((t) => t.id).sort()).toEqual(s.hand.hands[seat].map((t) => t.id).sort());
      const json = JSON.stringify(view);
      for (const other of [0, 1, 2, 3] as Seat[]) {
        if (other === seat) continue;
        for (const t of s.hand.hands[other]) expect(json).not.toContain(`"${t.id}"`);
      }
      for (const t of s.hand.drawPile) expect(json).not.toContain(`"${t.id}"`);
      expect(json).not.toContain("drawPile\"");
      expect(view.players.find((p) => p.seat === 0)!.tileCount).toBe(22);
    }
  });
  it("seyirci hiçbir eli görmez", () => {
    const s = newMatch();
    const view = getPlayerView(s, null);
    expect(view.myHand).toHaveLength(0);
    const json = JSON.stringify(view);
    for (const seat of [0, 1, 2, 3] as Seat[]) for (const t of s.hand.hands[seat]) expect(json).not.toContain(`"${t.id}"`);
  });
});
