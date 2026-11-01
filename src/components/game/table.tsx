"use client";
import { motion } from "motion/react";
import { Crown, Wifi, WifiOff } from "lucide-react";
import { COLOR_LABELS, isJoker, type Face, type Seat, type TableMeld, type TablePair, type Tile as TileT } from "@/engine";
import type { ClientGameView } from "@/server/game-service";
import { AVATAR_EMOJI, cn, SEAT_NAMES } from "@/lib/utils";
import { realtime } from "@/lib/realtime";
import { useEffect, useRef, useState } from "react";
import { Tile, TileBack } from "./tile";
import { useFx } from "./fx";

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
  const teamColor = p.team === null ? "" : p.team === 0 ? "border-gold/80" : "border-sky-400/80";
  const penalty = view.hand.penalties.filter((x) => x.seat === seat).reduce((n, x) => n + x.amount, 0);
  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-2xl border bg-black/55 px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm",
        teamColor || "border-white/10",
        isTurn && "turn-pulse border-gold/80",
        position === "left" || position === "right" ? "w-[84px] flex-col px-1.5 sm:w-[96px]" : "",
      )}
      data-testid={`seat-${seat}`}
      data-anchor={`seat-${seat}`}
    >
      <div className="relative">
        <svg className="absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] -rotate-90" viewBox="0 0 36 36" aria-hidden>
          {isTurn && total > 0 && <circle cx="18" cy="18" r="16" fill="none" stroke={pct < 0.25 ? "#ef4444" : "#f2c14e"} strokeWidth="3" strokeDasharray={`${pct * 100.5} 100.5`} />}
        </svg>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-b from-wood-600 to-wood-900 text-xl shadow-inner sm:h-10 sm:w-10">{AVATAR_EMOJI[view.avatars[seat]] ?? "🙂"}</span>
        <span
          className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-black", online ? "bg-emerald-400" : "bg-red-500")}
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
          {penalty > 0 && (
            <span className="rounded bg-red-600/80 px-1 text-white" title={view.hand.penalties.filter((x) => x.seat === seat).map((x) => `+${x.amount} ${x.reason}`).join(" · ")}>
              +{penalty} ceza
            </span>
          )}
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

/** Rakibin ahşap ıstakası (taşların arkası görünür). */
export function OpponentRail({ count, orientation }: { count: number; orientation: "horizontal" | "vertical" }) {
  const n = Math.min(count, 22);
  const vertical = orientation === "vertical";
  return (
    <div
      className={cn(
        "rail-wood flex items-center justify-center rounded-md p-[3px]",
        vertical ? "w-5 flex-col gap-[1px] py-1.5 sm:w-6" : "h-5 gap-[1px] px-1.5 sm:h-6",
      )}
      aria-label={`${count} taş`}
    >
      {Array.from({ length: n }, (_, i) => (
        <TileBack key={i} className={vertical ? "h-[6px] w-full rounded-[2px] sm:h-[8px]" : "h-full w-[6px] rounded-[2px] sm:w-[8px]"} />
      ))}
    </div>
  );
}

/** Taşı yığından/desteden sürükleyip ıstakaya bırakma (dokunmatik + fare). Kısa dokunuş = varsayılan yere al. */
function usePileDrag(enabled: boolean, onTake: (slot: number | null) => void) {
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);
  const slotAt = (x: number, y: number) => {
    for (const el of document.elementsFromPoint(x, y) as HTMLElement[]) {
      const slot = el.closest<HTMLElement>("[data-slot]");
      if (slot) return Number(slot.dataset.slot);
      if (el.closest("[aria-label='Istaka']")) return -1; // ıstakanın üstü ama yuva değil → varsayılan yer
    }
    return null;
  };
  const highlight = (slot: number | null) => {
    document.querySelectorAll("[data-slot].slot-hover").forEach((e) => e.classList.remove("slot-hover"));
    if (slot !== null && slot >= 0) document.querySelector(`[data-slot="${slot}"]`)?.classList.add("slot-hover");
  };
  const handlers = enabled
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {}
        },
        onPointerMove: (e: React.PointerEvent) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
          s.moved = true;
          setGhost({ x: e.clientX, y: e.clientY });
          highlight(slotAt(e.clientX, e.clientY));
        },
        onPointerUp: (e: React.PointerEvent) => {
          const s = start.current;
          start.current = null;
          setGhost(null);
          highlight(null);
          if (!s || s.id !== e.pointerId) return;
          if (!s.moved) return onTake(null);
          const slot = slotAt(e.clientX, e.clientY);
          if (slot !== null) onTake(slot >= 0 ? slot : null);
        },
        onPointerCancel: () => {
          start.current = null;
          setGhost(null);
          highlight(null);
        },
      }
    : {};
  return { ghost, handlers };
}

export function DiscardPile({
  seat,
  tiles,
  okey,
  takeable,
  onTake,
  label,
  dropTarget,
  hint,
}: {
  seat: Seat;
  tiles: TileT[];
  okey: Face;
  takeable?: boolean;
  onTake?: (slot: number | null) => void;
  label: string;
  dropTarget?: boolean;
  hint?: string;
}) {
  const hidden = useFx((s) => s.hidden);
  const stack = tiles.slice(-3);
  const top = tiles[tiles.length - 1];
  const { ghost, handlers } = usePileDrag(!!takeable && !!onTake, (slot) => onTake?.(slot));
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={cn(
          "relative flex h-[64px] w-[50px] items-center justify-center rounded-lg border-2 border-dashed sm:h-[78px] sm:w-[60px]",
          dropTarget ? "border-gold/60 bg-black/15" : "border-white/10 bg-black/10",
          takeable && "take-glow border-solid border-amber-300",
        )}
        data-drop={dropTarget ? "discard" : undefined}
        data-anchor={`discard-${seat}`}
        aria-label={label}
        title={label}
      >
        {stack.map((t, i) => {
          const isTop = t.id === top.id;
          const off = (stack.length - 1 - i) * -2;
          return (
            <div
              key={t.id}
              className={cn("absolute", isTop && takeable && "no-select cursor-grab active:cursor-grabbing")}
              style={{ transform: `translate(${off}px, ${off}px) rotate(${((t.id.charCodeAt(1) % 5) - 2) * 1.5}deg)` }}
              {...(isTop ? handlers : {})}
            >
              <Tile tile={t} okey={okey} size="sm" layout={false} hidden={hidden.includes(t.id) || (isTop && !!ghost)} />
            </div>
          );
        })}
        {!top && <span className="text-center text-[9px] font-bold leading-tight text-white/35">{dropTarget ? "Buraya at" : ""}</span>}
        {tiles.length > 1 && <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-black/70 px-1 text-[9px] font-bold text-white/70">{tiles.length}</span>}
      </div>
      {hint && <span className="text-[9px] font-bold text-amber-200/90">{hint}</span>}
      {ghost && top && (
        <div className="pointer-events-none fixed z-50" style={{ left: ghost.x, top: ghost.y, transform: "translate(-50%,-60%) rotate(-4deg)" }}>
          <Tile tile={top} okey={okey} size="md" layout={false} className="shadow-2xl" />
        </div>
      )}
    </div>
  );
}

export function CenterPile({
  view,
  canDraw,
  onDraw,
  canTakeIndicator = false,
  onTakeIndicator,
}: {
  view: ClientGameView;
  canDraw: boolean;
  onDraw: (slot: number | null) => void;
  canTakeIndicator?: boolean;
  onTakeIndicator?: (slot: number | null) => void;
}) {
  const { ghost, handlers } = usePileDrag(canDraw, onDraw);
  const ind = usePileDrag(canTakeIndicator, (slot) => onTakeIndicator?.(slot));
  const indTaken = view.hand.indicatorTakenBy !== null;
  const layers = Math.min(4, Math.ceil(view.hand.drawPileCount / 12));
  return (
    <div className="flex items-center gap-3 sm:gap-5">
      <div className="flex flex-col items-center">
        <div
          role="button"
          tabIndex={canDraw ? 0 : -1}
          aria-disabled={!canDraw}
          onKeyDown={(e) => canDraw && (e.key === "Enter" || e.key === " ") && onDraw(null)}
          aria-label={`Desteden taş çek (${view.hand.drawPileCount} taş)`}
          data-anchor="deck"
          className={cn("no-select relative h-14 w-10 sm:h-[70px] sm:w-[50px]", canDraw ? "cursor-grab active:cursor-grabbing" : "opacity-90")}
          {...handlers}
        >
          {Array.from({ length: layers }, (_, i) => (
            <TileBack key={i} className="absolute inset-0 shadow-md" style={{ transform: `translate(${(layers - i) * 2}px, ${(layers - i) * 2}px)` }} />
          ))}
          <TileBack className={cn("absolute inset-0 shadow-lg transition", canDraw && "draw-glow", ghost && "-translate-y-1 opacity-60")} />
          <span className="absolute inset-x-0 bottom-1 text-center text-[11px] font-black text-wood-900/80">{view.hand.drawPileCount}</span>
        </div>
        <span className={cn("mt-1 text-[10px] font-bold", canDraw ? "text-amber-200" : "text-white/60")}>{canDraw ? "Çek / sürükle" : "Deste"}</span>
      </div>
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "no-select rotate-[-6deg] rounded-md",
            canTakeIndicator && "take-glow cursor-grab active:cursor-grabbing",
            (indTaken || ind.ghost) && "opacity-35",
          )}
          data-anchor="indicator"
          title={canTakeIndicator ? "Göstergenin eşi elinizde: sürükleyip ıstakaya alın ve eşiyle çift açın" : undefined}
          {...ind.handlers}
        >
          <Tile tile={view.hand.indicator} size="sm" layout={false} data-tile-id={undefined} />
        </div>
        <span className={cn("mt-1 text-[10px] font-bold", canTakeIndicator ? "text-amber-200" : "text-white/70")}>
          {canTakeIndicator ? "Çift için al" : indTaken ? "Gösterge alındı" : "Gösterge"}
        </span>
      </div>
      <div className="flex flex-col items-center rounded-lg bg-black/25 px-2 py-1 text-center">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gold">Okey</span>
        <span className="text-sm font-black">
          {COLOR_LABELS[view.hand.okey.color]} {view.hand.okey.value}
        </span>
      </div>
      {ind.ghost && (
        <div className="pointer-events-none fixed z-50" style={{ left: ind.ghost.x, top: ind.ghost.y, transform: "translate(-50%,-60%) rotate(-4deg)" }}>
          <Tile tile={view.hand.indicator} size="md" layout={false} className="shadow-2xl" />
        </div>
      )}
      {ghost && (
        <div className="pointer-events-none fixed z-50 h-14 w-10" style={{ left: ghost.x, top: ghost.y, transform: "translate(-50%,-60%) rotate(-4deg)" }}>
          <TileBack className="h-full w-full shadow-2xl" />
        </div>
      )}
    </div>
  );
}

export function MeldView({
  meld,
  okey,
  ownerName,
  zones,
  onZone,
  compact,
}: {
  meld: TableMeld;
  okey: Face;
  ownerName: string;
  /** Masada çok taş varken taşlar küçülür (kaydırma çubuğu olmasın) */
  compact?: boolean;
  /** İşleme yapılabiliyorsa perin başında/sonunda bırakma kareleri göster (geçerlilik gösterilmez). */
  zones?: boolean;
  onZone?: (side: "start" | "end") => void;
}) {
  const recent = useFx((s) => s.recent);
  const zone = (side: "start" | "end") => (
    <button
      type="button"
      data-meld-id={meld.id}
      data-meld-side={side}
      onClick={onZone ? () => onZone(side) : undefined}
      aria-label={`${ownerName} ${meld.kind === "run" ? "serisinin" : "grubunun"} ${side === "start" ? "başına" : "sonuna"} işle`}
      title={side === "start" ? "Başına işle" : "Sonuna işle"}
      className={cn(compact && "meld-zone-sm", "meld-zone grid shrink-0 place-items-center rounded-md border-2 border-dashed border-white/25 text-base font-black text-white/40")}
    >
      +
    </button>
  );
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      data-meld-id={meld.id}
      title={`${ownerName} – ${meld.kind === "run" ? "seri" : "grup"}`}
      className="meld-box flex shrink-0 items-center gap-[2px] rounded-lg border border-white/15 bg-black/30 p-1 shadow-[0_3px_8px_rgba(0,0,0,0.35)]"
    >
      {zones && meld.kind === "run" && zone("start")}
      {meld.cells.map((c) => {
        const tile: TileT = c.tileId.startsWith("f-")
          ? { id: c.tileId, color: null, value: null, copyIndex: 0, isFakeJoker: true }
          : parseTile(c.tileId);
        return (
          <Tile
            key={c.tileId}
            tile={tile}
            okey={okey}
            size={compact ? "xs" : "meld"}
            layout={false}
            highlight={recent.includes(c.tileId) ? "fresh" : null}
            represents={c.isJoker ? { color: c.color, value: c.value } : null}
          />
        );
      })}
      {zones && zone("end")}
    </motion.div>
  );
}

export function PairView({ pair, okey, compact }: { pair: TablePair; okey: Face; compact?: boolean }) {
  const recent = useFx((s) => s.recent);
  return (
    <div className="flex shrink-0 gap-[2px] rounded-lg border border-sky-300/20 bg-sky-950/40 p-1 shadow-[0_3px_8px_rgba(0,0,0,0.35)]">
      {pair.tileIds.map((id) => (
        <Tile key={id} tile={parseTile(id)} okey={okey} size={compact ? "xs" : "meld"} layout={false} highlight={recent.includes(id) ? "fresh" : null} />
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
