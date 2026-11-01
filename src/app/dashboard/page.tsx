"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Check, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { RequireSession, EmptyState } from "@/components/require-session";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SEAT_NAMES } from "@/lib/utils";
import { JoinByCode } from "@/components/join-by-code";
import type { Me } from "@/lib/session";

interface MyRoom {
  code: string;
  name: string;
  status: string;
  currentMatchId: string | null;
  seat: number | null;
}
interface Invitation {
  id: string;
  roomCode: string;
  roomName: string;
  from: string;
}

function Dashboard({ me }: { me: Me }) {
  const router = useRouter();
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  const [invites, setInvites] = useState<Invitation[] | null>(null);
  const load = useCallback(async () => {
    try {
      const [r, i] = await Promise.all([api<{ mine: MyRoom[] }>("/api/rooms"), api<{ invitations: Invitation[] }>("/api/invitations")]);
      setRooms(r.mine);
      setInvites(i.invitations);
    } catch (e) {
      toast.error((e as Error).message);
      setRooms([]);
      setInvites([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (inv: Invitation, accept: boolean) => {
    try {
      const r = await api<{ roomCode: string | null }>(`/api/invitations/${inv.id}`, { body: { accept } });
      if (accept && r.roomCode) router.push(`/room/${r.roomCode}`);
      else void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Merhaba, {me.displayName}</h1>
          <p className="text-white/60">Bir masa kur ya da arkadaşlarının masasına katıl.</p>
        </div>
        <Link href={`/profile/${me.username}`} className="flex items-center gap-1.5 text-sm font-bold text-gold">
          <BarChart3 className="h-4 w-4" /> İstatistiklerim
        </Link>
      </div>

      {me.isGuest && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4">
          <p className="text-sm">Misafir olarak oynuyorsun. Hesabını kaydederek arkadaş ekleyebilir ve geçmişini kalıcı tutabilirsin.</p>
          <Link href="/register" className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-felt-950">
            Hesabımı kaydet
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Yeni oyun</CardTitle>
          <Button size="lg" className="w-full" onClick={() => router.push("/rooms/create")}>
            <Plus className="h-5 w-5" /> Oda oluştur
          </Button>
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-white/70">Koda göre katıl</p>
            <JoinByCode />
          </div>
          <Link href="/rooms" className="mt-4 inline-block text-sm font-bold text-gold">
            Herkese açık odaları gör →
          </Link>
        </Card>
        <Card>
          <CardTitle>Davetler</CardTitle>
          {invites === null ? (
            <p className="text-sm text-white/50">Yükleniyor…</p>
          ) : invites.length === 0 ? (
            <EmptyState title="Bekleyen davet yok" />
          ) : (
            <ul className="space-y-2">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2 rounded-xl bg-black/20 p-3">
                  <span className="text-sm">
                    <b>{inv.from}</b> seni <b>{inv.roomName}</b> odasına davet etti
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="success" aria-label="Kabul et" onClick={() => respond(inv, true)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="secondary" aria-label="Reddet" onClick={() => respond(inv, false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle>Odalarım</CardTitle>
        {rooms === null ? (
          <p className="text-sm text-white/50">Yükleniyor…</p>
        ) : rooms.length === 0 ? (
          <EmptyState title="Henüz bir odada değilsin">Bir oda oluştur veya davet linkiyle katıl.</EmptyState>
        ) : (
          <ul className="divide-y divide-white/10">
            {rooms.map((r) => (
              <li key={r.code} className="flex items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-bold">{r.name}</p>
                  <p className="text-xs text-white/50">
                    {r.code} · {r.seat !== null ? `${SEAT_NAMES[r.seat]} koltuk` : "Seyirci"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === "playing" ? "green" : "default"}>{r.status === "playing" ? "Oyunda" : "Lobide"}</Badge>
                  <Link
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white/20"
                    href={r.status === "playing" && r.currentMatchId ? `/game/${r.currentMatchId}` : `/room/${r.code}`}
                  >
                    {r.status === "playing" ? "Masaya dön" : "Lobiye git"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}

export default function DashboardPage() {
  return <RequireSession>{(me) => <Dashboard me={me} />}</RequireSession>;
}
