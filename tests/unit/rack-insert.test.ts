import { describe, expect, it } from "vitest";
import { insertAt } from "@/components/game/store";

// 6 sütunlu, 2 sıralı küçük ıstaka
const S = (s: string) => s.split("").map((c) => (c === "." ? null : c)) as never[];
const str = (a: (string | null)[]) => a.map((c) => c ?? ".").join("");

describe("Istakada araya yerleştirme (yer değiştirme yok)", () => {
  it("boş yuvaya bırakılan taş oraya gider", () => {
    expect(str(insertAt(S("AB....CD...."), "A" as never, 4, 6))).toBe(".B..A.CD....");
  });
  it("dolu yuvaya soldan sağa: taş hedefin yanına geçer, aradakiler sola kayar", () => {
    expect(str(insertAt(S("ABCD..EF...."), "A" as never, 2, 6))).toBe("BCAD..EF....");
  });
  it("başka sıradan dolu yuvaya: hedef ve sağındakiler sağa kayar", () => {
    expect(str(insertAt(S("ABC...X....."), "X" as never, 1, 6))).toBe("AXBC........");
  });
  it("sağdan sola sürükleme: taş hedefin yerine girer, hedef sağa kayar", () => {
    expect(str(insertAt(S("ABC.D......."), "D" as never, 0, 6))).toBe("DABC........");
  });
  it("sağda boşluk yoksa sola kaydırır; sıra tamamen doluysa yer değiştirir", () => {
    expect(str(insertAt(S(".ABCDEX....."), "X" as never, 5, 6))).toBe("ABCDEX......");
    expect(str(insertAt(S("ABCDEFX....."), "X" as never, 2, 6))).toBe("ABXDEFC.....");
  });
});
