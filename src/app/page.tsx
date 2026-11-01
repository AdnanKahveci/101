"use client";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Eye, Repeat, ShieldCheck, Smartphone, Users } from "lucide-react";
import { useSession } from "@/lib/session";
import { Card, CardTitle } from "@/components/ui/card";
import { GuestForm } from "@/components/guest-form";

const FEATURES = [
  { icon: Users, title: "Arkadaşlarınla gerçek zamanlı", text: "Özel oda, oda kodu ve davet linkiyle dört kişilik masalar." },
  { icon: Repeat, title: "Eşli, eşsiz, katlamalı", text: "Yardımlı veya yardımsız; 3'ten 21 ele kadar çok elli maçlar." },
  { icon: ShieldCheck, title: "Sunucu otoriteli kurallar", text: "Her hamle sunucuda doğrulanır; rakip taşları asla gönderilmez." },
  { icon: Eye, title: "Açıklanabilir puanlama", text: "Her ceza ve bonus satır satır gösterilir." },
  { icon: Smartphone, title: "Mobil öncelikli", text: "Dokunmatik ıstaka, yatay ve dikey yerleşim." },
  { icon: Bot, title: "Kopsan da devam", text: "Bağlantın koparsa koltuğun korunur, kaldığın yerden dönersin." },
];

function Landing() {
  const { me, loaded } = useSession();
  const next = useSearchParams().get("next");
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <div className="mb-4 flex gap-1.5" aria-hidden>
            {[
              ["1", "text-tile-red"],
              ["0", "text-tile-blue"],
              ["1", "text-tile-yellow"],
            ].map(([d, c], i) => (
              <span key={i} className={`tile-face grid h-16 w-12 place-items-center rounded-lg text-3xl font-black ${c}`}>
                {d}
              </span>
            ))}
          </div>
          <h1 className="text-4xl font-black leading-tight sm:text-5xl">
            Online <span className="text-gold">101 Okey</span>
          </h1>
          <p className="mt-3 text-lg text-white/70">Türk 101 Okey kurallarıyla, arkadaşlarınla aynı masada. Kurulum yok, para yok — sadece oyun.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {loaded && me ? (
              <Link href="/dashboard" className="rounded-xl bg-gold px-5 py-3 font-bold text-felt-950">
                Panele git
              </Link>
            ) : (
              <>
                <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="rounded-xl bg-white/10 px-5 py-3 font-bold hover:bg-white/20">
                  Giriş yap
                </Link>
                <Link href="/register" className="rounded-xl bg-white/10 px-5 py-3 font-bold hover:bg-white/20">
                  Kayıt ol
                </Link>
              </>
            )}
            <Link href="/rules" className="rounded-xl px-5 py-3 font-bold text-white/70 hover:text-white">
              Kurallar
            </Link>
          </div>
        </div>
        {loaded && !me && (
          <Card>
            <CardTitle>Hemen oyna</CardTitle>
            <p className="mb-4 text-sm text-white/60">Hesap açmadan bir takma adla masaya otur. İstersen sonra hesabını kayıtlıya dönüştürürsün.</p>
            <GuestForm next={next} />
          </Card>
        )}
      </section>
      <section className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <f.icon className="mb-2 h-6 w-6 text-gold" />
            <h3 className="font-extrabold">{f.title}</h3>
            <p className="mt-1 text-sm text-white/60">{f.text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Landing />
    </Suspense>
  );
}
