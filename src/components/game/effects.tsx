"use client";
import { AnimatePresence, motion } from "motion/react";
import type { Face } from "@/engine";
import { cn } from "@/lib/utils";
import { useFx, type Flight } from "./fx";
import { Tile, TileBack } from "./tile";

/** Uçan taşlar: ekranın üstünde sabit konumlu katman. */
export function FlightLayer({ okey }: { okey: Face }) {
  const flights = useFx((s) => s.flights);
  return (
    <div className="pointer-events-none fixed inset-0 z-40" aria-hidden>
      {flights.map((f) => (
        <FlyingTile key={f.id} f={f} okey={okey} />
      ))}
    </div>
  );
}

function FlyingTile({ f, okey }: { f: Flight; okey: Face }) {
  const done = useFx((s) => s.done);
  const dx = f.to.x - f.from.x;
  const dy = f.to.y - f.from.y;
  // Hafif yay çizen yörünge (yukarı kalkıp iner) + eğilme
  const lift = Math.min(80, Math.hypot(dx, dy) * 0.25);
  return (
    <motion.div
      className="absolute left-0 top-0"
      style={{ width: f.from.w, height: f.from.h, perspective: 600, fontSize: Math.max(f.from.h, f.to.h) * 0.42 }}
      initial={{ x: f.from.x, y: f.from.y, scale: 1, rotate: 0 }}
      animate={{
        x: [f.from.x, f.from.x + dx * 0.5, f.to.x],
        y: [f.from.y, f.from.y + dy * 0.5 - lift, f.to.y],
        width: [f.from.w, (f.from.w + f.to.w) / 2 * 1.15, f.to.w],
        height: [f.from.h, (f.from.h + f.to.h) / 2 * 1.15, f.to.h],
        rotate: [0, dx > 0 ? 8 : -8, 0],
      }}
      transition={{ duration: f.duration, ease: [0.3, 0.7, 0.4, 1] }}
      onAnimationComplete={() => done(f.id)}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        initial={{ rotateY: f.flip ? 180 : 0 }}
        animate={{ rotateY: 0 }}
        transition={{ duration: f.duration * 0.8, delay: f.duration * 0.15 }}
      >
        <div className="absolute inset-0 drop-shadow-[0_10px_12px_rgba(0,0,0,0.5)]" style={{ backfaceVisibility: "hidden" }}>
          {f.tile ? <Tile tile={f.tile} okey={okey} size="fill" layout={false} /> : <TileBack className="h-full w-full" />}
        </div>
        {f.flip && (
          <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <TileBack className="h-full w-full" />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/** Masa ortasında beliren kısa açıklama ("Ahmet ortadan çekti"). */
export function TableCaption() {
  const caption = useFx((s) => s.caption);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[47%] z-30 flex justify-center" aria-live="polite">
      <AnimatePresence>
        {caption && (
          <motion.div
            key={caption.id}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-extrabold shadow-xl backdrop-blur-sm",
              caption.tone === "good" && "border-emerald-300/50 bg-emerald-900/80 text-emerald-100",
              caption.tone === "warn" && "border-amber-300/50 bg-black/70 text-amber-100",
              caption.tone === "info" && "border-white/15 bg-black/65 text-white",
            )}
          >
            {caption.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
