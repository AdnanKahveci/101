"use client";
/** Masa çuhası renk teması (turkuaz, klasik yeşil, lacivert, bordo). Tarayıcıda hatırlanır. */
import { useEffect } from "react";
import { create } from "zustand";
import { Palette } from "lucide-react";

export const FELT_THEMES = [
  { id: "turkuaz", name: "Turkuaz çuha", swatch: "#2f9ea0" },
  { id: "yesil", name: "Klasik yeşil", swatch: "#1d5a3c" },
  { id: "lacivert", name: "Lacivert", swatch: "#1f3f78" },
  { id: "bordo", name: "Bordo", swatch: "#7a2232" },
] as const;
export type FeltTheme = (typeof FELT_THEMES)[number]["id"];

interface FeltState {
  theme: FeltTheme;
  init: () => void;
  cycle: () => void;
}

export const useFelt = create<FeltState>((set, get) => ({
  theme: "turkuaz",
  init: () => {
    try {
      const v = localStorage.getItem("okey:felt");
      if (v && FELT_THEMES.some((t) => t.id === v)) set({ theme: v as FeltTheme });
    } catch {}
  },
  cycle: () => {
    const i = FELT_THEMES.findIndex((t) => t.id === get().theme);
    const theme = FELT_THEMES[(i + 1) % FELT_THEMES.length].id;
    try {
      localStorage.setItem("okey:felt", theme);
    } catch {}
    set({ theme });
  },
}));

export function FeltButton() {
  const { theme, init, cycle } = useFelt();
  useEffect(() => init(), [init]);
  const cur = FELT_THEMES.find((t) => t.id === theme)!;
  return (
    <button
      className="flex items-center gap-1 rounded-lg p-1.5 text-white/70 hover:bg-white/10"
      aria-label={`Masa rengi: ${cur.name}. Değiştir`}
      title={`Masa rengi: ${cur.name}`}
      data-testid="felt-toggle"
      onClick={cycle}
    >
      <Palette className="h-4 w-4" />
      <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white/40" style={{ background: cur.swatch }} aria-hidden />
    </button>
  );
}
