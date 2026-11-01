"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, UserMinus, UserPlus, X } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { RequireSession, EmptyState, PageLoading } from "@/components/require-session";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AVATAR_EMOJI, cn } from "@/lib/utils";
import type { Me } from "@/lib/session";

interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  online: boolean;
  room: { code: string; name: string; status: string } | null;
}
interface Req {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
}
interface Overview {
  friends: Friend[];
  incoming: Req[];
  outgoing: Req[];
}

function Friends() {
  const [data, setData] = useState<Overview | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; username: string; displayName: string; avatar: string }[]>([]);
  const load = useCallback(async () => {
    try {
      setData(await api<Overview>("/api/friends"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api<{ users: typeof results }>(`/api/users/search?q=${encodeURIComponent(q.trim())}`);
        setResults(r.users);
      } catch (e) {
        toast.error((e as Error).message);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const post = async (body: unknown, ok?: string) => {
    try {
      await api("/api/friends", { body });
      if (ok) toast.success(ok);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!data) return <PageLoading />;
  const friendIds = new Set(data.friends.map((f) => f.id));
  const pendingNames = new Set(data.outgoing.map((o) => o.username));
  return (
    <main className="mx-auto grid max-w-6xl gap-4 px-4 py-8 md:grid-cols-[1fr_22rem]">
      <Card>
        <CardTitle>Arkadaşlarım ({data.friends.length})</CardTitle>
        {data.friends.length === 0 ? (
          <EmptyState title="Henüz arkadaşın yok">Sağdaki aramadan kullanıcı adıyla arkadaş ekle.</EmptyState>
        ) : (
          <ul className="divide-y divide-white/10">
            {data.friends
              .slice()
              .sort((a, b) => Number(b.online) - Number(a.online))
              .map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <Link href={`/profile/${f.username}`} className="flex items-center gap-2">
                    <span className="relative text-2xl">
                      {AVATAR_EMOJI[f.avatar] ?? "🙂"}
                      <span
                        className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-felt-900", f.online ? "bg-emerald-400" : "bg-white/30")}
                        aria-label={f.online ? "Çevrimiçi" : "Çevrimdışı"}
                      />
                    </span>
                    <span>
                      <span className="block font-bold">{f.displayName}</span>
                      <span className="block text-xs text-white/50">
                        @{f.username} · {f.online ? "Çevrimiçi" : "Çevrimdışı"}
                        {f.room ? ` · ${f.room.name}` : ""}
                      </span>
                    </span>
                  </Link>
                  <span className="flex gap-1">
                    {f.room && (
                      <Link href={`/room/${f.room.code}`} className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-felt-950">
                        Odasına katıl
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Arkadaşı kaldır"
                      onClick={() => confirm(`${f.displayName} arkadaş listenden çıkarılsın mı?`) && post({ action: "remove", friendId: f.id }, "Arkadaş kaldırıldı.")}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Card>
      <div className="space-y-4">
        <Card>
          <CardTitle>Arkadaş ekle</CardTitle>
          <Input aria-label="Kullanıcı ara" placeholder="Kullanıcı adı ara…" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-2 space-y-1">
            {results.map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-lg bg-black/20 px-2 py-1.5">
                <span className="text-sm">
                  {AVATAR_EMOJI[u.avatar] ?? "🙂"} <b>{u.displayName}</b> <span className="text-white/50">@{u.username}</span>
                </span>
                {friendIds.has(u.id) ? (
                  <span className="text-xs text-white/50">Arkadaş</span>
                ) : pendingNames.has(u.username) ? (
                  <span className="text-xs text-white/50">İstek gönderildi</span>
                ) : (
                  <Button size="sm" aria-label="İstek gönder" onClick={() => post({ action: "request", username: u.username }, "Arkadaşlık isteği gönderildi.")}>
                    <UserPlus className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
            {q.trim().length >= 2 && results.length === 0 && <li className="text-sm text-white/50">Sonuç yok.</li>}
          </ul>
        </Card>
        <Card>
          <CardTitle>Gelen istekler</CardTitle>
          {data.incoming.length === 0 ? (
            <p className="text-sm text-white/50">Bekleyen istek yok.</p>
          ) : (
            <ul className="space-y-2">
              {data.incoming.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">
                    {AVATAR_EMOJI[r.avatar ?? ""] ?? "🙂"} <b>{r.displayName}</b>
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="success" aria-label="Kabul et" onClick={() => post({ action: "respond", requestId: r.id, accept: true }, "Artık arkadaşsınız!")}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="secondary" aria-label="Reddet" onClick={() => post({ action: "respond", requestId: r.id, accept: false })}>
                      <X className="h-4 w-4" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {data.outgoing.length > 0 && (
            <>
              <p className="mt-4 text-xs font-bold uppercase text-white/50">Gönderilen</p>
              <ul className="mt-1 space-y-1 text-sm text-white/70">
                {data.outgoing.map((o) => (
                  <li key={o.id}>@{o.username} — bekliyor</li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}

function FriendsGate({ me }: { me: Me }) {
  if (me.isGuest)
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <Card>
          <CardTitle>Arkadaşlar</CardTitle>
          <p className="text-sm text-white/70">Arkadaş sistemi kayıtlı hesaplar içindir. Misafir hesabını kaydedersen maçların ve istatistiklerin korunur.</p>
          <Link href="/register" className="mt-4 inline-block rounded-xl bg-gold px-4 py-2 font-bold text-felt-950">
            Hesabımı kaydet
          </Link>
        </Card>
      </main>
    );
  return <Friends />;
}

export default function FriendsPage() {
  return <RequireSession>{(me) => <FriendsGate me={me} />}</RequireSession>;
}
