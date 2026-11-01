"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bot, Check, Copy, Crown, Lock, LogOut, Play, Share2, UserPlus, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { realtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { AVATAR_EMOJI, AVATARS, cn, SEAT_NAMES } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageLoading } from "@/components/require-session";
import { RoomSettingsForm } from "@/components/room-settings-form";
import type { RoomView } from "@/server/rooms";
import type { RoomSettings } from "@/server/validation";

type RoomResponse =
  | { access: "full"; room: RoomView; needsPassword: boolean }
  | { access: "limited"; room: { code: string; name: string; hasPassword: boolean; playerCount: number }; needsPassword: boolean };

export function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("t") ?? undefined;
  const { me, loaded, refresh } = useSession();
  const [data, setData] = useState<RoomResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<RoomResponse>(`/api/rooms/${code}${token ? `?t=${encodeURIComponent(token)}` : ""}`);
      setData(r);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [code, token]);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);
  useEffect(() => {
    if (loaded) void load();
  }, [loaded, me, load]);

  const room = data?.access === "full" ? data.room : null;
  const isMember = !!room?.isMember;

  // Gerçek zamanlı lobi güncellemeleri
  useEffect(() => {
    if (!me || !isMember) return;
    const release = realtime.acquire();
    const off = realtime.on((m) => {
      if (m.t === "room") {
        const r = m.room as RoomView;
        if (r.code !== code) return;
        setData((d) => (d ? { access: "full", room: r, needsPassword: false } : d));
      }
    });
    realtime.watchRoom(code, token);
    return () => {
      off();
      realtime.unwatchRoom();
      release();
    };
  }, [me, isMember, code, token, router]);

  // Maç başladığında koltuğu olan oyuncuyu masaya götür (oyuncu masadan bilerek ayrıldıysa ?stay=1 ile kalır).
  const stay = params.get("stay") === "1";
  const seatedInMatch = !!room && room.status === "playing" && !!room.currentMatchId && room.members.some((x) => x.userId === me?.id && x.seat !== null);
  useEffect(() => {
    if (!seatedInMatch || stay || !room?.currentMatchId) return;
    const target = `/game/${room.currentMatchId}`;
    router.push(target);
    // İstemci yönlendirmesi tamamlanmazsa tam sayfa yönlendirmeye geç.
    const t = setTimeout(() => {
      if (window.location.pathname.startsWith("/room/")) window.location.assign(target);
    }, 2500);
    return () => clearTimeout(t);
  }, [seatedInMatch, stay, room?.currentMatchId, router]);

  if (!loaded || (!data && !error)) return <PageLoading />;
  if (error) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Oda açılamadı</h1>
        <p className="mt-2 text-white/60">{error}</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-gold px-4 py-2 font-bold text-felt-950">
          Ana sayfaya dön
        </Link>
      </main>
    );
  }
  if (!me) return <GuestGate code={code} name={data!.room.name} onDone={refresh} />;
  if (!isMember) return <JoinCard code={code} token={token} data={data!} onJoined={load} />;
  return <Lobby room={room!} meId={me.id} isGuest={me.isGuest} onChange={(r) => setData({ access: "full", room: r, needsPassword: false })} />;
}

function GuestGate({ code, name, onDone }: { code: string; name: string; onDone: () => Promise<unknown> }) {
  const [nick, setNick] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardTitle>“{name}” odasına davet edildiniz</CardTitle>
        <p className="mb-4 text-sm text-white/70">Bir takma ad yazın, masaya oturun. Hesap gerekmez.</p>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("/api/auth/guest", { body: { nickname: nick, avatar } });
              await onDone();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Label htmlFor="nick">Takma ad</Label>
          <Input id="nick" value={nick} onChange={(e) => setNick(e.target.value)} minLength={2} maxLength={20} required placeholder="ör. Okeyci Ahmet" />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Avatar">
            {AVATARS.map((a) => (
              <button
                type="button"
                key={a}
                role="radio"
                aria-checked={avatar === a}
                onClick={() => setAvatar(a)}
                className={cn("grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl", avatar === a && "ring-2 ring-gold")}
              >
                {AVATAR_EMOJI[a]}
              </button>
            ))}
          </div>
          <Button className="w-full" disabled={busy}>
            Masaya otur
          </Button>
        </form>
      </Card>
    </main>
  );
}

function JoinCard({ code, token, data, onJoined }: { code: string; token?: string; data: RoomResponse; onJoined: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const playerCount = data.access === "full" ? data.room.members.filter((m) => m.seat !== null).length : data.room.playerCount;
  const isPrivate = data.access === "limited";
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardTitle>{data.room.name}</CardTitle>
        <p className="text-sm text-white/70">
          Oda kodu <b className="font-mono">{code}</b> · {playerCount}/4 oyuncu
        </p>
        {isPrivate && !data.needsPassword && <p className="mt-3 text-sm text-amber-300">Bu özel odaya yalnızca davet linkiyle katılabilirsiniz.</p>}
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(`/api/rooms/${code}/join`, { body: { token: token ?? null, password: password || null } });
              onJoined();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {data.needsPassword && (
            <div>
              <Label htmlFor="pw">
                <Lock className="mr-1 inline h-3.5 w-3.5" /> Oda şifresi
              </Label>
              <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          )}
          <Button className="w-full" disabled={busy || (isPrivate && !data.needsPassword && !token)}>
            {playerCount >= 4 ? "Seyirci / bekleme olarak katıl" : "Odaya katıl"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

function Lobby({ room, meId, isGuest, onChange }: { room: RoomView; meId: string; isGuest: boolean; onChange: (r: RoomView) => void }) {
  const router = useRouter();
  const isOwner = room.ownerId === meId;
  const mine = room.members.find((m) => m.userId === meId);
  const [settings, setSettings] = useState<RoomSettings>(room.settings);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!dirty) setSettings(room.settings);
  }, [room.settings, dirty]);

  const inviteUrl = useMemo(
    () => (typeof window === "undefined" ? "" : `${window.location.origin}/room/${room.code}${room.inviteToken ? `?t=${room.inviteToken}` : ""}`),
    [room.code, room.inviteToken],
  );
  const seated = room.members.filter((m) => m.seat !== null);
  const waiting = room.members.filter((m) => m.seat === null);
  const allReady = seated.length === 4 && seated.every((m) => m.ready || m.userId === room.ownerId);

  const call = async (path: string, body: unknown) => {
    setBusy(true);
    try {
      const r = await api<{ room?: RoomView; matchId?: string }>(`/api/rooms/${room.code}/${path}`, { body });
      if (r.room) onChange(r.room);
      return r;
    } catch (e) {
      toast.error((e as ApiError).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const seatBox = (seat: number) => {
    const m = room.members.find((x) => x.seat === seat);
    const team = room.settings.teamMode ? (seat % 2 === 0 ? "A" : "B") : null;
    return (
      <div
        data-testid={`lobby-seat-${seat}`}
        className={cn(
          "flex min-h-[92px] w-36 flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-felt-950/70 p-2 text-center",
          team === "A" ? "border-gold/70" : team === "B" ? "border-sky-400/70" : "border-white/10",
        )}
      >
        <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
          {SEAT_NAMES[seat]}
          {team && ` · Takım ${team}`}
        </span>
        {m ? (
          <>
            <span className="flex items-center gap-1 text-sm font-extrabold">
              <span className="text-lg">{AVATAR_EMOJI[m.avatar] ?? "🙂"}</span>
              <span className="max-w-[6rem] truncate">{m.displayName}</span>
              {m.isOwner && <Crown className="h-3.5 w-3.5 text-gold" aria-label="Oda sahibi" />}
              {m.isBot && <Bot className="h-3.5 w-3.5 text-sky-300" aria-label="Bot" />}
            </span>
            <span className="flex items-center gap-1 text-[11px]">
              <span className={cn("h-2 w-2 rounded-full", m.online ? "bg-emerald-400" : "bg-white/30")} />
              {m.ready || m.isOwner ? <Badge tone="green">Hazır</Badge> : <Badge>Bekliyor</Badge>}
            </span>
            {isOwner && m.isBot && room.status === "lobby" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => call("bots", { remove: m.userId })} aria-label={`${m.displayName} botunu çıkar`}>
                <X className="h-3.5 w-3.5" /> Çıkar
              </Button>
            )}
            {isOwner && m.userId !== meId && !m.isBot && room.status === "lobby" && (
              <select
                aria-label={`${m.displayName} koltuğunu değiştir`}
                className="mt-1 rounded bg-black/30 text-[11px]"
                value=""
                onChange={(e) => call("move", { userId: m.userId, seat: e.target.value === "out" ? null : Number(e.target.value) })}
              >
                <option value="">Taşı…</option>
                {[0, 1, 2, 3].filter((s) => s !== seat).map((s) => (
                  <option key={s} value={s}>
                    {SEAT_NAMES[s]} ile değiştir
                  </option>
                ))}
                <option value="out">Seyirciye al</option>
              </select>
            )}
          </>
        ) : (
          room.status === "lobby" && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => call("seat", { seat })}>
              Otur
            </Button>
          )
        )}
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black">{room.name}</h1>
        <Badge tone="gold">{room.visibility === "private" ? "Özel" : "Herkese açık"}</Badge>
        {room.hasPassword && <Badge>Şifreli</Badge>}
        <span className="font-mono text-sm text-white/70">Kod: {room.code}</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={async () => {
            const r = await call("leave", {});
            if (r) router.push("/");
          }}
        >
          <LogOut className="h-4 w-4" /> Odadan ayrıl
        </Button>
      </div>

      {room.status === "playing" && room.currentMatchId && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-gold/40">
          <span className="font-bold">Maç devam ediyor.</span>
          <Button onClick={() => router.push(`/game/${room.currentMatchId}`)}>
            <Play className="h-4 w-4" /> {mine?.seat !== null ? "Masaya dön" : "İzle"}
          </Button>
        </Card>
      )}
      {room.status === "lobby" && room.lastMatch?.status === "finished" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-white/80">Son maç tamamlandı. Aynı odada yeni maç için herkes hazır olsun.</span>
          <Link href={`/game/${room.lastMatch.id}`} className="text-sm font-bold text-gold">
            Son maçın sonucunu gör
          </Link>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="felt">
          <div className="grid grid-cols-3 grid-rows-3 place-items-center gap-2 py-2">
            <div className="col-start-2 row-start-1">{seatBox(2)}</div>
            <div className="col-start-1 row-start-2">{seatBox(3)}</div>
            <div className="col-start-2 row-start-2 text-center text-xs font-bold text-white/50">
              {room.settings.teamMode ? "Eşli" : "Eşsiz"} · {room.settings.folding ? "Katlamalı" : "Katlamasız"}
              <br />
              {room.settings.assisted ? "Yardımlı" : "Yardımsız"} · {room.settings.totalHands} el
            </div>
            <div className="col-start-3 row-start-2">{seatBox(1)}</div>
            <div className="col-start-2 row-start-3">{seatBox(0)}</div>
          </div>
          {room.status === "lobby" && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {mine?.seat !== null && mine && !isOwner && (
                <Button variant={mine.ready ? "secondary" : "success"} disabled={busy} onClick={() => call("ready", { ready: !mine.ready })} data-testid="toggle-ready">
                  <Check className="h-4 w-4" /> {mine.ready ? "Hazır değilim" : "Hazırım"}
                </Button>
              )}
              {mine?.seat !== null && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => call("seat", { seat: null })}>
                  Koltuktan kalk
                </Button>
              )}
              {isOwner && seated.length < 4 && (
                <Button variant="secondary" disabled={busy} onClick={() => call("bots", {})} data-testid="add-bots">
                  <Bot className="h-4 w-4" /> Boş koltuklara bot ekle
                </Button>
              )}
              {isOwner && (
                <Button
                  disabled={busy || !allReady}
                  data-testid="start-match"
                  onClick={async () => {
                    const r = await call("start", {});
                    if (r?.matchId) router.push(`/game/${r.matchId}`);
                  }}
                >
                  <Play className="h-4 w-4" /> Maçı başlat
                </Button>
              )}
            </div>
          )}
          {room.status === "lobby" && isOwner && !allReady && (
            <p className="mt-2 text-center text-xs text-white/60">
              Başlatmak için dört oyuncu oturmalı ve herkes hazır olmalı. Arkadaşların gelmediyse boş koltuklara bot ekleyip tek başına deneyebilirsin.
            </p>
          )}
          {waiting.length > 0 && (
            <div className="mt-3 text-sm">
              <span className="font-bold text-white/70">Seyirci / bekleyenler: </span>
              {waiting.map((w) => w.displayName).join(", ")}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" /> Davet et
            </CardTitle>
            <p className="mb-1 text-xs text-white/60">Arkadaşlarına bu kodu gönder; ana sayfada kodu yazıp katılırlar.</p>
            <button
              type="button"
              className="mb-3 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gold/60 bg-gold/10 py-3 font-mono text-3xl font-black tracking-[0.3em] text-gold hover:bg-gold/20"
              aria-label="Oda kodunu kopyala"
              data-testid="room-code"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(room.code);
                  toast.success("Oda kodu kopyalandı.");
                } catch {
                  toast.error("Kopyalanamadı; kodu elle yazın.");
                }
              }}
            >
              {room.code} <Copy className="h-5 w-5" />
            </button>
            <p className="mb-1 text-xs text-white/60">veya doğrudan link:</p>
            <div className="flex gap-2">
              <Input readOnly value={inviteUrl} aria-label="Davet linki" data-testid="invite-url" onFocus={(e) => e.target.select()} />
              <Button
                variant="secondary"
                aria-label="Linki kopyala"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl);
                    toast.success("Davet linki kopyalandı.");
                  } catch {
                    toast.error("Kopyalanamadı; linki elle seçin.");
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                className="inline-flex h-9 items-center rounded-xl bg-[#25D366] px-3 text-sm font-bold text-white"
                href={`https://wa.me/?text=${encodeURIComponent(`101 Okey masama gel! Davet kodu: ${room.code}
${inviteUrl}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp ile paylaş
              </a>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <Button size="sm" variant="secondary" onClick={() => navigator.share({ title: room.name, text: "101 Okey masama gel!", url: inviteUrl }).catch(() => {})}>
                  Diğer uygulamalar
                </Button>
              )}
            </div>
            {!isGuest && <FriendInvite code={room.code} />}
          </Card>
          <Card>
            <CardTitle>Oda ayarları</CardTitle>
            {!isOwner && <p className="mb-2 text-xs text-white/60">Ayarları yalnızca oda sahibi değiştirebilir.</p>}
            {room.status === "playing" && <p className="mb-2 text-xs text-amber-300">Maç sürerken kurallar sabittir.</p>}
            <RoomSettingsForm
              value={settings}
              disabled={!isOwner || room.status !== "lobby"}
              onChange={(v) => {
                setSettings(v);
                setDirty(true);
              }}
            />
            {isOwner && dirty && (
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSettings(room.settings);
                    setDirty(false);
                  }}
                >
                  Geri al
                </Button>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await api<{ room: RoomView }>(`/api/rooms/${room.code}`, { method: "PATCH", body: { settings } });
                      onChange(r.room);
                      setDirty(false);
                      toast.success("Ayarlar kaydedildi; hazır durumları sıfırlandı.");
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Kaydet
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}

function FriendInvite({ code }: { code: string }) {
  const [friends, setFriends] = useState<{ id: string; displayName: string; online: boolean }[] | null>(null);
  useEffect(() => {
    api<{ friends: { id: string; displayName: string; online: boolean }[] }>("/api/friends")
      .then((r) => setFriends(r.friends))
      .catch(() => setFriends([]));
  }, []);
  if (!friends) return null;
  return (
    <div className="mt-4">
      <p className="mb-1 text-sm font-bold text-white/80">Arkadaşlarını davet et</p>
      {friends.length === 0 ? (
        <p className="text-xs text-white/50">
          Henüz arkadaşınız yok. <Link href="/friends" className="text-gold">Arkadaş ekleyin</Link>.
        </p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-auto">
          {friends.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", f.online ? "bg-emerald-400" : "bg-white/30")} />
                {f.displayName}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await api(`/api/rooms/${code}/invite`, { body: { friendId: f.id } });
                    toast.success(`${f.displayName} davet edildi.`);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <UserPlus className="h-3.5 w-3.5" /> Davet
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
