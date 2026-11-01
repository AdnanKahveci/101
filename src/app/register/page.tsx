"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { AvatarPicker } from "@/components/guest-form";

export default function RegisterPage() {
  const { me, refresh } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState("cay");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upgrading = !!me?.isGuest;

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardTitle>{upgrading ? "Misafir hesabımı dönüştür" : "Kayıt ol"}</CardTitle>
        {upgrading && (
          <p className="mb-4 text-sm text-white/60">
            <b>{me!.displayName}</b> olarak oynadığın maçlar ve istatistikler korunur; yalnızca kullanıcı adı ve şifre eklenir.
          </p>
        )}
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              if (upgrading) await api("/api/auth/upgrade", { body: { username, password } });
              else await api("/api/auth/register", { body: { username, password, displayName: displayName || undefined, avatar } });
              await refresh();
              toast.success(upgrading ? "Hesabın kayıtlı hesaba dönüştürüldü." : "Hoş geldin!");
              router.push("/dashboard");
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Label htmlFor="username">Kullanıcı adı</Label>
            <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="a-z, 0-9, _ (3-20)" required />
          </div>
          {!upgrading && (
            <div>
              <Label htmlFor="displayName">Görünen ad</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={20} placeholder="Masada görünecek ad" />
            </div>
          )}
          <div>
            <Label htmlFor="password">Şifre</Label>
            <Input id="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <p className="mt-1 text-xs text-white/50">En az 8 karakter.</p>
          </div>
          {!upgrading && (
            <div>
              <Label>Avatar</Label>
              <AvatarPicker value={avatar} onChange={setAvatar} />
            </div>
          )}
          {error && <p className="text-sm font-semibold text-red-300" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Kaydediliyor…" : upgrading ? "Dönüştür" : "Kayıt ol"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
