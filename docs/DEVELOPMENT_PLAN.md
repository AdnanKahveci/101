# Geliştirme Planı

## Tamamlanan aşamalar

1. **Motor:** saf TypeScript kural motoru, kural profilleri, puanlama, görünüm projeksiyonu; birim ve property testleri.
2. **Sunucu:** şema ve migrasyonlar, kimlik doğrulama, odalar, davetler, sosyal, komut hattı (idempotent, kilitli, sürümlü), gerçek zamanlı bağlantı.
3. **Arayüz:** tüm sayfalar, oyun masası, sürükle-bırak ıstaka, yardımlı mod, sonuç ekranları.
4. **Doğrulama:** iki instance'lı entegrasyon testi, 4 tarayıcılı E2E, denetim ve düzeltmeler.
5. **Dağıtım hazırlığı:** Vercel yapılandırması, CI, belgeler.

## Sıradaki adımlar

İlk iki adım hesap sahibinin işidir.

1. GitHub deposu ve Vercel projesini bağlamak, Neon ve Redis entegrasyonlarını eklemek, ortam değişkenlerini tanımlamak (`DEPLOYMENT.md`).
2. İlk preview dağıtımında `/api/health` kontrolü ve 4 cihazla canlı maç denemesi. Bu denemeyle Vercel WebSocket ve gerçek Redis doğrulanır.
3. Gerçek Redis'e karşı çalışan bir CI işi (ör. GitHub Actions `services: redis`) ve `RedisInfra` entegrasyon testi.
4. Yük testi: çok sayıda eşzamanlı masa için bot istemcilerle preview ortamında.
5. RTL bileşen testleri (ıstaka, ayar formu), Firefox/WebKit Playwright projeleri.
6. ESLint yapılandırması (şu an yalnızca `tsc` strict denetimi var).
7. İsteğe bağlı: maç tekrar izleyici (`game_events` hazır), turnuva/sıralama.
