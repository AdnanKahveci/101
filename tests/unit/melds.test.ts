import { describe, expect, it } from "vitest";
import {
  addTileToMeld,
  DEFAULT_RULES,
  okeyFromIndicator,
  replaceJokerInMeld,
  validateMeld,
  validatePair,
  type TableMeld,
} from "@/engine";
import { T } from "../helpers";

const okey = okeyFromIndicator(T("b3-0")); // Mavi 4 okey
const R = DEFAULT_RULES;
const v = (ids: string[], rules = R) => validateMeld(ids.map(T), okey, rules);

describe("Seri per", () => {
  it("Kırmızı 5-6-7 geçerlidir", () => {
    const r = v(["r5-0", "r6-0", "r7-1"]);
    expect(r.ok && r.value.kind).toBe("run");
    expect(r.ok && r.value.points).toBe(18);
  });
  it("Siyah 10-11-12-13 geçerlidir", () => {
    const r = v(["k10-0", "k11-0", "k12-0", "k13-0"]);
    expect(r.ok && r.value.points).toBe(46);
  });
  it("farklı renkli seri reddedilir", () => {
    expect(v(["r5-0", "y6-0", "r7-0"]).ok).toBe(false);
  });
  it("ardışık olmayan seri reddedilir", () => {
    expect(v(["r5-0", "r7-0", "r8-0"]).ok).toBe(false);
  });
  it("iki taşlık per reddedilir", () => {
    expect(v(["r5-0", "r6-0"]).ok).toBe(false);
  });
  it("okey boşluğu doldurur: Kırmızı 5-[okey]-7 geçerli ve okey 6 sayılır", () => {
    const r = v(["r5-0", "b4-0", "r7-0"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.points).toBe(18);
      expect(r.value.cells[1]).toMatchObject({ tileId: "b4-0", value: 6, color: "red", isJoker: true });
    }
  });
  it("uçtaki okey en yüksek değerli konuma yerleşir (açılış puanı lehine)", () => {
    const r = v(["r5-0", "r6-0", "b4-1"]);
    expect(r.ok && r.value.points).toBe(18); // 5-6-7
  });
  it("okeyin yüzü açıkça istenebilir (4-5-6)", () => {
    const r = validateMeld(["r5-0", "r6-0", "b4-1"].map(T), okey, R, { jokerFaces: { "b4-1": { color: "red", value: 4 } } });
    expect(r.ok && r.value.points).toBe(15);
  });
  it("12-13-[okey] → okey 11 olarak yerleşir (varsayılan profilde 13'ten sonra 1 yok)", () => {
    const r = v(["r12-0", "r13-0", "b4-0"]);
    expect(r.ok && r.value.cells.map((c) => c.value)).toEqual([11, 12, 13]);
  });
  it("varsayılan profilde 12-13-1 reddedilir", () => {
    const r = v(["r12-0", "r13-0", "r1-0"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("12-13-1");
  });
  it("12-13-1 hiçbir şekilde açılamaz / işlenemez; oda ayarı açık gönderilse bile kapalı kalır", async () => {
    const { settingsToRules, DEFAULT_ROOM_SETTINGS } = await import("@/server/validation");
    const rules = settingsToRules({ ...DEFAULT_ROOM_SETTINGS, allowThirteenOne: true } as never);
    expect(rules.allowThirteenOne).toBe(false);
    expect(v(["r12-0", "r13-0", "r1-0"], rules).ok).toBe(false);
    expect(v(["r11-0", "r12-0", "r13-0", "r1-0"], rules).ok).toBe(false);
    const meld: TableMeld = { id: "m", owner: 0, kind: "run", cells: [11, 12, 13].map((n) => ({ tileId: `r${n}-0` as never, color: "red", value: n, isJoker: false })) };
    expect(addTileToMeld(meld, T("r1-0"), okey, rules).ok).toBe(false);
  });
  it("13-1-2 her profilde reddedilir", () => {
    expect(v(["r13-0", "r1-0", "r2-0"]).ok).toBe(false);
    expect(v(["r13-0", "r1-0", "r2-0"], { ...R, allowThirteenOne: true }).ok).toBe(false);
  });
  it("allowThirteenOne açıkken 12-13-1 geçerlidir ve 1 = 14 puan", () => {
    const r = v(["r12-0", "r13-0", "r1-0"], { ...R, allowThirteenOne: true });
    expect(r.ok && r.value.points).toBe(12 + 13 + 14);
  });
  it("sahte okey gerçek okeyin değerini temsil eder: Mavi 3-[sahte]-5 geçerli", () => {
    const r = v(["b3-1", "f-0", "b5-0"]);
    expect(r.ok && r.value.cells[1]).toMatchObject({ tileId: "f-0", value: 4, isJoker: false });
  });
  it("sahte okey keyfi değer alamaz: Kırmızı 5-[sahte]-7 geçersiz", () => {
    expect(v(["r5-0", "f-0", "r7-0"]).ok).toBe(false);
  });
  it("aynı taş iki kez kullanılamaz", () => {
    expect(v(["r5-0", "r5-0", "r6-0"]).ok).toBe(false);
  });
});

describe("Grup per", () => {
  it("Kırmızı 8, Siyah 8, Mavi 8 geçerlidir", () => {
    const r = v(["r8-0", "k8-0", "b8-0"]);
    expect(r.ok && r.value.kind).toBe("group");
    expect(r.ok && r.value.points).toBe(24);
  });
  it("aynı renk tekrar edemez", () => {
    const r = v(["r8-0", "r8-1", "b8-0"]);
    expect(r.ok).toBe(false);
  });
  it("farklı sayılar reddedilir", () => {
    expect(v(["r8-0", "k9-0", "b8-0"]).ok).toBe(false);
  });
  it("en fazla dört taş", () => {
    expect(v(["r8-0", "k8-0", "b8-0", "y8-0"]).ok).toBe(true);
    expect(v(["r8-0", "k8-0", "b8-0", "y8-0", "b4-0"]).ok).toBe(false);
  });
  it("okeyli grup: eksik rengi temsil eder", () => {
    const r = v(["r8-0", "k8-0", "b4-0"]);
    expect(r.ok && r.value.points).toBe(24);
  });
});

describe("Çift", () => {
  it("aynı renk ve sayıdaki iki fiziksel taş çifttir", () => {
    expect(validatePair(T("r8-0"), T("r8-1"), okey, R).ok).toBe(true);
  });
  it("farklı renk çift değildir", () => {
    expect(validatePair(T("r8-0"), T("k8-1"), okey, R).ok).toBe(false);
  });
  it("okey + taş varsayılan profilde çifttir", () => {
    expect(validatePair(T("r8-0"), T("b4-0"), okey, R).ok).toBe(true);
    expect(validatePair(T("r8-0"), T("b4-0"), okey, { ...R, allowJokerPair: false }).ok).toBe(false);
  });
  it("iki okey varsayılan profilde çift değildir", () => {
    expect(validatePair(T("b4-1"), T("b4-0"), okey, R).ok).toBe(false);
  });
  it("iki sahte okey çifttir (aynı yüz)", () => {
    expect(validatePair(T("f-0"), T("f-1"), okey, R).ok).toBe(true);
  });
});

describe("Taş işleme ve okey değiştirme", () => {
  const run: TableMeld = {
    id: "m1",
    kind: "run",
    owner: 0,
    cells: [
      { tileId: "r5-0", color: "red", value: 5, isJoker: false },
      { tileId: "b4-0", color: "red", value: 6, isJoker: true },
      { tileId: "r7-0", color: "red", value: 7, isJoker: false },
    ],
  };
  it("serinin sonuna ve başına uygun taş eklenir", () => {
    expect(addTileToMeld(run, T("r8-0"), okey, R).ok).toBe(true);
    expect(addTileToMeld(run, T("r4-0"), okey, R).ok).toBe(true);
  });
  it("uymayan taş reddedilir", () => {
    expect(addTileToMeld(run, T("r9-0"), okey, R).ok).toBe(false);
    expect(addTileToMeld(run, T("y8-0"), okey, R).ok).toBe(false);
  });
  it("grup pere eksik renk eklenir, var olan renk eklenemez", () => {
    const g: TableMeld = {
      id: "g",
      kind: "group",
      owner: 0,
      cells: [
        { tileId: "r8-0", color: "red", value: 8, isJoker: false },
        { tileId: "k8-0", color: "black", value: 8, isJoker: false },
        { tileId: "b8-0", color: "blue", value: 8, isJoker: false },
      ],
    };
    expect(addTileToMeld(g, T("y8-0"), okey, R).ok).toBe(true);
    expect(addTileToMeld(g, T("r8-1"), okey, R).ok).toBe(false);
  });
  it("okeyin yerine temsil ettiği gerçek taş konur, okey geri alınır", () => {
    const r = replaceJokerInMeld(run, T("r6-1"), okey);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.jokerTileId).toBe("b4-0");
      expect(r.value.cells[1]).toMatchObject({ tileId: "r6-1", isJoker: false, value: 6 });
    }
  });
  it("yanlış taşla okey değiştirilemez", () => {
    expect(replaceJokerInMeld(run, T("r9-1"), okey).ok).toBe(false);
  });
});
