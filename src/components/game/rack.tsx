"use client";
import { useRef, useState } from "react";
import type { Face, Tile as TileT, TileId } from "@/engine";
import { cn } from "@/lib/utils";
import { RACK_COLS, RACK_SLOTS, useGame } from "./store";
import { Tile } from "./tile";
import { useFx } from "./fx";
import { play } from "@/lib/sound";

export interface DropTarget {
  kind: "slot" | "discard" | "meld";
  slot?: number;
  meldId?: string;
}

/**
 * Çift katlı ıstaka. Fare ve dokunmatik için Pointer Events ile sürükle-bırak:
 * - Istaka yuvasına bırak → taşın yeri değişir (dolu yuvada yer değiştirir)
 * - Atma alanına bırak → taş atma
 * - Masadaki bir pere bırak → taş işleme
 * Kısa dokunuş (sürüklemeden) taşı seçer.
 */
export function Rack({
  tiles,
  okey,
  highlights,
  showJokerMark,
  onDropOutside,
}: {
  tiles: TileT[];
  okey: Face;
  highlights: Record<TileId, "joker" | "meld" | "pair" | "fresh" | "taken" | null>;
  showJokerMark: boolean;
  onDropOutside: (tileId: TileId, target: DropTarget) => void;
}) {
  const { slots, selected, toggleSelect, moveTile } = useGame();
  const hidden = useFx((s) => s.hidden);
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const [drag, setDrag] = useState<{ id: TileId; x: number; y: number; hover: number | null } | null>(null);
  const start = useRef<{ id: TileId; x: number; y: number; moved: boolean; pointerId: number } | null>(null);

  const targetAt = (x: number, y: number): DropTarget | null => {
    const els = document.elementsFromPoint(x, y) as HTMLElement[];
    for (const el of els) {
      const slot = el.closest<HTMLElement>("[data-slot]");
      if (slot) return { kind: "slot", slot: Number(slot.dataset.slot) };
      const meld = el.closest<HTMLElement>("[data-meld-id]");
      if (meld) return { kind: "meld", meldId: meld.dataset.meldId };
      const discard = el.closest<HTMLElement>("[data-drop='discard']");
      if (discard) return { kind: "discard" };
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent, id: TileId) => {
    if (e.button !== 0) return;
    start.current = { id, x: e.clientX, y: e.clientY, moved: false, pointerId: e.pointerId };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* bazı tarayıcılarda/sentetik olaylarda yakalama desteklenmez */
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.pointerId !== e.pointerId) return;
    if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
    s.moved = true;
    const t = targetAt(e.clientX, e.clientY);
    setDrag({ id: s.id, x: e.clientX, y: e.clientY, hover: t?.kind === "slot" ? t.slot! : null });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s || s.pointerId !== e.pointerId) return;
    if (!s.moved) {
      play("select");
      toggleSelect(s.id);
      return;
    }
    const t = targetAt(e.clientX, e.clientY);
    if (!t) return;
    if (t.kind === "slot") {
      play("tile");
      moveTile(s.id, t.slot!);
    }
    else onDropOutside(s.id, t);
  };

  const dragTile = drag ? byId.get(drag.id) : null;

  return (
    <div
      className="rack-stand no-select relative mx-auto w-full max-w-[1100px] rounded-t-2xl px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-2 sm:px-4 [--tile-font:clamp(14px,3.6vw,26px)] [--tile-h:calc(var(--tile-w)*1.38)] [--tile-w:min(calc((100vw-40px)/15),56px)]"
      aria-label="Istaka"
    >
      {[0, 1].map((row) => (
        <div key={row} className="rack-shelf flex justify-center gap-[2px] pb-[7px] pt-1">
          {Array.from({ length: RACK_COLS }, (_, c) => {
            const idx = row * RACK_COLS + c;
            const id = slots[idx];
            const tile = id ? byId.get(id) : undefined;
            return (
              <div
                key={idx}
                data-slot={idx}
                className={cn(
                  "flex h-[var(--tile-h)] w-[var(--tile-w)] items-end justify-center rounded-md",
                  drag?.hover === idx && "bg-gold/30",
                  !tile && "bg-black/[0.07]",
                )}
              >
                {tile && (
                  <Tile
                    tile={tile}
                    okey={okey}
                    size="rack"
                    selected={selected.includes(tile.id)}
                    highlight={highlights[tile.id] ?? null}
                    showJokerMark={showJokerMark}
                    hidden={hidden.includes(tile.id)}
                    className={cn(drag?.id === tile.id && "opacity-30")}
                    onPointerDown={(e: React.PointerEvent) => onPointerDown(e, tile.id)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => {
                      start.current = null;
                      setDrag(null);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
      {drag && dragTile && (
        <div className="pointer-events-none fixed z-50" style={{ left: drag.x, top: drag.y, transform: "translate(-50%,-60%) rotate(-4deg)" }}>
          <Tile tile={dragTile} okey={okey} size="md" layout={false} className="shadow-2xl" />
        </div>
      )}
      <span className="sr-only">{RACK_SLOTS} yuvalı çift katlı ıstaka</span>
    </div>
  );
}
