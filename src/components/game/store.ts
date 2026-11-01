"use client";
import { create } from "zustand";
import type { GameAction, MeldSpec, Seat, TileId } from "@/engine";
import type { ClientGameView } from "@/server/game-service";
import { realtime } from "@/lib/realtime";
import { newCommandId } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { play } from "@/lib/sound";
import { animateTransition } from "./fx";

/** Istaka sütun sayısı: geniş ekranda ıstaka boydan boya 20 yuva, dar ekranda (telefon dikey) 15. Oturum boyunca sabit. */
export const RACK_COLS = typeof window !== "undefined" && window.innerWidth < 640 ? 15 : 20;
export const RACK_SLOTS = RACK_COLS * 2;

type Slots = (TileId | null)[];

interface GameStore {
  view: ClientGameView | null;
  slots: Slots;
  selected: TileId[];
  stagedMelds: MeldSpec[];
  stagedPairs: [TileId, TileId][];
  busy: boolean;
  /** Ters çevrilmiş (kapalı) taşlar – ör. okeyi gizlemek için basılı tutup çevirme */
  flipped: TileId[];
  toggleFlip: (id: TileId) => void;
  presence: Record<number, boolean>;
  /** Oyuncu çektiği/aldığı taşı sürükleyip belirli bir yuvaya bıraktıysa o yuva */
  pendingSlot: number | null;
  setPendingSlot: (slot: number | null) => void;
  setView: (v: ClientGameView) => void;
  setPresence: (p: Record<number, boolean>) => void;
  toggleSelect: (id: TileId) => void;
  clearSelection: () => void;
  moveTile: (id: TileId, toSlot: number) => void;
  arrange: (ids: (TileId | null)[]) => void;
  stageMeld: () => void;
  stagePair: () => void;
  unstageMeld: (i: number) => void;
  unstagePair: (i: number) => void;
  setStagedMelds: (m: MeldSpec[]) => void;
  setStagedPairs: (p: [TileId, TileId][]) => void;
  clearStaging: () => void;
  send: (action: GameAction) => Promise<boolean>;
  reset: () => void;
}

const storageKey = (v: ClientGameView) => `okey:rack:${v.matchId}:${v.hand.handNumber}`;

function loadSlots(v: ClientGameView): Slots | null {
  try {
    const raw = localStorage.getItem(storageKey(v));
    const arr = raw ? (JSON.parse(raw) as Slots) : null;
    return Array.isArray(arr) && arr.length === RACK_SLOTS ? arr : null;
  } catch {
    return null;
  }
}

function saveSlots(v: ClientGameView | null, slots: Slots) {
  if (!v) return;
  try {
    localStorage.setItem(storageKey(v), JSON.stringify(slots));
  } catch {}
}

function loadFlipped(v: ClientGameView): TileId[] {
  try {
    const arr = JSON.parse(localStorage.getItem(`${storageKey(v)}:flip`) ?? "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveFlipped(v: ClientGameView | null, ids: TileId[]) {
  if (!v) return;
  try {
    localStorage.setItem(`${storageKey(v)}:flip`, JSON.stringify(ids));
  } catch {}
}

/** Dolu yuvaya bırakılan taşı araya sokar: aynı sıradaki taşlar boşluğa doğru bir kayar (yer değiştirme yok). */
export function insertAt(prev: Slots, id: TileId, toSlot: number, cols = RACK_COLS): Slots {
  const slots = prev.slice();
  const from = slots.indexOf(id);
  if (from < 0 || toSlot < 0 || toSlot >= slots.length || from === toSlot) return prev;
  if (!slots[toSlot]) {
    slots[from] = null;
    slots[toSlot] = id;
    return slots;
  }
  slots[from] = null;
  const rowStart = Math.floor(toSlot / cols) * cols;
  const rowEnd = rowStart + cols - 1;
  const gapRight = () => {
    for (let i = toSlot + 1; i <= rowEnd; i++) if (!slots[i]) return i;
    return -1;
  };
  const gapLeft = () => {
    for (let i = toSlot - 1; i >= rowStart; i--) if (!slots[i]) return i;
    return -1;
  };
  // Aynı sırada soldan sağa sürüklenince taş hedefin sağına geçer (boşalan yer sola doğru kapanır)
  const preferLeft = from >= rowStart && from < toSlot;
  let gap = preferLeft ? gapLeft() : gapRight();
  let dir: "left" | "right" = preferLeft ? "left" : "right";
  if (gap < 0) {
    gap = preferLeft ? gapRight() : gapLeft();
    dir = preferLeft ? "right" : "left";
  }
  if (gap < 0) {
    // Sıra tamamen dolu: yer değiştir
    slots[from] = slots[toSlot];
    slots[toSlot] = id;
    return slots;
  }
  if (dir === "right") for (let i = gap; i > toSlot; i--) slots[i] = slots[i - 1];
  else for (let i = gap; i < toSlot; i++) slots[i] = slots[i + 1];
  slots[toSlot] = id;
  return slots;
}

/** Oyuncunun özel ıstaka dizilimini korur: gelen taşlar boş yuvalara, giden taşlar kaldırılır. */
function reconcile(prev: Slots, hand: TileId[], drawn: TileId | null, preferred: number | null = null): Slots {
  const set = new Set(hand);
  const slots = prev.map((id) => (id && set.has(id) ? id : null));
  const placed = new Set(slots.filter(Boolean) as TileId[]);
  const missing = hand.filter((id) => !placed.has(id));
  for (const id of missing) {
    // Çekilen taş: son dolu yuvanın hemen sağına; diğerleri ilk boş yuvaya.
    let idx = -1;
    if ((id === drawn || missing.length === 1) && preferred !== null && preferred >= 0 && preferred < RACK_SLOTS) {
      if (!slots[preferred]) idx = preferred;
      else {
        // Dolu yuvaya bırakıldı: aynı sıradaki taşları sağa (yoksa sola) kaydırarak yer aç.
        const rowStart = Math.floor(preferred / RACK_COLS) * RACK_COLS;
        const rowEnd = rowStart + RACK_COLS - 1;
        let gap = -1;
        for (let i = preferred + 1; i <= rowEnd; i++) if (!slots[i]) { gap = i; break; }
        if (gap >= 0) {
          for (let i = gap; i > preferred; i--) slots[i] = slots[i - 1];
          idx = preferred;
        } else {
          for (let i = preferred - 1; i >= rowStart; i--) if (!slots[i]) { gap = i; break; }
          if (gap >= 0) {
            for (let i = gap; i < preferred; i++) slots[i] = slots[i + 1];
            idx = preferred;
          }
        }
      }
    }
    if (idx < 0 && id === drawn) {
      const last = slots.reduce((acc, s, i) => (s ? i : acc), -1);
      for (let i = last + 1; i < RACK_SLOTS; i++) if (!slots[i]) { idx = i; break; }
    }
    if (idx < 0) idx = slots.findIndex((s) => !s);
    if (idx < 0) break;
    slots[idx] = id;
  }
  return slots;
}

export const useGame = create<GameStore>((set, get) => ({
  view: null,
  slots: Array(RACK_SLOTS).fill(null),
  selected: [],
  stagedMelds: [],
  stagedPairs: [],
  busy: false,
  flipped: [],
  toggleFlip: (id) => {
    const f = get().flipped;
    const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    set({ flipped: next });
    saveFlipped(get().view, next);
  },
  presence: {},
  pendingSlot: null,
  setPendingSlot: (slot) => set({ pendingSlot: slot }),

  setView: (v) => {
    const prev = get().view;
    if (prev && prev.matchId === v.matchId && v.version < prev.version) return; // eski görünüm
    const newHand = !prev || prev.matchId !== v.matchId || prev.hand.handNumber !== v.hand.handNumber;
    const base = newHand ? loadSlots(v) ?? Array(RACK_SLOTS).fill(null) : get().slots;
    const hand = v.myHand.map((t) => t.id);
    const pendingSlot = get().pendingSlot;
    const baseSet = new Set(base.filter(Boolean) as TileId[]);
    const arrived = !newHand && v.myHand.some((t) => !baseSet.has(t.id));
    const slots = reconcile(base, hand, v.hand.myDrawnTileId, pendingSlot);
    const inHand = new Set(hand);
    const prune = (ids: TileId[]) => ids.every((id) => inHand.has(id));
    if (prev) animateTransition(prev, v, { skipDrawFlight: pendingSlot !== null });
    const consumed = pendingSlot !== null && arrived;
    set({
      pendingSlot: consumed ? null : pendingSlot,
      view: v,
      slots,
      presence: v.presence,
      flipped: (newHand ? loadFlipped(v) : get().flipped).filter((id) => inHand.has(id)),
      selected: get().selected.filter((id) => inHand.has(id)),
      stagedMelds: newHand ? [] : get().stagedMelds.filter((m) => prune(m.tileIds)),
      stagedPairs: newHand ? [] : get().stagedPairs.filter((p) => prune(p)),
    });
    saveSlots(v, slots);
  },
  setPresence: (p) => set({ presence: p }),
  toggleSelect: (id) => {
    const s = get().selected;
    set({ selected: s.includes(id) ? s.filter((x) => x !== id) : [...s, id] });
  },
  clearSelection: () => set({ selected: [] }),
  moveTile: (id, toSlot) => {
    const slots = insertAt(get().slots, id, toSlot);
    if (slots === get().slots) return;
    set({ slots });
    saveSlots(get().view, slots);
  },
  arrange: (ids) => {
    // Sıralı taşları iki sıraya yerleştirir; renk/sayı grupları arasında boşluk bırakır.
    const slots: Slots = Array(RACK_SLOTS).fill(null);
    ids.slice(0, RACK_SLOTS).forEach((id, i) => (slots[i] = id));
    set({ slots });
    saveSlots(get().view, slots);
  },
  stageMeld: () => {
    const { selected, stagedMelds } = get();
    if (selected.length < 3) {
      toast.error("Per için en az üç taş seçin.");
      return;
    }
    set({ stagedMelds: [...stagedMelds, { tileIds: orderBySlots(selected, get().slots) }], selected: [] });
  },
  stagePair: () => {
    const { selected, stagedPairs } = get();
    if (selected.length !== 2) {
      toast.error("Çift için tam iki taş seçin.");
      return;
    }
    set({ stagedPairs: [...stagedPairs, [selected[0], selected[1]]], selected: [] });
  },
  unstageMeld: (i) => set({ stagedMelds: get().stagedMelds.filter((_, j) => j !== i) }),
  unstagePair: (i) => set({ stagedPairs: get().stagedPairs.filter((_, j) => j !== i) }),
  setStagedMelds: (m) => set({ stagedMelds: m, selected: [] }),
  setStagedPairs: (p) => set({ stagedPairs: p, selected: [] }),
  clearStaging: () => set({ stagedMelds: [], stagedPairs: [], selected: [] }),

  send: async (action) => {
    const v = get().view;
    if (!v || get().busy) return false;
    set({ busy: true });
    try {
      const r = await realtime.command({ commandId: newCommandId(), matchId: v.matchId, expectedVersion: v.version, action });
      if (!r.ok) {
        set({ pendingSlot: null });
        play("error");
        toast.error(r.error);
        if (r.code === "STALE_VERSION" || r.code === "NETWORK") realtime.sync(v.matchId);
        return false;
      }
      if (realtime.status !== "open") {
        // WebSocket yokken HTTP ile gönderildi; görünümü HTTP ile tazele.
        const { api } = await import("@/lib/api");
        const res = await api<{ view: ClientGameView }>(`/api/matches/${v.matchId}`);
        get().setView(res.view);
      }
      return true;
    } finally {
      set({ busy: false });
    }
  },
  reset: () => set({ view: null, pendingSlot: null, flipped: [], slots: Array(RACK_SLOTS).fill(null), selected: [], stagedMelds: [], stagedPairs: [] }),
}));

export function orderBySlots(ids: TileId[], slots: Slots): TileId[] {
  return ids.slice().sort((a, b) => slots.indexOf(a) - slots.indexOf(b));
}

/** Görünümdeki koltukları ekran konumlarına çevirir (ben her zaman alttayım). */
export function relativePositions(mySeat: Seat | null) {
  const me = mySeat ?? 0;
  return {
    bottom: me as Seat,
    right: ((me + 1) % 4) as Seat,
    top: ((me + 2) % 4) as Seat,
    left: ((me + 3) % 4) as Seat,
  };
}
