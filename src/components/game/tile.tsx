"use client";
import { motion } from "motion/react";
import { forwardRef } from "react";
import { COLOR_LABELS, isJoker, type Face, type Tile as TileT } from "@/engine";
import { cn } from "@/lib/utils";

const COLOR_CLASS: Record<string, string> = {
  red: "text-tile-red",
  yellow: "text-tile-yellow",
  blue: "text-tile-blue",
  black: "text-tile-black",
};

export type TileSize = "xs" | "sm" | "md" | "rack" | "fill";

const SIZE: Record<TileSize, string> = {
  xs: "w-6 h-8 text-sm rounded",
  sm: "w-8 h-11 text-lg rounded-md",
  md: "w-10 h-14 text-2xl rounded-md",
  rack: "w-[var(--tile-w)] h-[var(--tile-h)] text-[length:var(--tile-font)] rounded-md",
  fill: "w-full h-full rounded-md",
};

/** Taşın arka yüzü (deste, rakip ıstakaları, uçan ters taşlar). */
export function TileBack({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("tile-back rounded-md", className)} style={style} aria-hidden />;
}

export interface TileProps {
  tile: TileT;
  okey?: Face;
  size?: TileSize;
  selected?: boolean;
  highlight?: "joker" | "meld" | "pair" | "target" | "fresh" | "taken" | null;
  /** Animasyon sırasında gizle (yerini korur) */
  hidden?: boolean;
  showJokerMark?: boolean;
  /** Okey olarak bir değeri temsil ediyorsa (perde) */
  represents?: { color: string; value: number } | null;
  layout?: boolean;
  onClick?: () => void;
  className?: string;
  faceDown?: boolean;
}

export const Tile = forwardRef<HTMLDivElement, TileProps & React.HTMLAttributes<HTMLDivElement>>(function Tile(
  { tile, okey, size = "md", selected, highlight, showJokerMark, represents, layout = true, onClick, className, faceDown, hidden, ...rest },
  ref,
) {
  const joker = okey ? isJoker(tile, okey) : false;
  const label = tile.isFakeJoker ? "Sahte okey" : `${COLOR_LABELS[tile.color!]} ${tile.value}${joker ? " (okey)" : ""}`;
  return (
    <motion.div
      ref={ref}
      layoutId={layout ? `tile-${tile.id}` : undefined}
      layout={layout ? "position" : undefined}
      transition={{ type: "spring", stiffness: 500, damping: 38 }}
      role={onClick || selected !== undefined ? "button" : "img"}
      aria-label={label}
      aria-pressed={onClick || selected !== undefined ? !!selected : undefined}
      data-tile-id={tile.id}
      onClick={onClick}
      className={cn(
        "relative flex shrink-0 select-none flex-col items-center justify-start pt-[6%] font-black leading-none",
        faceDown ? "tile-back" : "tile-face",
        SIZE[size],
        selected && "-translate-y-2 ring-2 ring-gold",
        highlight === "meld" && "outline outline-2 outline-emerald-400/80",
        highlight === "pair" && "outline outline-2 outline-sky-400/80",
        highlight === "target" && "ring-2 ring-emerald-400",
        highlight === "joker" && "shadow-[0_0_10px_2px_rgba(242,193,78,0.8)]",
        highlight === "fresh" && "fresh-glow",
        highlight === "taken" && "taken-glow",
        hidden && "opacity-0",
        onClick && "cursor-pointer",
        className,
      )}
      {...(rest as object)}
    >
      {!faceDown &&
        (tile.isFakeJoker ? (
          <span className="mt-[18%] text-tile-black" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-[1em] w-[1em]" fill="currentColor">
              <path d="M12 2l2.6 6.6L21.5 9l-5.3 4.4L18 20.5 12 16.7 6 20.5l1.8-7.1L2.5 9l6.9-.4z" />
            </svg>
          </span>
        ) : (
          <>
            <span className={COLOR_CLASS[tile.color!]}>{tile.value}</span>
            <span className={cn("mt-[10%] h-[0.32em] w-[0.32em] rounded-full", `bg-current ${COLOR_CLASS[tile.color!]}`)} aria-hidden />
          </>
        ))}
      {!faceDown && joker && showJokerMark && (
        <span className="absolute -right-1 -top-1 rounded-full bg-gold px-1 text-[9px] font-black text-felt-950">OK</span>
      )}
      {!faceDown && highlight === "taken" && (
        <span className="absolute -left-1 -top-1 rounded-full bg-amber-400 px-1 text-[8px] font-black text-felt-950">YAN</span>
      )}
      {represents && (
        <span className={cn("absolute bottom-0.5 text-[9px] font-black", COLOR_CLASS[represents.color])}>={represents.value === 14 ? 1 : represents.value}</span>
      )}
    </motion.div>
  );
});
