import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-3xl font-black">Sayfa bulunamadı</h1>
      <p className="mt-2 text-white/60">Aradığınız masa kalkmış olabilir.</p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-gold px-4 py-2 font-bold text-felt-950">
        Ana sayfaya dön
      </Link>
    </main>
  );
}
