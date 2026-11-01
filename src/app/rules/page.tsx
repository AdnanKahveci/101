import type { Metadata } from "next";
import { DEFAULT_RULES as R } from "@/engine/rules";

export const metadata: Metadata = { title: "Kurallar" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-felt-900/80 p-5">
      <h2 className="mb-2 text-xl font-extrabold text-gold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-white/80">{children}</div>
    </section>
  );
}

const Cfg = () => <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gold">ayarlanabilir</span>;

export default function RulesPage() {
  const rows: [string, string, boolean][] = [
    ["Normal bitiş (bitiren)", String(R.finishScore), false],
    ["Okey atarak bitiş (bitiren)", String(R.jokerFinishScore), false],
    ["Çift açıp bitiş (bitiren)", String(R.pairFinishScore), false],
    ["Elden bitiş (bitiren)", String(R.handFinishScore), false],
    ["Elden okeyle bitiş (bitiren)", String(R.handJokerFinishScore), false],
    ["Hiç açmayan oyuncu", `+${R.unopenedPenalty}`, false],
    ["Açmış oyuncu", "Elde kalan taşların sayı toplamı", false],
    ["Açmış oyuncunun elinde kalan her gerçek okey", `+${R.jokerInHandPenalty}`, false],
    ["Çift açmış oyuncunun eli", `×${R.pairOpenerHandMultiplier}`, false],
    ["Okeyle bitişte rakip cezaları", `×${R.jokerFinishMultiplier}`, true],
    ["Çift açanın bitişinde rakip cezaları", `×${R.pairFinishMultiplier}`, true],
    ["Elden bitişte rakip cezaları", `×${R.handFinishMultiplier}`, true],
    ["Okey atma (bitiş hariç)", `+${R.discardJokerPenalty}`, true],
    ["İşlek taş atma", `+${R.discardPlayablePenalty}`, true],
    ["Yandan alınan taşı denedikten sonra geri bırakma", "cezasız", false],
  ];
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <h1 className="text-3xl font-black">101 Okey kuralları</h1>
      <p className="text-white/70">
        Aşağıdaki kurallar bu sitenin varsayılan profili olan <b>“{R.profileName}”</b> profilini anlatır. Oda sahibi <Cfg /> işaretli
        maddeleri oyun başlamadan değiştirebilir; maç başladıktan sonra kurallar sabitlenir. Bütün kurallar sunucuda uygulanır.
      </p>

      <Section title="Taşlar, gösterge ve okey">
        <p>Set 106 taştır: kırmızı, sarı, mavi ve siyah renklerde 1–13 arası sayılar, her birinden iki kopya (104 taş) ve iki sahte okey.</p>
        <p>Dağıtımdan sonra kalan desteden bir <b>gösterge</b> taşı açılır. Okey, göstergeyle aynı renkte bir üst sayıdır; gösterge 13 ise okey 1 olur.
          Gösterge sahte okey çıkarsa yerine sıradaki taş gösterge olur. <Cfg /></p>
        <p><b>Gerçek okey</b> (iki adet) jokerdir: perde istenen herhangi bir taşın yerine geçer. <b>Sahte okey</b> joker değildir; yalnızca gerçek okeyin
          basılı değerini (ör. okey Mavi 4 ise Mavi 4) temsil eder.</p>
      </Section>

      <Section title="Dağıtım ve sıra">
        <p>Dağıtıcının sağındaki oyuncu ilk oyuncudur ve 22 taş alır; diğer üç oyuncu 21'er taş alır. Destede 20 taş kalır. Dağıtıcı her elde bir koltuk kayar.</p>
        <p>İlk oyuncu taş çekmeden bir taş atarak başlar. Sonraki her oyuncu: (1) desteden taş çeker veya soldaki oyuncunun son attığı taşı alır,
          (2) isterse elini açar / taş işler, (3) bir taş atarak sırayı sağa devreder. Aynı turda iki kez taş alınamaz.</p>
      </Section>

      <Section title="Perler ve çiftler">
        <p><b>Seri:</b> aynı renkten en az üç ardışık sayı (ör. Kırmızı 5-6-7). 1 yalnızca başta olabilir; 12-13-1 varsayılan olarak geçersizdir <Cfg />.
          Açıldığında 13'ten sonraki 1 14 puan sayılır. 13-1-2 her zaman geçersizdir.</p>
        <p><b>Grup:</b> aynı sayının farklı renkleri, 3 veya 4 taş (ör. Kırmızı 8, Siyah 8, Mavi 8). Aynı renk tekrar edemez.</p>
        <p><b>Çift:</b> aynı renk ve sayıdaki iki fiziksel taş. Okey + herhangi bir taş çift sayılır <Cfg />; iki okey çift sayılmaz.
          İki sahte okey aynı yüzü temsil ettiği için çifttir. Bir taş iki çiftte kullanılamaz.</p>
        <p>Okeyli perde okeyin yeri açılış puanı lehine en yüksek değerli geçerli konum olarak seçilir; oyuncu isterse yüzünü açıkça belirleyebilir.</p>
      </Section>

      <Section title="El açma ve katlama">
        <p>Elini açmak için tek hamlede toplamı en az <b>{R.minOpeningPoints}</b> puan olan perler veya en az <b>{R.minOpeningPairs}</b> çift masaya konur.
          Okeyler temsil ettikleri değerle sayılır. Açarken elde atmak için en az bir taş kalmalıdır.</p>
        <p><b>Katlamalı masada</b> <Cfg /> her yeni açılış, o elde yapılmış en yüksek açılışı geçmelidir: 105 açıldıysa sonraki en az 106, ardından 107…
          Çift barajı ayrı tutulur: 5 çift açıldıysa sonraki 6, sonra 7 çift gerekir.</p>
        <p>Seri açan oyuncu sonraki turlarda barajsız yeni perler açabilir; çift açan oyuncu sonraki turlarda yeni çiftler ekleyebilir ama seri per açamaz.
          Seri açan oyuncu çift açamaz.</p>
        <p><b>Eşli açılış politikası</b> <Cfg />: “Masa barajı” (varsayılan) herkese aynı barajı uygular; “Eşi açan temel barajla açar” seçeneğinde eşiniz
          açtıysa 101 / 5 çift yeterlidir; “Bağımsız” seçeneğinde yalnızca rakip takımın açılışları barajınızı yükseltir.</p>
      </Section>

      <Section title="Yandan taş alma">
        <p>Yalnızca soldaki oyuncunun en son attığı taş alınabilir ve aynı turda kullanılmak zorundadır: henüz açmadıysanız bu taşla açmalısınız,
          açtıysanız taşı bir pere işlemeli ya da yeni perde kullanmalısınız. Taşı ıstakanıza alıp deneyebilirsiniz; kullanamazsanız <b>cezasız</b> geri bırakır
          ve desteden çekersiniz. Alınan taş kullanılmadan taş atılamaz.</p>
      </Section>

      <Section title="Taş işleme ve okey değiştirme">
        <p>Elini açmış oyuncu masadaki herhangi bir serinin başına/sonuna uygun taş, gruba eksik renk ekleyebilir. Çift açanlar da pere taş işleyebilir <Cfg />.</p>
        <p><b>Okey değiştirme</b> <Cfg />: açmış oyuncu, masadaki bir okeyin temsil ettiği gerçek taşı koyarak okeyi alabilir. Hamle atomiktir:
          alınan okey aynı hamlede yeni bir perde veya mevcut bir pere işlenmelidir; aksi halde hamlenin tamamı reddedilir.</p>
      </Section>

      <Section title="Bitiş ve puanlama">
        <p>Açmış bir oyuncu son taşını atarak biter. Son atılan taş okeyse <b>okeyle bitiş</b>; oyuncu o tura açılmamış başlayıp aynı turda tüm elini
          açarak bitirdiyse <b>elden bitiş</b>; çift açmış oyuncunun bitişi <b>çiftten bitiş</b> sayılır. Açmadan bitilemez.</p>
        <p>101'de düşük puan iyidir. Maç sonunda toplam puanı en düşük oyuncu (eşlide takım) kazanır.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-white/50">
                <th className="py-1">Durum</th>
                <th className="py-1 text-right">Puan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([a, b, c]) => (
                <tr key={a} className="border-t border-white/10">
                  <td className="py-1.5">
                    {a}
                    {c && <Cfg />}
                  </td>
                  <td className="py-1.5 text-right font-bold">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Bitiş çarpanları birbirleriyle çarpılarak birleşir (ör. elden okeyle bitişte ×2 × ×2 = ×4) <Cfg />. Çarpan, hiç açmayanların {R.unopenedPenalty}
          cezasına ve açmışların el toplamına uygulanır; el içinde yazılan cezalara (okey atma vb.) uygulanmaz.</p>
        <p><b>Eşli oyunda</b> bitirenin eşi el cezası yazmaz (sıfırlanır) <Cfg />; el içi cezaları yine yazılır. Takım puanı iki oyuncunun toplamıdır.</p>
        <p><b>Siler</b> (varsayılan kapalı) <Cfg />: elden biten oyuncu (eşlide takımı) maç boyunca biriken pozitif toplamını sıfırlar.</p>
      </Section>

      <Section title="Cezalar, deste bitmesi ve süre">
        <p>Cezalı masada <Cfg /> okey atmak (bitiş hariç) ve masadaki bir pere işlenebilecek taşı atmak +101 cezadır.</p>
        <p>Atılan taştan sonra destede taş kalmamışsa el bitirensiz sona erer; varsayılan olarak herkesin eli normal şekilde yazılır <Cfg />.</p>
        <p>Hamle süresi <Cfg /> dolduğunda varsayılan politika her zaman yasal olan “desteden çek ve çekilen taşı at” hamlesini uygular (çekilen taş okeyse
          okey olmayan en yüksek taş atılır). “Bekle” politikasında otomatik hamle yapılmaz. El sonucu ekranında 90 saniye sonra sonraki el kendiliğinden başlar.</p>
      </Section>
    </main>
  );
}
