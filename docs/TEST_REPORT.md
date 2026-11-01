# Test Raporu

Tarih: 2026-11-01. Ortam: Windows 10, Node 22.12.0, Chromium (Playwright 1.64).

Bu rapordaki her sonuç bu oturumda gerçekten çalıştırılmış komutların çıktısıdır. Çalıştırılamayan testler ayrıca "Test edilemeyenler" bölümünde listelenmiştir.

## Özet

| Komut | Sonuç |
| --- | --- |
| `npm run typecheck` (`tsc --noEmit`, strict) | Hatasız |
| `npm test` (Vitest: birim + entegrasyon) | **4 dosya, 98/98 test geçti** |
| `npm run test:e2e` (Playwright, Chromium) | **2/2 test geçti** (2,4–4 dk; soğuk başlatmada daha uzun) |
| `npm run build` (`next build`, ayrıca `VERCEL=1` ile) | Başarılı: 13 sayfa ve 28 API route derlendi |

## Birim testleri: oyun motoru (`tests/unit`)

| Dosya | Test | Kapsam |
| --- | --- | --- |
| `tiles-deal.test.ts` | 11 | 106 taş; her renk/sayıdan 2 kopya ve 2 sahte okey; okey = gösterge + 1 (13 → 1); sahte okey gösterge olamaz; dağıtım 22/21/21/21 ve destede 20 taş; tohumla deterministik; dağıtıcı rotasyonu; **property testi**: hiçbir tohumda bir taş iki yerde bulunmaz |
| `melds.test.ts` | 30 | Seri/grup perler; okeyin boşluk doldurması ve uçta en yüksek değeri alması; 12-13-1 profil kuralı; 13-1-2 her zaman geçersiz; sahte okeyin yalnızca okey değerini temsil etmesi; çiftler (okey + taş, iki okey, iki sahte okey); taş işleme (seri başı/sonu, grup eksik renk); okey değiştirme |
| `game.test.ts` | 48 | Sıra ve taş çekme kuralları; katlamasız 100 puanla açılamaz, 101 ile açılır; **çift açma** (4 çiftle hayır, 5 çiftle evet, aynı taş iki çiftte kullanılamaz, katlamalıda 5 → 6 → 7); **katlamalı seri** (101 → 105 sonrası 106 → 107, seri/çift barajları ayrı); **eşli açma politikaları** (table / partnerBase / independent); **yandan alma** (açma zorunluluğu, geri bırakma cezası); **taş işleme** (açmadan işlenemez; işlek taş atma ve okey atma cezası); **okey değiştirme** (atomik başka pere işleme, kapalı profilde red); **puanlama** (normal −101, okeyle bitiş −202 ve ×2, çiftten bitiş, çift açanın eli ×2, elden bitiş, açmayan +202, elde okey +101, **eşli: bitirenin eşi 0**, takım toplamları, deste bitmesi, el içi cezalar); 1/3/5/7/9/11/13/15 ellik maçların doğru bitmesi; eşli maç kazananı; süre aşımı otomatik hamlesi; **property testi**: rastgele yasal oyunlarda 106 taş korunur ve sürüm monoton artar; gizli bilgi projeksiyonu (oyuncu ve seyirci) |

## Entegrasyon testleri (`tests/integration/multiplayer.test.ts`, 9 test)

Testlerde gerçek HTTP + WebSocket sunucuları kullanılır: **iki ayrı sunucu instance'ı** ortak veritabanını (PGlite) ve ortak pub/sub'ı paylaşır. Bu düzen, Vercel'de birden çok fonksiyon instance'ı + Redis yapısını taklit eder. Gerçek Redis kullanılmamıştır (aşağıya bakın).

| Test | Doğrulanan |
| --- | --- |
| Özel oda erişimi | Belirteçsiz/yanlış şifreyle katılım reddedilir. Sınırlı görünüm belirteci sızdırmaz. Davet linki şifreyi atlar. Çifte üyelik oluşmaz. |
| **Arkadaş daveti** | Misafir arkadaş ekleyemez. İstek → kabul → arkadaş listesi. Arkadaş olmayan davet edilemez. Reddedilen davetle giriş yapılamaz. Kabul edilen davet kullanıcıyı odaya oturtur. |
| Koltuk yarışı | Aynı koltuğa eşzamanlı iki istekten yalnızca biri kazanır, diğeri `CONFLICT` alır. |
| Oda kuralları | Kapasite sınırı; ayarları yalnızca sahip değiştirir; özel el sayısı doğrulanır; başlatma koşulları; sahibin koltuk düzenlemesi. |
| **4 oyunculu kabul akışı** | Eşli + katlamalı + yardımlı + 11 el; davet linkiyle katılım, hazır, başlat. Oyuncular iki instance'a dağıtılır. |
| Geçersiz komutlar | Sıra dışı hamle, eski sürüm, sahte taş ve seyirci komutu state'i değiştirmez. |
| İdempotentlik | Aynı `commandId` iki kez gönderildiğinde hamle bir kez uygulanır. |
| **Tam maç + yeniden bağlanma** | Botlar 11 eli WebSocket üzerinden oynar. Hamleler diğer instance'taki oyunculara ulaşır. Bağlantısı kopan oyuncu geri gelince aynı state'i görür. |
| Geçmiş ve istatistik | Maç geçmişe yazılır, istatistikler güncellenir, aynı odada yeni maç başlatılabilir. |

Örnek bot istatistiği (her çalıştırmada değişir): `[maç] komut=574 seriAçma=19 çiftAçma=4 işleme=62 bitiş=1`. Bu çıktı seri açma, çift açma, taş işleme ve bitişlerin gerçek maç akışında oluştuğunu gösterir.

## Uçtan uca testler (`tests/e2e/acceptance.spec.ts`)

Testler gerçek tarayıcılarla, ayrı tarayıcı bağlamlarında (4 bağımsız oturum, ayrı çerezler) ve gerçek WebSocket ile çalışır.

1. **Kabul senaryosu (4 tarayıcı):**
   - Misafir girişi; eşli/katlamalı/yardımlı/11 ellik özel oda oluşturma; davet linki.
   - 3 oyuncu linkle katılır, koltuklar dolar, herkes hazır olur, maç başlar ve herkes masaya yönlenir.
   - Dağıtım 22/21/21/21 doğrulanır; 85 farklı taş vardır; **hiçbir oyuncunun API yanıtında başka oyuncunun taş kimliği yoktur**.
   - Baraj göstergesi "101 puan" görünür.
   - İlk oyuncu taşı **sürükleyip** atma alanına bırakır ve atılan taş diğer tarayıcılarda görünür.
   - Sıradaki oyuncu taş çeker ve onaylı taş atar.
   - Skor tablosu açılır.
   - Sayfa yenilemede ıstaka aynen geri gelir; çevrimdışı/çevrimiçi geçişinde oyun sürer.
   - 30 slotluk ıstakada sürükleyerek yer değiştirme çalışır.
2. **Mobil:** dokunmatik viewport (844×390), dokunmatik pointer olaylarıyla ıstakada taş taşıma ve dokunarak seçme. Yardımsız modda öneri, sıralama ve baraj göstergesi gizlenir.

## Bu turda bulunan ve düzeltilen hatalar

| Öncelik | Hata | Düzeltme |
| --- | --- | --- |
| Yüksek | Yerel geliştirme sunucusunda Next.js kendi `upgrade` dinleyicisini HTTP sunucusuna ekleyip `/api/ws` soketlerini kapatıyordu. Tarayıcı ≈1 sn'de bir yeniden bağlanıyor, hamleler gecikiyordu. | `scripts/dev-server.ts` içinde `/api/ws` yükseltmeleri yalnızca oyunun WebSocket sunucusuna yönlendirildi. Sorun yalnızca yerel ortamı etkiliyordu; Vercel'de `upgradeWebSocket` kullanılır. |
| Yüksek | Postgres TLS bağlantısı sertifika doğrulamasız kuruluyordu (`rejectUnauthorized: false`). | Doğrulamalı TLS kullanılıyor; `sslmode` URL'de varsa pg onu uygular. |
| Orta | `/api/health` hata mesajlarını (host, kullanıcı adı içerebilir) herkese açık döndürüyordu. | Ayrıntılar yalnızca sunucu loguna yazılıyor. |
| Orta | `OKEY_ALLOW_MEMORY=1` Vercel'de tanımlanırsa bellek içi yedekler devreye girebiliyordu. | `VERCEL` ortamında yedekler her zaman kapalı. |
| Orta | Reddedilmiş bir oda daveti, katılma denemesinde "kabul edildi" olarak işaretleniyordu (giriş vermese de). | Durum yalnızca geçerli davette güncelleniyor. Test eklendi. |
| Düşük | E2E testinde "Taş çek" seçicisi "Desteden taş çek" düğmesiyle de eşleşiyordu. | Tam eşleşmeli seçici kullanılıyor. |

Önceki turda düzeltilenler: `READY_NEXT_HAND` sürüm yarışı, `redrawFakeJokerIndicator=false` çökmesi, ıstaka taşlarında eksik `aria-pressed`, sentetik olaylarda `setPointerCapture` hatası, lobiden maça yönlendirme yedeği, istemci tarafında eski soket olayları.

## Canlı ortam doğrulaması (2026-11-01, https://online101okey.vercel.app)

Vercel Hobby, fra1; Neon Postgres (free, fra1); Upstash Redis (free, fra1).

- `/api/health` → 200 `{"ok":true,"checks":{"database":"ok","redis":"ok"}}`
- Vercel Functions WebSocket: `wss://…/api/ws` 0,6 sn'de açıldı, 15 sn açık kaldı, ping/pong çalıştı.
- `npx playwright test -c playwright.prod.config.ts` → **2/2 geçti** (57 sn). 4 tarayıcılı kabul senaryosu ve mobil test, canlı sitede gerçek Postgres, Redis ve Vercel WebSocket ile çalıştı.

Böylece aşağıdaki listede yer alan Vercel WebSocket, gerçek Redis ve gerçek Postgres maddeleri canlıda doğrulanmıştır. Yük testi ve 300 sn sonrası otomatik yeniden bağlanmanın canlıda uzun süreli gözlemi hâlâ yapılmadı.

## Test edilemeyenler (tamamlandı olarak işaretlenmez)

- **Vercel Functions WebSocket (`upgradeWebSocket`) gerçek ortamda çalıştırılmadı.**
  - Kod `@vercel/functions` 3.10.5 API'sine göre yazıldı ve derleniyor.
  - Aynı `handleConnection` yerelde `ws` ile test edildi.
  - Gerçek Vercel instance davranışı (bağlantı süresi, instance sabitleme) dağıtımdan sonra doğrulanmalıdır.
- **Gerçek Redis kullanılmadı.**
  - `RedisInfra` (ioredis: kilit için Lua compare-and-delete, pub/sub, TTL) yazıldı ancak testler bellek içi adaptörle çalıştı.
  - İlk dağıtımda `/api/health` ve iki tarayıcılı deneme ile doğrulanmalıdır.
- **Gerçek yönetilen PostgreSQL (Neon) kullanılmadı.** Testler aynı Drizzle şemasını ve migrasyonlarını PGlite (gerçek Postgres motoru) üzerinde çalıştırdı. `pg` havuzu ve `scripts/migrate.ts` gerçek sunucuya karşı çalıştırılmadı.
- **Yük testi yapılmadı.**
- **RTL bileşen testleri yazılmadı.** Arayüz E2E ile sınandı.
- **Tarayıcılar:** yalnızca Chromium (masaüstü ve mobil viewport) ile sınandı. Firefox/Safari ve gerçek mobil cihaz testi yapılmadı.
- Erişilebilirlik denetimi (ekran okuyucu) yalnızca temel düzeydedir: aria etiketleri E2E'de kullanılıyor, ancak tam bir denetim yapılmadı.
