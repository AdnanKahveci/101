# Online 101 Okey: Oyun Kuralları (Varsayılan Profil "Klasik 101")

Bu belge `src/engine` içindeki oyun motorunun **gerçekte uyguladığı** kuralları anlatır. Değerler `src/engine/rules.ts` içindeki `DEFAULT_RULES` nesnesinden gelir. Bölgeye ya da platforma göre değişen kurallar `docs/RULE_VARIANTS.md` dosyasında ayarlanabilir seçenekler olarak listelenmiştir. Tüm kurallar sunucuda doğrulanır; istemcideki kontroller yalnızca kolaylık sağlar.

## 1. Taşlar

- 4 renk: Kırmızı (`r`), Sarı (`y`), Mavi (`b`), Siyah (`k`).
- Her renkte 1-13 arası sayılar, her birinden **2 fiziksel kopya** vardır (104 taş).
- **2 sahte okey** (`f-0`, `f-1`).
- Toplam **106 taş**. Her taşın benzersiz kimliği vardır: `r5-0`, `k13-1`, `f-0` gibi.

## 2. Gösterge ve okey

- Dağıtımdan sonra kalan desteden bir **gösterge** taşı açılır.
- **Okey**, göstergeyle aynı renkte bir üst sayıdır. Gösterge 13 ise okey 1 olur (`okeyFromIndicator`).
- Gösterge sahte okey çıkarsa sıradaki taş gösterge yapılır (`redrawFakeJokerIndicator = true`).
- **Gerçek okey** (okey yüzlü 2 taş) jokerdir: perde ve çiftte istenen taşın yerine geçer.
- **Sahte okey** joker değildir. Yalnızca gerçek okeyin basılı yüzünü temsil eder. Örneğin gösterge Mavi 3 ise okey Mavi 4 olur; bu durumda sahte okey Mavi 4 sayılır ve Mavi 3-[sahte]-Mavi 5 geçerli bir seridir. Kırmızı 5-[sahte]-Kırmızı 7 ise geçersizdir.

## 3. Dağıtım ve sıra

- Dağıtıcının sağındaki oyuncu (`dealer + 1`) ilk oyuncudur ve **22** taş alır. Diğer üç oyuncu **21**'er taş alır. 1 taş gösterge olur ve destede **20** taş kalır.
- Dağıtıcı her elde bir koltuk kayar: `dealer = (startDealer + elNo − 1) mod 4`.
- Sıra sağa doğru ilerler (koltuk `s` → `s+1`).
- İlk oyuncu taş **çekmeden** bir taş atarak başlar.
- Normal tur şöyle ilerler: (1) desteden çek (`DRAW_TILE`) veya önceki oyuncunun son attığı taşı al (`TAKE_DISCARD`); (2) istersen elini aç veya taş işle; (3) bir taş at (`DISCARD_TILE`) ya da son taşla bit (`FINISH_HAND`).
- Aynı turda iki kez taş alınamaz. Sırası olmayan oyuncunun her hamlesi reddedilir ve state değişmez.
- Dağıtım deterministiktir: `createRng(seed:deal:elNo)`. Seed sunucuda kriptografik olarak üretilir (`matches.seed_secret`) ve istemciye gönderilmez.

## 4. Perler

### Seri
- Aynı renkten **en az 3 ardışık** sayıdan oluşur. Örnekler: Kırmızı 5-6-7, Siyah 10-11-12-13.
- 1 yalnızca serinin başında olabilir. Varsayılan profilde **12-13-1 geçersizdir** (`allowThirteenOne = false`).
- Bu kural açıldığında 13'ten sonraki 1 geçerli olur ve **14 puan** sayılır (`aceAfterThirteenPoints`).
- **13-1-2 her profilde geçersizdir.**

### Grup
- Aynı sayıdan, farklı renklerde **3 veya 4** taştan oluşur. Aynı renk tekrar edemez.

### Okey kullanımı
- Okeyler serideki boşlukları ya da gruptaki eksik renkleri doldurur. Per yalnızca okeylerden oluşamaz.
- Okeyin yeri birden fazla şekilde yorumlanabiliyorsa, açılış puanı lehine **en yüksek puanlı geçerli yorum** seçilir. Örneğin Kırmızı 5-6-[okey] = 5-6-7 = 18 puan olur.
- Oyuncu okeyin hangi yüzü temsil edeceğini `jokerFaces` ile açıkça belirtebilir. Örneğin okey Kırmızı 4 olarak verilirse aynı per 15 puan olur.
- Masaya konan perde okeyin temsil ettiği yüz sabitlenir.

## 5. Çiftler

- Aynı renk ve aynı sayıdaki iki fiziksel taş bir çift oluşturur.
- Okey + herhangi bir taş çifttir (`allowJokerPair = true`). İki okey çift değildir (`allowDoubleJokerPair = false`).
- İki sahte okey aynı yüzü temsil ettiği için çifttir.
- Bir taş iki farklı çiftte kullanılamaz.

## 6. El açma

- Açılış tek hamlede yapılır (`OPEN_MELDS` veya `OPEN_PAIRS`). Açılıştan sonra elde atmak için **en az 1 taş** kalmalıdır.
- **Seri açılış:** perlerin toplamı en az **101** olmalıdır. Okeyler temsil ettikleri değerle sayılır. Örneğin Kırmızı 10-13 (46) + Siyah 10-13 (46) + 3'lü grup (9) = **101** ile açılır, Kırmızı 10-13 (46) + Siyah 11-13 (36) + Sarı 5-7 (18) = **100** ile açılmaz.
- **Çift açılış:** en az **5 çift** gerekir.
- Seri açan oyuncu sonraki turlarda **barajsız** yeni perler açabilir. Çift açan oyuncu sonraki turlarda yeni çiftler ekleyebilir.
- Çift açan oyuncu seri per açamaz (`pairOpenerCanOpenMelds = false`). Seri açan oyuncu çift açamaz (`meldOpenerCanOpenPairs = false`).

### Katlamalı (`folding = true`)
- İlk seri açılış en az 101 olmalıdır. Sonraki her seri açılış o eldeki **en yüksek seri açılışı en az 1 puan geçmelidir**. Örnek dizi: 105 açıldı → sonraki en az 106 → 106 açıldı → sonraki en az 107. 105'ten sonra 105 ile açılamaz.
- Çift barajı ayrı tutulur: ilk çift açılışı 5 çift ister, sonra 6, sonra 7.
- Katlamasız masada barajlar her zaman 101 / 5'tir.

### Eşli açılış politikası (`teamOpeningPolicy`)
- `table` (varsayılan): masa barajı eş dahil herkese uygulanır.
- `partnerBase`: eşi açmış oyuncu temel 101 / 5 çiftle açar.
- `independent`: yalnızca rakip takımın açılışları barajı yükseltir.

Örnek (katlamalı, eşli): koltuk 0 105 ile açtı.
- `table`: koltuk 2 (eşi) için baraj 106, koltuk 1 için 106.
- `partnerBase`: koltuk 2 için 101, koltuk 1 için 106.
- `independent`: koltuk 2 için 101, koltuk 1 ve 3 için 106.

## 7. Yandan taş alma

- Yalnızca önceki oyuncunun (solundaki koltuk) **en son attığı** taş alınabilir.
- Alınan taş aynı turda kullanılmalıdır:
  - Henüz açmamış oyuncu açılışta bu taşı kullanmak zorundadır.
  - Açmış oyuncu taşı bir pere işlemeli ya da yeni bir perde kullanmalıdır.
- Taş kullanılmadan taş atılamaz. Oyuncu `RETURN_DISCARD` ile taşı geri bırakabilir. Bu durumda cezalı masada **+101** (`failedTakePenalty`) ceza alır ve desteden çekmeye döner.
- Taş yığından çıkarıldığı için aynı taş iki kişi tarafından alınamaz.

## 8. Taş işleme ve okey değiştirme

- Elini açmış oyuncu masadaki herhangi bir perin (kimin olursa olsun) serisinin başına veya sonuna uygun taş ekleyebilir ya da gruba eksik rengi ekleyebilir (`ADD_TO_MELD`).
- Seriye okey eklenirken uç (`side`) seçilebilir.
- Çift açan oyuncu da pere taş işleyebilir (`pairOpenerCanAddToMelds = true`).
- **Okey değiştirme** (`REPLACE_JOKER`, `jokerReplacePolicy = openedOnly`): açmış oyuncu, masadaki okeyin temsil ettiği gerçek taşı koyup okeyi alabilir. Gruplarda okey eksik renklerden herhangi birinin yerine geçebilir.
- Okey değiştirme **atomiktir**: alınan okey aynı komut içinde ya yeni bir perde (`newMeld`) ya da mevcut bir pere (`addToMeld`) kullanılmalıdır. Herhangi bir parça geçersizse hamlenin tamamı reddedilir.

## 9. Bitiş türleri

Açmış bir oyuncu, elinde tek taş kaldığında o taşı atarak biter. Açmadan bitilemez.

| Tür | Koşul | Bitiren puanı | Rakip cezalarına çarpan |
|---|---|---|---|
| Normal | Normal taş atarak | −101 | ×1 |
| Okeyle | Son atılan taş gerçek okey | −202 | ×2 |
| Çiftten | Bitiren çift açmış | −202 | ×2 |
| Elden | Tura açılmamış başlayıp aynı turda açıp biten | −202 | ×2 |
| Elden okeyle | Elden + son taş okey | −404 | ×2 × ×2 = ×4 |
| Deste bitti | Atılan taştan sonra destede taş yok | bitiren yok | ×1 |

Çarpanlar `stackMultipliers = true` iken çarpılarak birleşir. Örneğin çift açmış bir oyuncu okeyle biterse çarpan ×4 olur. Kural kapalıysa en büyük çarpan uygulanır.

## 10. El sonu puanlaması (`calculateHandScore`)

101'de **düşük puan iyidir**.

- Bitiren oyuncu yukarıdaki tablodaki puanı yazar.
- **Açmayan** oyuncu: `+202 × çarpan`.
- **Açmış** oyuncu: elde kalan taşların sayı toplamı + her gerçek okey için `+101` (sahte okey, okeyin sayı değeriyle sayılır).
  - Çift açmışsa bu toplam ×2 alınır.
  - Ardından bitiş çarpanı uygulanır.
- **El içi cezalar** çarpılmadan eklenir:
  - okey atma (+101)
  - işlek taş atma (+101)
  - yandan alıp kullanamama (+101)
  - attığı taş yandan alınıp kullanılan oyuncuya taş değeri ×10 (seri/işleme) veya ×20 (çift)
- **Eşli:** bitirenin eşinin el cezası sıfırlanır (`partnerOfFinisherScoresZero = true`); el içi cezaları yine yazılır. Takım puanı iki oyuncunun toplamıdır.

Her sonuç satırı `breakdown`, `reasons`, `appliedMultipliers`, `penalties` ve `bonuses` alanlarıyla oyunculara açıklanır.

### Örnekler (motor testleriyle doğrulanmıştır: `tests/unit/game.test.ts`)

Bu örneklerde okey Mavi 4'tür:
- koltuk 1 açmadı;
- koltuk 2 açtı ve elinde Siyah 5, Siyah 8, Siyah 1 kaldı (toplam 14);
- koltuk 3 açmadı ve elinde gerçek okey var.

1. **Normal bitiş** (koltuk 0): 0 → −101, 1 → +202, 2 → +14, 3 → +202. Koltuk 3 açmadığı için okey cezası ayrıca yazılmaz; açmayan oyuncu düz 202 alır.
2. **Okeyle bitiş:** 0 → −202, 1 → +404, 2 → +28, 3 → +404.
3. **Çiftten bitiş:** 0 → −202, 1 → +404, 2 → +28, 3 → +404.
4. **Açmış oyuncunun elinde okey kalırsa:** koltuk 2'nin eline gerçek okey eklenirse normal bitişte 14 + 101 = **115** yazar.
5. **Çift açmış rakip:** koltuk 2 çift açmış olsaydı normal bitişte 14 × 2 = **28** yazardı.
6. **Eşli normal bitiş:** 0 → −101, 1 → +202, 2 (eş) → 0, 3 → +202. Takım puanları: Alt-Üst −101, Sağ-Sol +404.
7. **Elden bitiş:** bitiren −202, açmayan rakip +404.
8. **El içi ceza:** koltuk 1 el içinde okey attıysa normal bitişte 202 + 101 = **303** yazar.
9. **Deste bitmesi:** kimse açmadıysa herkes +202 yazar (`deckExhaustedScoring = "penalties"`).

## 11. Cezalar (cezalı masa, `penaltiesEnabled = true`)

- **Okey atma:** bitiş hamlesi dışında +101.
- **İşlek taş atma:** masadaki bir pere işlenebilecek (veya perdeki okeyin yerine geçebilecek) taşı atmak +101. İşlek taşlar arayüzde gösterilmez.
- **Yandan alınan taşı kullanamama:** +101 (alan oyuncuya).
- **Yandan alınan taşın kullanılması:** taşı ATAN oyuncuya taş değeri ×10 (seri açma, yeni per, işleme) veya ×20 (çift açma/işleme). Açmadan önce de açtıktan sonra da geçerlidir (`takenTileMeldMultiplier`, `takenTilePairMultiplier`).
- **Kafadan bitiş:** kimse açmamışken bir oyuncu ilk açışında (tek turda açıp) biterse bitirene ve eşine puan yazılmaz (0); rakiplerin her birine +404 yazılır (`headFinishPenalty`). El içi cezalar yine eklenir. Başkası açmışken tek turda açıp bitmek normal "elden bitiş"tir (−202, rakipler ×2).
- **Rakibin okeyini alma:** taş işlerken rakibin perindeki okeyin yerine gerçek taşı koyup okeyi alırsanız (ör. rakip Kırmızı 10-11-okey açmış, sizde Kırmızı 12 var) per sahibine +101 ceza yazılır (`jokerTakenPenalty`). Kendi perinizden veya eşli oyunda eşinizin perinden almak cezasızdır.
- **Göstergeyle çift:** göstergenin eşini elinde tutan oyuncu, ilk açılışında masadaki gösterge taşını alıp (`TAKE_INDICATOR`) ıstakasında istediği yere koyabilir ve eşiyle çift olarak açabilir. Alınan gösterge aynı turda bir çiftte kullanılmalıdır; kullanılmayacaksa cezasız geri bırakılır (`RETURN_INDICATOR`). Okey belirlenmiş olduğu için değişmez.
- **Çift işleme:** seri açmış oyuncu, masada biri çift açmışsa elindeki çiftleri de masaya koyabilir.
- **Eşli katlamalı baraj (varsayılan `independent`):** yalnızca rakip takımın açılışları barajı yükseltir. Ör. ben 140, rakip 144 açtıysa eşim en az 145 açmalı; rakip açmadıysa eşime 101 yeter.
- **Geçersiz hamle girişimi:** ceza verilmez; sunucu hamleyi reddeder ve state değişmez.

## 12. Siler (`silerEnabled`, varsayılan kapalı)

Elden biten oyuncunun (eşlide takımının) maç boyunca biriken pozitif toplamı sıfırlanır. Bu, platforma özgü bir tanımdır ve `docs/RULE_VARIANTS.md` içinde belgelenmiştir.

## 13. Süre aşımı ve bağlantı kopması

- **`turnSeconds`** (varsayılan 60): süre dolduğunda ve `timeoutPolicy = "autoPlay"` ise sunucu, her zaman yasal olan şu hamleyi uygular:
  - yandan alınmış taş varsa geri bırakılır;
  - desteden çekilir;
  - çekilen taş atılır (çekilen taş okeyse ya da ilk oyuncuysa, okey olmayan en yüksek taş atılır).
- Rastgele veya yasadışı hamle üretilmez. `wait` politikasında otomatik hamle yapılmaz.
- El sonucu ekranında 90 saniye içinde herkes hazır olmazsa sonraki el kendiliğinden başlar (`NEXT_HAND_AUTO_MS`).
- Bağlantısı kopan oyuncunun koltuğu korunur; geri geldiğinde en güncel state'i görür.

## 14. Maç

- El sayısı seçenekleri 3, 5, 7, 9, 11, 15 ve 21'dir; 1-51 arasında özel değer de girilebilir.
- Her el sonunda toplamlar güncellenir. Son el bittiğinde en düşük toplam (eşlide takım toplamı) kazanır; eşitlikte kazananlar birlikte listelenir.
- Oda lobiye döner ve oyuncular aynı odada yeni maç başlatabilir.
