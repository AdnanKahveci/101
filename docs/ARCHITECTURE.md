# Mimari

Online 101 Okey, tamamen Vercel üzerinde çalışan, sunucu otoriteli, gerçek zamanlı bir web oyunudur. Kullanıcının bilgisayarı veya ayrı bir sunucu (VPS, Docker) hiçbir aşamada gerekmez.

```
Tarayıcı (Next.js / React / Zustand)
   │  HTTPS (REST)            │  WSS /api/ws
   ▼                          ▼
Vercel Functions (Node.js, Fluid Compute)  ── birden çok instance
   │  SQL (pg Pool)            │  ioredis (komut + pub/sub)
   ▼                          ▼
Yönetilen PostgreSQL       Yönetilen Redis
(kalıcı, yetkili state)    (önbellek, kilit, yayın, presence, oran sınırı)
```

## Katmanlar

| Katman | Konum | Görev |
| --- | --- | --- |
| Oyun motoru | `src/engine/` | Saf TypeScript. Taş seti, dağıtım (tohumlu sfc32 RNG), per/çift doğrulama, katlamalı barajlar, taş işleme, okey değiştirme, cezalar, bitiş türleri, puanlama, oyuncuya özel görünüm (`getPlayerView`). G/Ç yok; deterministik ve tamamen test edilebilir. |
| Sunucu servisleri | `src/server/` | Kimlik doğrulama, oda/davet, sosyal, oyun komut hattı, gerçek zamanlı bağlantı yönetimi. |
| HTTP API | `src/app/api/**/route.ts` | Zod ile doğrulanan uç noktalar, `authed`/`open` sarmalayıcıları (Origin/CSRF denetimi, 64 KB gövde sınırı, hata eşleme). |
| WebSocket | `src/app/api/ws/route.ts` | `@vercel/functions` `upgradeWebSocket` ile Vercel Functions WebSocket. Yerelde aynı `handleConnection` `ws` kütüphanesiyle çalışır (`scripts/dev-server.ts`). |
| İstemci | `src/app`, `src/components`, `src/lib` | Sayfalar, oyun masası, ıstaka sürükle-bırak, gerçek zamanlı istemci (yeniden bağlanma, HTTP yedeği). |

## Oyun komut hattı (`src/server/game-service.ts → processCommand`)

1. **Oran sınırı:** oyuncu başına Redis kayan pencere.
2. **İdempotentlik:** `processed_commands (user_id, command_id)` birincil anahtarı. Aynı `commandId` ikinci kez gelirse önceki sonuç döner, hamle tekrar uygulanmaz.
3. **Kilit:** maç başına Redis `SET NX PX` kilidi. Farklı instance'lardaki eşzamanlı komutlar sıralanır.
4. **Sürüm denetimi:** istemcinin `expectedVersion` değeri güncel sürümle eşleşmezse `STALE_VERSION` döner ve istemci güncel state'i alır.
5. **Motor:** `applyAction(state, action, seat)` saf fonksiyonu yeni state'i üretir. Geçersiz hamle state'i değiştirmez.
6. **Kalıcılık:** tek bir transaction yürütülür:
   - `game_snapshots` üzerinde `UPDATE … WHERE version = eski` ile iyimser eşzamanlılık
   - `game_events` olay günlüğü
   - `processed_commands` kaydı
   - el bittiyse `hands` ve `hand_player_results`; maç bittiyse `matches`, `match_players`, `match_teams` ve istatistikler
7. **Yayın:** Redis önbelleği güncellenir ve `okey:match:{id}` kanalına bildirim gider. Her instance kendi bağlı oyuncularına **kendi görünümlerini** gönderir: başka oyuncunun eli ve deste sırası asla gönderilmez.

Süre aşımları ayrı bir zamanlayıcıya gerek duymaz. İstemci ping'lerinde `checkTimeout` çağrılır ve süresi dolan hamle `timeout-{matchId}-{version}` komut kimliğiyle **bir kez** uygulanır (idempotent). Masada kimse kalmasa bile oyuncu geri döndüğünde state tutarlı biçimde ilerler.

## Gizli bilgi

- Dağıtım tohumu `matches.seed_secret` içinde yalnızca sunucuda saklanır.
- `getPlayerView` yalnızca oyuncunun kendi elini, açık perleri, atılan taşları ve deste sayısını içerir. Elin sonunda (`handResult`) eller açılır.
- Seyirciler hiçbir eli göremez. Oda `allowSpectators` kapalıysa üye olmayanlar maç görünümüne erişemez.
- Bunlar birim testlerde ve 4 tarayıcılı E2E testinde (başka oyuncuların taş kimliklerinin API yanıtında bulunmadığı) doğrulanır.

## Vercel üzerinde durum ve ölçeklenme

- Fonksiyon belleğinde **kalıcı state tutulmaz**. Bellekte yalnızca bağlantı nesneleri ve abonelikler bulunur.
- WebSocket bağlantısı bir instance'a sabitlenir ve en fazla `maxDuration` (800 sn) yaşar. İstemci üstel geri çekilmeyle otomatik yeniden bağlanır:
  - `room`/`watch` aboneliklerini yeniden gönderir ve tam görünümü alır;
  - ıstaka dizilimini `localStorage`'dan geri yükler.
- Farklı instance'lara bağlı oyuncular Redis pub/sub ile aynı olayları alır. Entegrasyon testinde iki ayrı sunucu instance'ı ile doğrulanmıştır.
- Presence: Redis anahtarları 35 sn TTL ile tutulur ve ping ile yenilenir.

## Yalnızca geliştirme/test için yedekler

`DATABASE_URL` / `REDIS_URL` yoksa ve uygulama Vercel'de değilse gömülü PGlite ve bellek içi `MemoryInfra` kullanılır.

- Vercel'de (`VERCEL` ortam değişkeni) bu yedekler **devre dışıdır**. Eksik değişken açık hata verir.
- `/api/health` gerçek DB ve Redis bağlantısını sınar; biri yoksa 503 döner.

## Veri modeli (özet)

| Grup | Tablolar |
| --- | --- |
| Kullanıcı | `users`, `guest_identities`, `sessions` (yalnızca SHA-256 token özeti), `user_preferences`, `player_statistics` |
| Sosyal | `friend_requests`, `friendships`, `room_invitations` |
| Oda | `rooms` (benzersiz `code`, `invite_token`, `settings` jsonb), `room_members` (oda+koltuk kısmi benzersiz indeks: aynı koltuğa iki kişi oturamaz) |
| Maç | `matches`, `match_players`, `match_teams`, `game_snapshots`, `game_events`, `processed_commands`, `hands`, `hand_player_results` |

Migrasyonlar Drizzle ile `drizzle/` altında üretilir. Vercel derlemesinde `vercel-build` betiği önce `scripts/migrate.ts` çalıştırır.
