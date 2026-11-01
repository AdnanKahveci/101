# Online 101 Okey

Gerçek zamanlı, sunucu otoriteli, çok oyunculu 101 Okey. Next.js 16, React 19, TypeScript (strict), Tailwind 4, Zustand, Motion, Drizzle + PostgreSQL, Redis, Vercel Functions WebSocket.

- **Kurallar:** eşli/eşsiz, katlamalı/katlamasız, yardımlı/yardımsız, seri ve çift açma, okey ve sahte okey, taş işleme, yandan alma, tüm bitiş türleri, yapılandırılabilir puanlama. Ayrıntılar `docs/GAME_RULES.md` ve `docs/RULE_VARIANTS.md` dosyalarında.
- **Sosyal:** oda kodu ve davet linki, arkadaşlar, arkadaş daveti, maç geçmişi, istatistikler, otomatik yeniden bağlanma.

## Belgeler

- [Mimari](docs/ARCHITECTURE.md)
- [Dağıtım (GitHub → Vercel)](docs/DEPLOYMENT.md)
- [Test raporu](docs/TEST_REPORT.md)
- [Üretime hazırlık raporu](docs/PRODUCTION_READINESS.md)
- [İlerleme](docs/PROGRESS.md) · [Plan](docs/DEVELOPMENT_PLAN.md)

## Yerel geliştirme (isteğe bağlı)

Yayınlanan oyun Vercel'de çalışır. Aşağıdaki komutlar yalnızca geliştirme içindir.

```bash
npm install
npm run dev          # http://localhost:3000. DATABASE_URL yoksa gömülü PGlite + bellek içi pub/sub kullanılır
npm run typecheck
npm test             # motor + iki instance'lı entegrasyon testleri
npx playwright install chromium
npm run test:e2e     # 4 tarayıcılı uçtan uca test
```
