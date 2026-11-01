"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-black">Bir şeyler ters gitti</h1>
      <p className="mt-2 text-white/60">{error.message || "Beklenmeyen bir hata oluştu."}</p>
      <Button className="mt-6" onClick={reset}>
        Tekrar dene
      </Button>
    </main>
  );
}
