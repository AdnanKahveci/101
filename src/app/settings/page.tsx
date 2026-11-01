"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useSession, type Me } from "@/lib/session";
import { setSoundEnabled } from "@/lib/sound";
import { RequireSession, PageLoading } from "@/components/require-session";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AvatarPicker } from "@/components/guest-form";

interface Prefs {
  soundEnabled: boolean;
  sortMode: "color" | "value";
  confirmDiscard: boolean;
  animations: boolean;
}

function storeLocal(p: Prefs) {
  try {
    localStorage.setItem("okey:sortMode", p.sortMode);
    localStorage.setItem("okey:confirmDiscard", p.confirmDiscard ? "1" : "0");
    localStorage.setItem("okey:animations", p.animations ? "1" : "0");
  } catch {}
  setSoundEnabled(p.soundEnabled);
}

function Settings({ me }: { me: Me }) {
  const refresh = useSession((s) => s.refresh);
  const [displayName, setDisplayName] = useState(me.displayName);
  const [avatar, setAvatar] = useState(me.avatar);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ preferences: Prefs }>("/api/settings")
      .then((d) => {
        setPrefs(d.preferences);
        storeLocal(d.preferences);
      })
      .catch((e) => toast.error((e as Error).message));
  }, []);
  if (!prefs) return <PageLoading />;
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs({ ...prefs, [k]: v });
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api<{ preferences: Prefs }>("/api/settings", {
              method: "PUT",
              body: { displayName, avatar, preferences: prefs },
            });
            storeLocal(r.preferences);
            await refresh();
            toast.success("Ayarlar kaydedildi.");
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Card>
          <CardTitle>Profil</CardTitle>
          <Label htmlFor="dn">Görünen ad</Label>
          <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={2} maxLength={20} />
          <div className="mt-4">
            <Label>Avatar</Label>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </div>
        </Card>
        <Card>
          <CardTitle>Oyun tercihleri</CardTitle>
          <Switch label="Ses efektleri" checked={prefs.soundEnabled} onChange={(v) => set("soundEnabled", v)} />
          <Switch label="Taş atmadan önce onay iste" description="Yanlışlıkla taş atmayı önler" checked={prefs.confirmDiscard} onChange={(v) => set("confirmDiscard", v)} />
          <Switch label="Animasyonlar" checked={prefs.animations} onChange={(v) => set("animations", v)} />
          <div className="mt-2">
            <Label htmlFor="sort">Otomatik sıralama</Label>
            <Select id="sort" value={prefs.sortMode} onChange={(e) => set("sortMode", e.target.value as Prefs["sortMode"])}>
              <option value="color">Renge göre</option>
              <option value="value">Sayıya göre</option>
            </Select>
          </div>
        </Card>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </form>
    </main>
  );
}

export default function SettingsPage() {
  return <RequireSession>{(me) => <Settings me={me} />}</RequireSession>;
}
