"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { RequireSession, EmptyState, PageLoading } from "@/components/require-session";
import { Badge } from "@/components/ui/badge";
import { HandResultsTable } from "@/components/hand-results-table";
import type { HandResult } from "@/engine/types";

interface HistoryItem {
  matchId: string;
  status: string;
  teamMode: boolean;
  totalHands: number;
  startedAt: string;
  finishedAt: string | null;
  seat: number;
  finalScore: number | null;
  isWinner: boolean | null;
  players: { seat: number; displayName: string; finalScore: number | null }[];
}

function Detail({ matchId, names }: { matchId: string; names: string[] }) {
  const [hands, setHands] = useState<HandResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ hands: HandResult[] }>(`/api/matches/${matchId}/detail`)
      .then((d) => setHands(d.hands))
      .catch((e) => setError((e as Error).message));
  }, [matchId]);
  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (!hands) return <p className="text-sm text-white/50">Yükleniyor…</p>;
  return <HandResultsTable hands={hands} names={names} />;
}

function HistoryList({ matches }: { matches: HistoryItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (matches.length === 0) return <EmptyState title="Henüz maç oynamadın">Bir odaya katıl ve ilk maçını tamamla.</EmptyState>;
  return (
    <ul className="space-y-2">
      {matches.map((m) => {
        const names = [0, 1, 2, 3].map((s) => m.players.find((p) => p.seat === s)?.displayName ?? "?");
        return (
          <li key={m.matchId} className="rounded-2xl border border-white/10 bg-felt-900/80">
            <button className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={open === m.matchId} onClick={() => setOpen(open === m.matchId ? null : m.matchId)}>
              {open === m.matchId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="flex-1">
                <span className="block font-bold">{names.join(" · ")}</span>
                <span className="block text-xs text-white/50">
                  {new Date(m.startedAt).toLocaleString("tr-TR")} · {m.teamMode ? "Eşli" : "Eşsiz"} · {m.totalHands} el
                </span>
              </span>
              <span className="text-right">
                {m.status === "finished" ? (
                  <Badge tone={m.isWinner ? "green" : "red"}>{m.isWinner ? "Kazandı" : "Kaybetti"}</Badge>
                ) : (
                  <Badge tone="gold">{m.status === "playing" ? "Devam ediyor" : m.status}</Badge>
                )}
                {m.finalScore !== null && <span className="block text-sm font-black">{m.finalScore}</span>}
              </span>
            </button>
            {open === m.matchId && (
              <div className="border-t border-white/10 p-4">
                <Detail matchId={m.matchId} names={names} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function History() {
  const [matches, setMatches] = useState<HistoryItem[] | null>(null);
  useEffect(() => {
    api<{ matches: HistoryItem[] }>("/api/history")
      .then((d) => setMatches(d.matches))
      .catch((e) => {
        toast.error((e as Error).message);
        setMatches([]);
      });
  }, []);
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <h1 className="text-3xl font-black">Maç geçmişi</h1>
      {matches === null ? <PageLoading /> : <HistoryList matches={matches} />}
    </main>
  );
}

export default function HistoryPage() {
  return <RequireSession>{() => <History />}</RequireSession>;
}
