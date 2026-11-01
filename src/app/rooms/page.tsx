"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Lock, Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { EmptyState, PageLoading } from "@/components/require-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JoinByCode } from "@/components/join-by-code";

interface PublicRoom {
  code: string;
  name: string;
  status: string;
  hasPassword: boolean;
  players: number;
  settings: { teamMode: boolean; folding: boolean; assisted: boolean; totalHands: number };
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api<{ rooms: PublicRoom[] }>("/api/rooms");
      setRooms(r.rooms);
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black">Herkese açık odalar</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Yenile
          </Button>
          <Link href="/rooms/create" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gold px-4 text-sm font-bold text-felt-950">
            <Plus className="h-4 w-4" /> Oda oluştur
          </Link>
        </div>
      </div>
      <div className="max-w-md">
        <JoinByCode />
      </div>
      {error && !rooms ? (
        <EmptyState title="Odalar yüklenemedi">{error}</EmptyState>
      ) : rooms === null ? (
        <PageLoading />
      ) : rooms.length === 0 ? (
        <EmptyState title="Şu an açık oda yok">İlk masayı sen kur!</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r) => (
            <Link key={r.code} href={`/room/${r.code}`} className="rounded-2xl border border-white/10 bg-felt-900/80 p-4 transition hover:border-gold/60">
              <div className="flex items-start justify-between gap-2">
                <p className="font-extrabold">{r.name}</p>
                {r.hasPassword && <Lock className="h-4 w-4 text-white/60" aria-label="Şifreli" />}
              </div>
              <p className="text-xs text-white/50">{r.code}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={r.status === "playing" ? "green" : "gold"}>{r.status === "playing" ? "Oyunda" : `${r.players}/4 oyuncu`}</Badge>
                <Badge>{r.settings.teamMode ? "Eşli" : "Eşsiz"}</Badge>
                {r.settings.folding && <Badge>Katlamalı</Badge>}
                <Badge>{r.settings.assisted ? "Yardımlı" : "Yardımsız"}</Badge>
                <Badge>{r.settings.totalHands} el</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
