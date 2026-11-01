# Kural Varyantları (`RuleProfile`)

Kural profili `src/engine/types.ts` → `RuleProfile` içinde tanımlıdır, varsayılanlar `src/engine/rules.ts` → `DEFAULT_RULES` içindedir. Oda ayarları (`src/server/validation.ts` → `roomSettingsSchema`) oda sahibinin değiştirebildiği alanlardır; maç başladığında `settingsToRules` ile profil üretilir ve **dondurulur** (aktif maç sırasında oda ayarı değiştirilemez).

"Oda ayarı" sütunu `—` olan alanlar sabit varsayılan değerle çalışır (yalnızca kodla değiştirilebilir).

| Alan | Anlamı | Varsayılan | Alternatifler | Oda ayarı (form etiketi) |
|---|---|---|---|---|
| `profileName` | Profil adı | "Klasik 101" (odada "Eşli · Katlamalı · Yardımlı" gibi üretilir) | — | otomatik |
| `teamMode` | Eşli oyun (0+2, 1+3 takım) | `false` | `true` | Eşli 101 |
| `folding` | Katlamalı: açılışlar öncekini geçmeli | `false` | `true` | Katlamalı |
| `assisted` | Yardımlı mod (öneri, vurgu, puan hesabı) | `true` | `false` | Yardımlı |
| `penaltiesEnabled` | El içi cezalar (okey/işlek atma, yan taş) | `true` | `false` | Cezalı |
| `allowRunOpening` | Seri ile açılış | `true` | `false` (en az biri açık olmalı) | Seri açma |
| `allowPairOpening` | Çift ile açılış | `true` | `false` | Çift açma |
| `allowThirteenOne` | 12-13-1 / 11-12-13-1 serileri; 13-1-2 her zaman geçersiz | `false` | `true` | 12-13-1 serisi |
| `aceAfterThirteenPoints` | 13'ten sonraki 1'in puanı | `14` | sayı | — |
| `minOpeningPoints` | Seri açılış barajı | `101` | 1-300 | — |
| `minOpeningPairs` | Çift açılış barajı | `5` | 1-10 | — |
| `allowJokerPair` | Okey + taş = çift | `true` | `false` | Okeyle çift |
| `allowDoubleJokerPair` | Okey + okey = çift | `false` | `true` | — |
| `pairOpenerCanAddToMelds` | Çift açan pere taş işleyebilir | `true` | `false` | Çift açan pere işler |
| `pairOpenerCanOpenMelds` | Çift açan sonradan seri açabilir | `false` | `true` | — |
| `meldOpenerCanOpenPairs` | Seri açan sonradan çift açabilir | `false` | `true` | — |
| `teamOpeningPolicy` | Eşli katlama barajı | `"table"` | `"partnerBase"`, `"independent"` | Eşin açılış politikası |
| `jokerReplacePolicy` | Okey değiştirme | `"openedOnly"` | `"disabled"` | Okey değiştirme |
| `redrawFakeJokerIndicator` | Gösterge sahte okey çıkarsa yeniden seç | `true` | — (sabit) | Oda ayarı değil; motor her zaman yeniden seçer |
| `finishScore` | Normal bitiş | `-101` | sayı | — |
| `jokerFinishScore` | Okeyle bitiş | `-202` | sayı | — |
| `pairFinishScore` | Çift açanın bitişi | `-202` | sayı | — |
| `handFinishScore` | Elden bitiş | `-202` | sayı | — |
| `handJokerFinishScore` | Elden okeyle bitiş | `-404` | sayı | — |
| `unopenedPenalty` | Açmayan oyuncu cezası | `202` | sayı | — |
| `jokerInHandPenalty` | Açmışın elinde kalan her gerçek okey | `101` | sayı | — |
| `jokerFinishMultiplier` | Okeyle bitişte rakip çarpanı | `2` | 1-4 | Okeyle bitiş × |
| `pairFinishMultiplier` | Çift açanın bitişinde rakip çarpanı | `2` | 1-4 | Çiftten bitiş × |
| `handFinishMultiplier` | Elden bitişte rakip çarpanı | `2` | 1-4 | Elden bitiş × |
| `stackMultipliers` | Çarpanlar çarpılarak birleşir; kapalıysa en büyüğü | `true` | `false` | Çarpanlar çarpılarak birleşir |
| `pairOpenerHandMultiplier` | Çift açmış oyuncunun el toplamı çarpanı | `2` | sayı | — |
| `partnerOfFinisherScoresZero` | Eşli: bitirenin eşi el cezası yazmaz | `true` | `false` | Bitirenin eşi ceza yazmaz |
| `discardJokerPenalty` | Okey atma cezası (bitiş hariç) | `101` | sayı | — (Cezalı ile açılır/kapanır) |
| `discardPlayablePenalty` | İşlek taş atma cezası | `101` | sayı | — (Cezalı ile) |
| `failedTakePenalty` | Yan taşı kullanamayıp geri bırakma | `101` | sayı | — (Cezalı ile) |
| `silerEnabled` | Elden biten pozitif toplamını siler | `false` | `true` | Siler |
| `deckExhaustedScoring` | Deste bitince eller yazılır mı | `"penalties"` | `"noScore"` | Deste bitince |
| `totalHands` | Maçtaki el sayısı | `11` | 3/5/7/9/11/15/21 veya özel 1-51 | El sayısı |
| `turnSeconds` | Hamle süresi (0 = süresiz) | `60` | 0 veya 15-600 | Hamle süresi |
| `timeoutPolicy` | Süre dolunca / oyuncu kopunca davranış | `"autoPlay"` | `"wait"` | Süre dolunca / oyuncu ayrılınca |


Oda düzeyi ek ayar: `allowSpectators` (varsayılan `true`). Seyirciler hiçbir oyuncunun gizli taşlarını göremez; seyirci izni kapalıysa oyuncu olmayan üyeler maç görünümünü alamaz.

## Tartışmalı kuralların varsayılan seçimleri ve gerekçeleri

- **12-13-1:** Bölgeden bölgeye değişir. Sessizce kabul etmemek için varsayılan olarak kapalıdır. Açıldığında 1, 14 puan sayılır. 13-1-2 hiçbir profilde geçerli değildir.
- **Okeyin konumu:** Okeyin yorumu belirsizse açılış puanı lehine en yüksek yorum seçilir. Oyuncu `jokerFaces` ile farklı bir yorum isteyebilir. Masaya konduktan sonra okeyin konumu sabittir.
- **Yandan alma:** Alınan taş aynı turda kullanılmalıdır. Kullanılamazsa taş geri bırakılır ve +101 ceza yazılır (hatalı açma cezasının karşılığı).
- **Siler:** Platforma özgü tanım kullanılmıştır: elden biten oyuncu veya takım biriken pozitif toplamını sıfırlar. Bu yüzden varsayılan olarak kapalıdır.
- **Deste bitmesi:** Son atılan taştan sonra destede taş kalmamışsa el hemen biter. Sonraki oyuncuya yandan alma hakkı tanınmaz.
- **Süre aşımı:** Rastgele veya yasadışı hamle yapılmaz. Yalnızca deterministik ve her zaman yasal olan "çek + çekileni at" hamlesi uygulanır.
