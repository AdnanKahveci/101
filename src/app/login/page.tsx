"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { GuestForm } from "@/components/guest-form";

function LoginInner() {
  const next = useSearchParams().get("next");
  const router = useRouter();
  const refresh = useSession((s) => s.refresh);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-4 py-10 md:grid-cols-2">
      <Card>
        <CardTitle>Giriş yap</CardTitle>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api("/api/auth/login", { body: { username, password } });
              await refresh();
              router.push(next || "/dashboard");
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Label htmlFor="username">Kullanıcı adı</Label>
            <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Şifre</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm font-semibold text-red-300" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Giriş yapılıyor…" : "Giriş yap"}
          </Button>
        </form>
        <p className="mt-4 text-sm text-white/60">
          Hesabın yok mu?{" "}
          <Link className="font-bold text-gold" href="/register">
            Kayıt ol
          </Link>
        </p>
      </Card>
      <Card>
        <CardTitle>Misafir girişi</CardTitle>
        <p className="mb-4 text-sm text-white/60">Takma adla hemen bir odaya katıl.</p>
        <GuestForm next={next} />
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
