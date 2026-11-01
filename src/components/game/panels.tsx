"use client";
import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import { FINISH_LABELS, type HandResult, type Seat } from "@/engine";
import type { ClientGameView } from "@/server/game-service";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNow, seatName } from "./table";

const SEATS: Seat[] = [0, 1, 2, 3];

export function ScoreBoard({ view, open, onClose }: { view: ClientGameView; open: boolean; onClose: () => void }) {
  const team = view.rules.teamMode;
  const totals = view.totals;
  const minTotal = Math.min(...SEATS.map((s) => totals[s]));
  return (
    <Dialog open={open} onClose={onClose} title="Skor tablosu" className="max-w-3xl">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-white/60">
              <th className="py-1 pr-2">El</th>
              {SEATS.map((s) => (
                <th key={s} className={cn("px-2 py-1", team && (s % 2 === 0 ? "text-gold" : "text-sky-300"))}>
                  {seatName(view, s)}
                </th>
              ))}
              {team && <th className="px-2 py-1">Takım A / B</th>}
              <th className="px-2 py-1">Bitiş</th>
            </tr>
          </thead>
          <tbody>
            {view.handResults.map((h) => (
              <tr key={h.handNumber} className="border-t border-white/10">
                <td className="py-1 pr-2 font-bold">{h.handNumber}</td>
                {SEATS.map((s) => (
                  <td key={s} className={cn("px-2 py-1 tabular-nums", h.playerScores[s] < 0 && "text-emerald-300")}>
                    {h.playerScores[s]}
                  </td>
                ))}
                {team && (
                  <td className="px-2 py-1 tabular-nums">
                    {h.teamScores?.[0]} / {h.teamScores?.[1]}
                  </td>
                )}
                <td className="px-2 py-1 text-xs text-white/70">
                  {FINISH_LABELS[h.finishType]}
                  {h.finisher !== null && ` · ${seatName(view, h.finisher)}`}
                </td>
              </tr>
            ))}
            {view.handResults.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-white/50">
                  Henüz tamamlanan el yok.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/30 font-black">
              <td className="py-1 pr-2">Toplam</td>
              {SEATS.map((s) => (
                <td key={s} className={cn("px-2 py-1 tabular-nums", totals[s] === minTotal && "text-gold")}>
                  {totals[s]}
                </td>
              ))}
              {team && (
                <td className="px-2 py-1 tabular-nums">
                  {totals[0] + totals[2]} / {totals[1] + totals[3]}
                </td>
              )}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-xs text-white/50">
        El {Math.min(view.hand.handNumber, view.rules.totalHands)} / {view.rules.totalHands} · Düşük puan kazanır. {view.rules.profileName}
      </p>
    </Dialog>
  );
}

export function HandBreakdown({ view, result }: { view: ClientGameView; result: HandResult }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-black/20 p-3 text-sm">
        <p className="font-black text-gold">
          {FINISH_LABELS[result.finishType]}
          {result.finisher !== null && ` – ${seatName(view, result.finisher)}`}
        </p>
        {result.reasons.map((r, i) => (
          <p key={i} className="text-white/75">
            {r}
          </p>
        ))}
      </div>
      <ul className="space-y-1 text-sm">
        {result.breakdown.map((line, i) => (
          <li key={i} className="flex justify-between gap-3 border-b border-white/5 py-0.5">
            <span>
              <b>{seatName(view, line.seat)}</b> <span className="text-white/70">{line.label}</span>
            </span>
            <span className={cn("tabular-nums font-bold", line.amount < 0 ? "text-emerald-300" : line.amount > 0 ? "text-red-300" : "")}>
              {line.amount > 0 ? `+${line.amount}` : line.amount}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {SEATS.map((s) => (
          <div key={s} className="rounded-lg bg-white/5 p-2">
            <div className="truncate text-white/60">{seatName(view, s)}</div>
            <div className="text-lg font-black tabular-nums">{result.playerScores[s]}</div>
          </div>
        ))}
      </div>
      {result.teamScores && (
        <p className="text-center text-sm font-bold">
          Takım A: {result.teamScores[0]} · Takım B: {result.teamScores[1]}
        </p>
      )}
    </div>
  );
}

export function HandResultDialog({ view, onReady, busy }: { view: ClientGameView; onReady: () => void; busy: boolean }) {
  const result = view.handResults[view.handResults.length - 1];
  const now = useNow(1000);
  const ready = view.mySeat !== null && view.readyForNext.includes(view.mySeat);
  const left = view.hand.turnDeadline ? Math.max(0, Math.ceil((view.hand.turnDeadline - now) / 1000)) : null;
  if (!result) return null;
  return (
    <Dialog open onClose={() => {}} dismissible={false} title={`${result.handNumber}. el sonucu`}>
      <HandBreakdown view={view} result={result} />
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-white/60">
          Hazır: {view.readyForNext.length}/4{left !== null && ` · ${left} sn sonra otomatik devam`}
        </span>
        {view.mySeat !== null && (
          <Button onClick={onReady} disabled={ready || busy} data-testid="ready-next">
            {ready ? "Bekleniyor…" : "Sonraki ele hazırım"}
          </Button>
        )}
      </div>
    </Dialog>
  );
}

export function MatchEndDialog({
  view,
  onLobby,
  onRematch,
  onHome,
}: {
  view: ClientGameView;
  onLobby: () => void;
  onRematch: () => void;
  onHome: () => void;
}) {
  const winner = view.winner;
  const team = view.rules.teamMode;
  const names = winner?.seats.map((s) => seatName(view, s)).join(" & ");
  const iWon = view.mySeat !== null && winner?.seats.includes(view.mySeat) && (winner?.seats.length ?? 4) < 4;
  return (
    <Dialog open onClose={() => {}} dismissible={false} title="Maç bitti" className="max-w-xl">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-4 text-center">
        <Trophy className="mx-auto h-14 w-14 text-gold" />
        <p className="mt-2 text-2xl font-black">
          {winner?.seats.length === 4 ? "Berabere!" : team ? `Kazanan: Takım ${winner?.team === 0 ? "A" : "B"}` : `Kazanan: ${names}`}
        </p>
        {team && winner && winner.seats.length < 4 && <p className="text-white/70">{names}</p>}
        {iWon && <p className="mt-1 font-bold text-emerald-300">Tebrikler! 🎉</p>}
      </motion.div>
      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {SEATS.map((s) => (
          <div key={s} className={cn("rounded-xl p-2", winner?.seats.includes(s) ? "bg-gold/20" : "bg-white/5")}>
            <div className="truncate text-xs text-white/60">{seatName(view, s)}</div>
            <div className="text-xl font-black tabular-nums">{view.totals[s]}</div>
            <div className="text-[10px] text-white/50">
              {view.handResults.filter((h) => h.finisher === s).length} bitiş
            </div>
          </div>
        ))}
      </div>
      {team && (
        <p className="mt-2 text-center text-sm font-bold">
          Takım A: {view.totals[0] + view.totals[2]} · Takım B: {view.totals[1] + view.totals[3]}
        </p>
      )}
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <Button onClick={onRematch} data-testid="rematch">Yeniden oyna</Button>
        <Button variant="secondary" onClick={onLobby}>
          Aynı odayla devam et
        </Button>
        <Button variant="ghost" onClick={onHome}>
          Ana menüye dön
        </Button>
      </div>
    </Dialog>
  );
}
