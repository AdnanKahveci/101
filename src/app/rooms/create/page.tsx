"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { RequireSession } from "@/components/require-session";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { DEFAULT_SETTINGS, RoomSettingsForm } from "@/components/room-settings-form";
import type { RoomSettings } from "@/server/validation";
import type { Me } from "@/lib/session";
import { cn } from "@/lib/utils";

function CreateRoom({ me }: { me: Me }) {
  const router = useRouter();
  const [name, setName] = useState(`${me.displayName} masası`);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [password, setPassword] = useState("");
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Card>
        <CardTitle>Oda oluştur</CardTitle>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const r = await api<{ room: { code: string } }>("/api/rooms", {
                body: { name, visibility, password: password || null, settings },
              });
              router.push(`/room/${r.room.code}`);
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          <div>
            <Label htmlFor="name">Oda adı</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={48} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Görünürlük</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["private", "Özel", "Yalnızca davet linki / şifre"],
                    ["public", "Herkese açık", "Oda listesinde görünür"],
                  ] as const
                ).map(([v, l, d]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={visibility === v}
                    onClick={() => setVisibility(v)}
                    className={cn("rounded-xl border p-2 text-left", visibility === v ? "border-gold bg-gold/15" : "border-white/10 bg-black/20")}
                  >
                    <span className="block text-sm font-bold">{l}</span>
                    <span className="block text-xs text-white/50">{d}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="pw">Oda şifresi (isteğe bağlı)</Label>
              <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="4-64 karakter" />
            </div>
          </div>
          <RoomSettingsForm value={settings} onChange={setSettings} />
          {error && <p className="text-sm font-semibold text-red-300" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Oluşturuluyor…" : "Odayı oluştur"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

export default function CreateRoomPage() {
  return <RequireSession>{(me) => <CreateRoom me={me} />}</RequireSession>;
}
