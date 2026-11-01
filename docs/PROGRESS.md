# İlerleme

Durum: 2026-11-01. Bu dosyada "Test edildi" yalnızca otomatik bir testin bu özelliği gerçekten çalıştırdığı anlamına gelir; ayrıntılar `TEST_REPORT.md` dosyasındadır.

## Oyun kuralları

| Özellik | Durum |
| --- | --- |
| 106 taş, gösterge/okey/sahte okey, dağıtım 22/21 | Test edildi (birim, property) |
| Seri ve grup per, okey ve sahte okey davranışı | Test edildi |
| Normal açma (101) ve katlamalı seri barajları | Test edildi |
| Çift açma (5 çift) ve katlamalı çift barajı | Test edildi (birim + bot maçı) |
| Eşli/eşsiz; eş açılış politikaları | Test edildi |
| Yandan alma ve açma zorunluluğu | Test edildi |
| Taş işleme, okey değiştirme | Test edildi (birim + bot maçı) |
| Bitiş türleri ve puanlama (normal, okeyle, çiftten, elden, deste bitmesi) | Test edildi |
| Eşli puanlama (eşin cezası 0, takım toplamı) | Test edildi |
| Cezalar (işlek taş, okey atma, yandan alıp açamama) | Test edildi |
| Çok elli maç ve özel el sayısı | Test edildi |
| Süre aşımı (otomatik hamle) | Test edildi (birim) |

## Çok oyunculu ve sosyal

| Özellik | Durum |
| --- | --- |
| Misafir girişi, kayıt, giriş, misafirden kayıtlıya geçiş | Misafir girişi E2E ile test edildi. Kayıt/giriş akışı yazıldı, entegrasyonda `registerUser` kullanılıyor. Ayrı bir HTTP/E2E testi yok. |
| Oda oluşturma, kod, davet linki, şifre, koltuk, hazır, başlatma | Test edildi (entegrasyon + E2E) |
| Arkadaşlık isteği, arkadaş daveti | Test edildi (entegrasyon) |
| Gerçek zamanlı 4 oyunculu maç, instance'lar arası yayın | Test edildi (iki instance + 4 tarayıcı) |
| Yeniden bağlanma ve state geri yükleme | Test edildi (entegrasyon + E2E sayfa yenileme) |
| İdempotent komutlar, sürüm denetimi, gizli bilgi | Test edildi |
| Geçmiş, istatistik, rövanş (aynı odada yeni maç) | Test edildi (entegrasyon) |
| Profil, ayarlar, kurallar sayfaları | Derleniyor. Otomatik testi yok. |

## Altyapı

| Öğe | Durum |
| --- | --- |
| Vercel WebSocket route | Yazıldı ve derleniyor. **Gerçek Vercel'de test edilmedi.** |
| Redis adaptörü | Yazıldı. **Gerçek Redis ile test edilmedi.** |
| Postgres havuzu ve migrasyon betiği | Yazıldı. **Gerçek yönetilen Postgres ile test edilmedi.** Şema PGlite üzerinde test edildi. |
| GitHub Actions CI | Yazıldı. **GitHub'da henüz çalıştırılmadı** (depo uzakta yok). |
| Dağıtım | Yapılmadı. Hesap sahibinin yetkisi gerekir: `DEPLOYMENT.md`. |
