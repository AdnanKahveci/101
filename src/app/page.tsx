"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DoorOpen, Loader2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AvatarPicker } from "@/components/guest-form";
import { DEFAULT_SETTINGS } from "@/components/room-settings-form";
import { AVATAR_EMOJI } from "@/lib/utils";

interface MyRoom {
  code: string;
  name: string;
  status: string;
  currentMatchId: string | null;
}

/**
 * Hesapsız hızlı başlangıç: takma ad yaz → oda kur (kodu arkadaşlarına gönder) ya da koda katıl.
 * Takma ad girildiğinde arka planda misafir oturumu açılır; kayıt/giriş gerekmez.
 */
function Home() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { me, loaded, refresh } = useSession();
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("cay");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [rooms, setRooms] = useState<MyRoom[]>([]);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);
  useEffect(() => {
    if (!me) return;
    api<{ mine: MyRoom[] }>("/api/rooms")
      .then((r) => setRooms(r.mine.filter((x) => x.status !== "closed")))
      .catch(() => setRooms([]));
  }, [me]);
  // Davet linkiyle gelip takma ad girdiyse kaldığı yere dön
  useEffect(() => {
    if (me && next) router.replace(next);
  }, [me, next, router]);

  const ensureSession = async () => {
    if (me) return me;
    if (nickname.trim().length < 2) {
      toast.error("Önce en az 2 harfli bir takma ad yazın.");
      return null;
    }
    await api("/api/auth/guest", { body: { nickname: nickname.trim(), avatar } });
    return refresh();
  };

  const createRoom = async () => {
    setBusy("create");
    try {
      const user = await ensureSession();
      if (!user) return;
      const r = await api<{ room: { code: string } }>("/api/rooms", {
        body: { name: `${user.displayName} masası`, visibility: "private", password: null, settings: DEFAULT_SETTINGS },
      });
      router.push(`/room/${r.room.code}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const joinRoom = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 4) {
      toast.error("Arkadaşınızın gönderdiği oda kodunu yazın.");
      return;
    }
    setBusy("join");
    try {
      const user = await ensureSession();
      if (!user) return;
      router.push(`/room/${c}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-lg flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <div className="mb-3 flex justify-center gap-1.5" aria-hidden>
          {[
            ["1", "text-tile-red"],
            ["0", "text-tile-blue"],
            ["1", "text-tile-yellow"],
          ].map(([d, c], i) => (
            <span key={i} className={`tile-face grid h-16 w-12 place-items-center rounded-lg text-3xl font-black ${c}`} style={{ transform: `rotate(${(i - 1) * 6}deg)` }}>
              {d}
            </span>
          ))}
        </div>
        <h1 className="text-4xl font-black">
          <span className="text-gold">101 Okey</span> Kıraathanesi
        </h1>
        <p className="mt-2 text-white/70">Hesap yok, kayıt yok. Oda kur, kodu arkadaşlarına gönder, oyna.</p>
      </div>

      <div className="space-y-4 rounded-3xl border border-white/10 bg-black/35 p-5 shadow-2xl backdrop-blur">
        {!loaded ? (
          <div className="flex justify-center py-6 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : me ? (
          <p className="flex items-center gap-2 text-sm">
            <span className="text-2xl">{AVATAR_EMOJI[me.avatar] ?? "🙂"}</span>
            <span>
              <b>{me.displayName}</b> olarak oynuyorsunuz
            </span>
          </p>
        ) : (
          <>
            <div>
              <Label htmlFor="nickname">Takma adın</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="ör. Okeyci Ahmet"
                minLength={2}
                maxLength={20}
                autoFocus
                data-testid="nickname"
              />
            </div>
            <div>
              <Label>Avatar</Label>
              <AvatarPicker value={avatar} onChange={setAvatar} />
            </div>
          </>
        )}

        {next && !me && loaded && (
          <Button
            size="lg"
            className="w-full"
            disabled={busy !== null}
            data-testid="continue"
            onClick={async () => {
              try {
                const u = await ensureSession();
                if (u) router.replace(next);
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Devam et
          </Button>
        )}
        <Button size="lg" variant={next && !me ? "secondary" : "default"} className="w-full" disabled={!loaded || busy !== null} onClick={createRoom} data-testid="quick-create">
          {busy === "create" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />} Oda kur ve davet kodu al
        </Button>

        <div className="flex items-center gap-3 text-xs text-white/40">
          <span className="h-px flex-1 bg-white/10" /> veya <span className="h-px flex-1 bg-white/10" />
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void joinRoom();
          }}
        >
          <Input
            aria-label="Oda kodu"
            placeholder="Davet kodu (ör. K7M2QX)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            maxLength={8}
            className="font-mono uppercase tracking-widest"
            data-testid="join-code"
          />
          <Button type="submit" variant="secondary" disabled={!loaded || busy !== null}>
            {busy === "join" ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />} Katıl
          </Button>
        </form>
      </div>

      {rooms.length > 0 && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="mb-2 text-sm font-bold text-white/80">Masalarım</p>
          <ul className="space-y-1.5">
            {rooms.map((r) => (
              <li key={r.code}>
                <Link
                  href={r.currentMatchId && r.status === "playing" ? `/game/${r.currentMatchId}` : `/room/${r.code}`}
                  className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                >
                  <span className="font-semibold">{r.name}</span>
                  <span className="font-mono text-xs text-white/60">
                    {r.code} · {r.status === "playing" ? "oyunda" : "lobide"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-white/40">
        <Link href="/rules" className="hover:text-white/70">
          Oyun kuralları
        </Link>
      </p>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
