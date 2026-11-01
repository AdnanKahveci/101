# Dağıtım (GitHub → Vercel)

Oyunun tamamı (arayüz, API, WebSocket) Vercel Functions üzerinde çalışır. Kalıcı veri yönetilen PostgreSQL'de, instance'lar arası tutarlılık yönetilen Redis'te tutulur.

- Docker, VPS veya yerel sunucu kullanılmaz.
- Yayınlanan oyun, geliştiricinin bilgisayarı kapalıyken de çalışır.

> Bu adımları **hesap sahibinin** yapması gerekir. Bu depoda hiçbir gerçek dağıtım yapılmadı ve ücretli servis oluşturulmadı.

## 1. GitHub

1. GitHub'da boş bir depo oluşturun. Önerilen ayar özel (private) depodur.
2. Yerel depoyu bağlayıp gönderin:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<kullanıcı>/<depo>.git
   git push -u origin main
   ```
3. `.github/workflows/ci.yml` her push'ta şunları çalıştırır: tip denetimi, birim/entegrasyon testleri, üretim derlemesi ve 4 tarayıcılı Playwright testleri.

## 2. Vercel projesi

1. vercel.com → **Add New → Project** → GitHub deposunu içe aktarın. Framework otomatik olarak **Next.js** algılanır.
2. Build Command boş bırakılabilir. `package.json` içindeki `vercel-build` (`migrate` + `next build`) Vercel tarafından otomatik kullanılır.
3. **Settings → Functions → Fluid Compute** açık olmalıdır (yeni projelerde varsayılan). WebSocket uç noktası `src/app/api/ws/route.ts` Node.js runtime'ında `maxDuration = 300` ile çalışır.
4. Vercel Functions WebSocket desteği şu an **public beta**dır. Hesabınızda/planınızda etkin olduğunu doğrulayın. `maxDuration` değeri planınızın üst sınırını aşıyorsa route'taki değeri düşürün; istemci süre dolunca otomatik yeniden bağlanır.
5. Git entegrasyonu bağlandığında `main` dalına her push **production**, diğer dallar ve PR'lar **preview** dağıtımı üretir.

## 3. Yönetilen PostgreSQL

**Vercel → Storage / Marketplace → Neon (Postgres)** ekleyip projeye bağlayın.

- Bu adım `DATABASE_URL` (veya `POSTGRES_URL`) değişkenini otomatik tanımlar. İkisi de desteklenir.
- Preview dağıtımları için ayrı bir veritabanı veya Neon dalı kullanmanız önerilir. Böylece preview migrasyonları production verisine dokunmaz.
- Migrasyonlar yalnızca ekleme yapan Drizzle SQL dosyalarıdır (`drizzle/`). Hiçbir betik tablo veya veri silmez. `scripts/seed.ts` production'da çalışmayı reddeder.

## 4. Yönetilen Redis

**Vercel Marketplace → Redis** (ör. Redis Cloud veya Upstash) ekleyip projeye bağlayın.

- **TCP bağlantı adresi** gerekir (`redis://` veya `rediss://`), çünkü pub/sub kullanılır. Yalnızca REST URL'si yeterli değildir.
- Değişken adı `REDIS_URL` (veya `KV_URL`) olmalıdır.

## 5. Ortam değişkenleri

**Settings → Environment Variables** altında Production ve Preview için şunları tanımlayın:

| Değişken | Zorunlu | Açıklama |
| --- | --- | --- |
| `DATABASE_URL` | Evet | Postgres bağlantısı. Marketplace otomatik ekler. |
| `REDIS_URL` | Evet | Redis TCP bağlantısı. Marketplace otomatik ekler. |
| `SESSION_SECRET` | Evet | En az 32 karakter rastgele değer: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `NEXT_PUBLIC_APP_URL` | Önerilir | Davet linklerinin genel adresi, ör. `https://okey.example.com`. Boşsa Vercel production alan adı kullanılır. |
| `ALLOWED_ORIGINS` | Hayır | Ek alan adları (virgülle). Varsayılan olarak yalnızca istek host'u kabul edilir. |
| `DATABASE_POOL_MAX` | Hayır | Fonksiyon başına havuz boyutu (varsayılan 5). |
| `OKEY_CMD_RATE_LIMIT`, `OKEY_WS_MSG_LIMIT` | Hayır | Oran sınırları (varsayılan 40 komut / 10 sn, 80 mesaj / 5 sn). |

`OKEY_ALLOW_MEMORY` ve `OKEY_DEV_DB` değişkenlerini Vercel'de **tanımlamayın**. Tanımlansalar bile Vercel'de bellek içi yedekler devre dışıdır.

Kritik bir değişken eksikse uygulama sahte başarı göstermez:

- migrasyon adımı ve dolayısıyla derleme başarısız olur;
- çalışma anında açık hata verilir;
- `/api/health` 503 döner.

## 6. İlk dağıtımdan sonra doğrulama

1. `https://<alan-adı>/api/health` adresi 200 ve `{"ok":true,"checks":{"database":"ok","redis":"ok"}}` döndürmeli. `hata` görürseniz ayrıntı Vercel Logs'tadır.
2. İki farklı tarayıcıdan (biri gizli pencere) misafir girişi yapın, oda oluşturup davet linkiyle katılın. Dört oyuncuyla maç başlatıp birkaç hamle yapın.
3. Bir sekmeyi yenileyin: ıstaka ve sıra aynen geri gelmeli.
4. Vercel → **Logs** bölümünde `/api/ws` bağlantılarının hata vermediğini kontrol edin.

## Maliyet notları

Bu bölümdeki bilgiler tahmindir; güncel fiyatları sağlayıcılardan kontrol edin.

- **Vercel:** Hobby planı ticari olmayan kullanım içindir. Uzun süreli WebSocket bağlantıları Fluid Compute'ta etkin süre olarak faturalanır; yoğun kullanımda Pro planı gerekebilir.
- **Neon** ve **Redis** sağlayıcılarının ücretsiz katmanları küçük ölçekli test için yeterlidir. Eşzamanlı bağlantı ve komut sınırlarına dikkat edin: her WebSocket instance'ı Redis'e bir abonelik bağlantısı açar.
