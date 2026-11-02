"use client";
/**
 * Eşe işaret: kendi rozetinin yanındaki düğmeden eşine (eşsiz masada istediğin oyuncuya) komik hareketler yaparsın.
 * "Gizli" seçilirse işareti yalnızca karşı taraf görür; ama rakiplerin yakalama ihtimali vardır.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GESTURES, GESTURE_CATCH_CHANCE, GESTURE_IDS, type GestureId } from "@/lib/chat-shared";
import type { ClientGameView } from "@/server/game-service";
import { cn } from "@/lib/utils";
import { sendGesture } from "./chat";

export function GestureButton({ view }: { view: ClientGameView }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState(false);
  const me = view.mySeat;
  const others = view.players.filter((p) => p.seat !== me);
  const partner = me !== null && view.rules.teamMode ? (me + 2) % 4 : null;
  const [target, setTarget] = useState<number | null>(partner ?? others[0]?.seat ?? null);
  const [cool, setCool] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  if (me === null || others.length === 0) return null;
  const targetName = others.find((p) => p.seat === target)?.displayName ?? "";

  const send = (g: GestureId) => {
    if (target === null || cool) return;
    if (sendGesture(view.matchId, g, target, secret)) {
      setOpen(false);
      setCool(true);
      setTimeout(() => setCool(false), 1500);
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        className={cn(
          "gesture-btn grid h-9 w-9 place-items-center rounded-full text-xl transition-transform hover:scale-110 active:scale-95",
          open && "ring-2 ring-gold",
        )}
        aria-label={partner !== null ? "Eşine işaret yap" : "İşaret yap"}
        aria-expanded={open}
        title={partner !== null ? "Eşine işaret yap" : "İşaret yap"}
        data-testid="gesture-toggle"
        onClick={() => setOpen(!open)}
      >
        😉
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="chat-panel absolute bottom-11 left-1/2 z-50 w-[272px] -translate-x-1/2 rounded-2xl p-2"
            role="dialog"
            aria-label="İşaret menüsü"
            data-testid="gesture-menu"
          >
            <div className="mb-1.5 flex items-center gap-1 text-[11px] text-white/70">
              <span className="font-black text-gold">{partner !== null ? "Eşine işaret" : "İşaret"}</span>
              <span className="ml-auto">Kime:</span>
              <select
                className="max-w-[110px] rounded bg-black/40 px-1 py-0.5 text-[11px] text-white outline-none"
                value={target ?? ""}
                onChange={(e) => setTarget(Number(e.target.value))}
                aria-label="İşaret kime"
                data-testid="gesture-target"
              >
                {others.map((p) => (
                  <option key={p.seat} value={p.seat}>
                    {p.displayName}
                    {p.seat === partner ? " (eşin)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {GESTURE_IDS.map((id) => (
                <button
                  key={id}
                  className="drink-btn flex flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 disabled:opacity-40"
                  title={GESTURES[id].label}
                  aria-label={`${targetName} için: ${GESTURES[id].label}`}
                  data-testid={`gesture-${id}`}
                  disabled={cool}
                  onClick={() => send(id)}
                >
                  <span className="text-xl">{GESTURES[id].emoji}</span>
                  <span className="line-clamp-2 text-center text-[9px] leading-tight text-white/70">{GESTURES[id].label}</span>
                </button>
              ))}
            </div>
            <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 rounded-lg bg-black/30 px-2 py-1 text-[11px] text-white/80">
              <input type="checkbox" className="accent-[#f2c14e]" checked={secret} onChange={(e) => setSecret(e.target.checked)} data-testid="gesture-secret" />
              <span>
                🤫 Gizli yap <span className="text-white/45">(yakalanma ihtimali %{Math.round(GESTURE_CATCH_CHANCE * 100)})</span>
              </span>
            </label>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
