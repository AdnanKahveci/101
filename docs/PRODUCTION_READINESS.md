# Üretime Hazırlık Raporu

Tarih: 2026-11-01

**Karar: kod tarafı yayına hazır. Canlıya çıkış, 3 dağıtım sonrası doğrulamaya bağlıdır.**

- Oyun motoru, sunucu ve arayüz otomatik testlerden geçiyor:
  - typecheck temiz;
  - 98/98 Vitest;
  - 2/2 Playwright (4 tarayıcı);
  - üretim derlemesi başarılı.
- Vercel WebSocket, gerçek Redis ve gerçek yönetilen Postgres bu ortamda çalıştırılamadı. Bu üçü ilk preview dağıtımında doğrulanmadan production'a açılmamalıdır.

## Denetim sonucu

| Kontrol | Sonuç |
| --- | --- |
| TODO / FIXME / mock / placeholder taraması (`src`, `scripts`) | Bulgu yok. Kalan "placeholder" eşleşmeleri yalnızca input ipucu metinleri. |
| Sahte multiplayer | Yok. Tüm hamleler sunucuda doğrulanıyor; istemciler yalnızca kendi görünümlerini alıyor; iki instance arası yayın test edildi. |
| Bağlanmamış buton / eksik API | 13 sayfa ve 28 API route derleniyor. E2E'de kullanılan butonlar gerçek API'lere bağlı. Profil/ayarlar/kurallar sayfalarının otomatik testi yok. |
| Kural doğruluğu | Katlamalı 101, çift açma, eşli puanlama, okey/sahte okey, taş işleme, yandan alma birim testleriyle ve bot maçlarıyla doğrulandı. |
| Gizli bilgi | Başka oyuncunun eli, deste sırası ve dağıtım tohumu istemciye gönderilmiyor. Bu, birim testinde ve E2E'de API yanıtı taranarak doğrulandı. |
| Docker / VPS / yerel sunucu bağımlılığı | Yok. `Dockerfile` veya `docker-compose.yml` yok. `scripts/dev-server.ts` yalnızca yerel geliştirme/test içindir; Vercel'de kullanılmaz. |
| Fonksiyon belleğinde kalıcı state | Yok. Postgres yetkili kaynak; Redis önbellek/kilit/yayın. |

## Vercel ayarları kontrol listesi

| Ayar | Durum |
| --- | --- |
| Framework: Next.js 16, `vercel-build` = migrasyon + `next build` | Hazır |
| WebSocket route: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 300`, `upgradeWebSocket` | Hazır. Fluid Compute ve WebSocket beta hesabınızda açık olmalı. Plan sınırı daha düşükse `maxDuration` değerini düşürün. |
| Sunucu dışı paketler (`pg`, `ioredis`, `ws`, `pglite`) | `serverExternalPackages` içinde |
| Güvenlik başlıkları | nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy |
| Oturum çerezi | HttpOnly, SameSite=Lax, Vercel'de Secure; DB'de yalnızca SHA-256 özeti |
| Parolalar | scrypt |
| CSRF / Origin | API ve WebSocket Origin denetimi (`ALLOWED_ORIGINS`) |
| Oran sınırları | Giriş 20/dk/IP, komut 40/10 sn, WebSocket mesajı 80/5 sn, katılma 20/dk |
| Eksik servis davranışı | Vercel'de bellek içi yedek yok. Migrasyon, çalışma anı ve `/api/health` açık hata verir. |
| DB TLS | Sertifika doğrulamalı |
| Otomatik dağıtım | GitHub entegrasyonu bağlandığında her push'ta (main → production, diğer dallar → preview) |
| CI | `.github/workflows/ci.yml` (typecheck, test, build, e2e). GitHub'da henüz çalışmadı. |

## Hesap sahibinin yapması gerekenler

Adımların ayrıntısı `DEPLOYMENT.md` dosyasındadır.

1. GitHub deposu oluşturup kodu göndermek.
2. Vercel'de projeyi içe aktarmak (Fluid Compute açık).
3. Marketplace'ten **Neon Postgres** ve **Redis** (TCP URL) eklemek.
4. `SESSION_SECRET` (en az 32 karakter) ve `NEXT_PUBLIC_APP_URL` tanımlamak.
5. Dağıtıma izin vermek.

## Dağıtım sonrası zorunlu doğrulamalar

1. `/api/health` → 200, `database: ok`, `redis: ok`.
2. Farklı ağlardaki 4 cihazla oda oluşturma, davet linki, tam bir el ve sayfa yenileme ile yeniden bağlanma. Bu deneme Vercel WebSocket ve instance'lar arası Redis yayınını doğrular.
3. Bir bağlantıyı 300 sn'den uzun açık tutup otomatik yeniden bağlanmanın sorunsuz olduğunu görmek.

## Bilinen sınırlamalar ve riskler

- **Vercel WebSocket public beta.** API ve fiyatlandırma değişebilir. İstemci WebSocket başarısız olursa komutları HTTP'ye (`/api/matches/[id]/command`, aynı `commandId`) düşürür. Ancak anlık bildirim için WebSocket gerekir.
- **Süre aşımları istemci ping'leriyle tetiklenir.** Masadaki herkes ayrılırsa süre, biri geri dönene kadar işlemez. Tutarlılık bozulmaz, yalnızca ilerleme bekler.
- **Yük testi yapılmadı.** Her WebSocket instance'ı bir Redis abonelik bağlantısı açar; sağlayıcının bağlantı sınırını izleyin.
- **Tarayıcılar:** yalnızca Chromium ile test edildi.
- **ESLint yapılandırılmadı.** Statik denetim TypeScript strict ile sınırlı.
- Bot entegrasyon testinin taş dağılımı her çalıştırmada değişir. Bitiş sayısı bazı çalıştırmalarda 0 olabilir (el deste bitmesiyle sonlanır); test her durumda maçın doğru tamamlandığını doğrular.
