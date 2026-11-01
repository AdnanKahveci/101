"use client";
import { motion } from "motion/react";
import { Crown, Wifi, WifiOff } from "lucide-react";
import { COLOR_LABELS, isJoker, type Face, type Seat, type TableMeld, type TablePair, type Tile as TileT } from "@/engine";
import type { ClientGameView } from "@/server/game-service";
import { AVATAR_EMOJI, cn, SEAT_NAMES } from "@/lib/utils";
import { realtime } from "@/lib/realtime";
import { useEffect, useState } from "react";
import { Tile } from "./tile";

export function useNow(intervalMs = 500) {
  const [now, setNow] = useState(() => realtime.now());
  useEffect(() => {
    const t = setInterval(() => setNow(realtime.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function PlayerBadge({
  view,
  seat,
  position,
  online,
}: {
  view: ClientGameView;
  seat: Seat;
  position: "top" | "left" | "right" | "bottom";
  online: boolean;
}) {
  const p = view.players.find((x) => x.seat === seat)!;
  const isTurn = view.phase === "playing" && view.hand.currentTurn === seat;
  const now = useNow();
  const deadline = view.hand.turnDeadline;
  const total = view.rules.turnSeconds * 1000;
  const remaining = isTurn && deadline ? Math.max(0, deadline - now) : 0;
  const pct = total > 0 && isTurn && deadline ? remaining / total : 0;
  const teamColor = p.team === null ? "" : p.team === 0 ? "border-gold" : "border-sky-400";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-2xl border-2 bg-felt-950/80 px-2 py-1.5 shadow-lg",
        teamColor || "border-white/10",
        isTurn && "turn-pulse",
        position === "left" || position === "right" ? "flex-col sm:flex-row" : "",
      )}
      data-testid={`seat-${seat}`}
    >
      <div className="relative">
        <svg className="absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] -rotate-90" viewBox="0 0 36 36" aria-hidden>
          {isTurn && total > 0 && <circle cx="18" cy="18" r="16" fill="none" stroke={pct < 0.25 ? "#ef4444" : "#f2c14e"} strokeWidth="3" strokeDasharray={`${pct * 100.5} 100.5`} />}
        </svg>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-felt-700 text-xl">{AVATAR_EMOJI[view.avatars[seat]] ?? "🙂"}</span>
        <span
          className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-felt-950", online ? "bg-emerald-400" : "bg-red-500")}
          aria-label={online ? "Bağlı" : "Bağlantı yok"}
        />
      </div>
      <div className="min-w-0 text-center sm:text-left">
        <div className="flex items-center gap-1">
          <span className="max-w-[7rem] truncate text-xs font-extrabold sm:text-sm">{p.displayName}</span>
          {view.hand.dealer === seat && <span title="Dağıtıcı" className="text-[10px] text-white/50">D</span>}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1 text-[10px] font-bold text-white/70 sm:justify-start">
          <span>{p.tileCount} taş</span>
          {p.opened && (
            <span className="rounded bg-emerald-500/25 px-1 text-emerald-300">
              {p.opened.kind === "pairs" ? `${p.opened.value} çift` : `${p.opened.value} açtı`}
            </span>
          )}
          {p.team !== null && <span className={p.team === 0 ? "text-gold" : "text-sky-300"}>{p.team === 0 ? "A" : "B"}</span>}
          {isTurn && total > 0 && <span className={cn(pct < 0.25 && "text-red-400")}>{Math.ceil(remaining / 1000)}s</span>}
          {!online && (
            <span className="flex items-center gap-0.5 text-red-300">
              <WifiOff className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function DiscardPile({
  tiles,
  okey,
  takeable,
  onTake,
  label,
  dropTarget,
}: {
  tiles: TileT[];
  okey: Face;
  takeable?: boolean;
  onTake?: () => void;
  label: string;
  dropTarget?: boolean;
}) {
  const top = tiles[tiles.length - 1];
  return (
    <div
      className={cn(
        "flex h-[60px] w-[46px] items-center justify-center rounded-lg border-2 border-dashed sm:h-[72px] sm:w-[54px]",
        dropTarget ? "border-gold/70 bg-gold/10" : "border-white/15",
        takeable && "border-solid border-emerald-400",
      )}
      data-drop={dropTarget ? "discard" : undefined}
      aria-label={label}
      title={label}
    >
      {top ? (
        <Tile tile={top} okey={okey} size="sm" onClick={takeable ? onTake : undefined} highlight={takeable ? "target" : null} />
      ) : (
        <span className="text-center text-[9px] leading-tight text-white/35">{dropTarget ? "At" : ""}</span>
      )}
    </div>
  );
}

export function CenterPile({ view, canDraw, onDraw }: { view: ClientGameView; canDraw: boolean; onDraw: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={canDraw ? onDraw : undefined}
        disabled={!canDraw}
        aria-label={`Desteden taş çek (${view.hand.drawPileCount} taş)`}
        className={cn("relative h-14 w-10 rounded-md bg-gradient-to-b from-cream-dark to-[#c9b98d] shadow-lg sm:h-16 sm:w-12", canDraw && "ring-2 ring-emerald-400 hover:-translate-y-0.5")}
      >
        <span className="absolute inset-x-0 bottom-1 text-center text-xs font-black text-wood-900">{view.hand.drawPileCount}</span>
        <span className="absolute -right-1 -top-1 h-full w-full rounded-md bg-cream-dark/60 -z-10" />
      </button>
      <div className="flex flex-col items-center">
        <Tile tile={view.hand.indicator} size="sm" layout={false} />
        <span className="mt-0.5 text-[10px] font-bold text-white/70">Gösterge</span>
      </div>
      <div className="flex flex-col items-center text-center">
        <span className="text-[10px] font-bold uppercase text-gold">Okey</span>
        <span className="text-sm font-black">
          {COLOR_LABELS[view.hand.okey.color]} {view.hand.okey.value}
        </span>
      </div>
    </div>
  );
}

export function MeldView({
  meld,
  okey,
  ownerName,
  target,
  onClick,
}: {
  meld: TableMeld;
  okey: Face;
  ownerName: string;
  target: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div
      layout
      data-meld-id={meld.id}
      onClick={onClick}
      title={`${ownerName} – ${meld.kind === "run" ? "seri" : "grup"}`}
      className={cn(
        "flex shrink-0 gap-[1px] rounded-md bg-black/20 p-0.5",
        target && "cursor-pointer ring-2 ring-emerald-400",
        onClick && "cursor-pointer",
      )}
    >
      {meld.cells.map((c) => {
        const tile: TileT = c.tileId.startsWith("f-")
          ? { id: c.tileId, color: null, value: null, copyIndex: 0, isFakeJoker: true }
          : parseTile(c.tileId);
        return <Tile key={c.tileId} tile={tile} okey={okey} size="xs" represents={c.isJoker ? { color: c.color, value: c.value } : null} />;
      })}
    </motion.div>
  );
}

export function PairView({ pair, okey }: { pair: TablePair; okey: Face }) {
  return (
    <div className="flex shrink-0 gap-[1px] rounded-md bg-sky-900/30 p-0.5">
      {pair.tileIds.map((id) => (
        <Tile key={id} tile={parseTile(id)} okey={okey} size="xs" />
      ))}
    </div>
  );
}

const CODE_COLOR: Record<string, TileT["color"]> = { r: "red", y: "yellow", b: "blue", k: "black" };

/** Kamuya açık masadaki taşın kimliğinden taşı yeniden kurar (kimlik renk-sayı-kopya içerir). */
export function parseTile(id: string): TileT {
  if (id.startsWith("f-")) return { id, color: null, value: null, copyIndex: Number(id.slice(2)) as 0 | 1, isFakeJoker: true };
  const m = /^([rybk])(\d+)-([01])$/.exec(id)!;
  return { id, color: CODE_COLOR[m[1]], value: Number(m[2]), copyIndex: Number(m[3]) as 0 | 1, isFakeJoker: false };
}

export function seatName(view: ClientGameView, seat: Seat) {
  return view.players.find((p) => p.seat === seat)?.displayName ?? SEAT_NAMES[seat];
}

export function ConnectionIcon({ status }: { status: string }) {
  return status === "open" ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-red-400" />;
}

export { Crown, isJoker };
