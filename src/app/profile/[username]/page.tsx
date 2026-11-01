"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { PageLoading } from "@/components/require-session";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AVATAR_EMOJI } from "@/lib/utils";

interface Profile {
  user: { username: string; displayName: string; avatar: string; isGuest: boolean; createdAt: string };
  stats: {
    matchesPlayed: number;
    matchesWon: number;
    matchesLost: number;
    winRate: number;
    handsPlayed: number;
    normalFinishes: number;
    jokerFinishes: number;
    pairFinishes: number;
    handFinishes: number;
    teamMatchesPlayed: number;
    teamMatchesWon: number;
    teamWinRate: number;
  } | null;
  recent: { matchId: string; status: string; teamMode: boolean; startedAt: string; finalScore: number | null; isWinner: boolean | null; players: { seat: number; displayName: string }[] }[];
}

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  useEffect(() => {
    api<Profile>(`/api/users/${encodeURIComponent(username)}`)
      .then(setData)
      .catch((e: ApiError) => setError({ status: e.status, message: e.message }));
  }, [username]);
  if (error)
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-black">{error.status === 404 ? "Oyuncu bulunamadı" : "Profil yüklenemedi"}</h1>
        <p className="mt-2 text-white/60">{error.message}</p>
        <Link href="/" className="mt-6 inline-block font-bold text-gold">
          Ana sayfa
        </Link>
      </main>
    );
  if (!data) return <PageLoading />;
  const s = data.stats;
  const tiles: [string, string | number][] = s
    ? [
        ["Oynanan maç", s.matchesPlayed],
        ["Kazanılan", s.matchesWon],
        ["Kaybedilen", s.matchesLost],
        ["Kazanma oranı", `%${s.winRate}`],
        ["Oynanan el", s.handsPlayed],
        ["Normal bitiş", s.normalFinishes],
        ["Okeyle bitiş", s.jokerFinishes],
        ["Çiftten bitiş", s.pairFinishes],
        ["Elden bitiş", s.handFinishes],
        ["Eşli maç", s.teamMatchesPlayed],
        ["Eşli galibiyet", s.teamMatchesWon],
        ["Eşli başarı", `%${s.teamWinRate}`],
      ]
    : [];
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-4xl">{AVATAR_EMOJI[data.user.avatar] ?? "🙂"}</span>
        <div>
          <h1 className="text-3xl font-black">{data.user.displayName}</h1>
          <p className="text-sm text-white/50">
            @{data.user.username} {data.user.isGuest && <Badge>Misafir</Badge>} · Üyelik: {new Date(data.user.createdAt).toLocaleDateString("tr-TR")}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-felt-900/80 p-3">
            <p className="text-xs font-semibold text-white/50">{label}</p>
            <p className="text-2xl font-black">{value}</p>
          </div>
        ))}
      </div>
      <Card>
        <CardTitle>Son maçlar</CardTitle>
        {data.recent.length === 0 ? (
          <p className="text-sm text-white/50">Henüz maç yok.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {data.recent.map((m) => (
              <li key={m.matchId} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="block font-semibold">{m.players.map((p) => p.displayName).join(" · ")}</span>
                  <span className="text-xs text-white/50">
                    {new Date(m.startedAt).toLocaleString("tr-TR")} · {m.teamMode ? "Eşli" : "Eşsiz"}
                  </span>
                </span>
                <span className="text-right">
                  {m.status === "finished" ? <Badge tone={m.isWinner ? "green" : "red"}>{m.isWinner ? "Kazandı" : "Kaybetti"}</Badge> : <Badge tone="gold">Devam ediyor</Badge>}
                  {m.finalScore !== null && <span className="block font-black">{m.finalScore}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
