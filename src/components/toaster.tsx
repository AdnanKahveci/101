"use client";
import { AnimatePresence, motion } from "motion/react";
import { useToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            role="status"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            onClick={() => dismiss(t.id)}
            className={cn(
              "pointer-events-auto max-w-md rounded-xl px-4 py-2 text-sm font-semibold shadow-lg",
              t.kind === "error" && "bg-red-600 text-white",
              t.kind === "success" && "bg-emerald-600 text-white",
              t.kind === "info" && "bg-felt-700 text-white",
            )}
          >
            {t.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
