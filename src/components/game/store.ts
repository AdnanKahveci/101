"use client";
import { create } from "zustand";
import type { GameAction, MeldSpec, Seat, TileId } from "@/engine";
import type { ClientGameView } from "@/server/game-service";
import { realtime } from "@/lib/realtime";
import { newCommandId } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { play } from "@/lib/sound";

export const RACK_COLS = 15;
export const RACK_SLOTS = RACK_COLS * 2;

type Slots = (TileId | null)[];

interface GameStore {
  view: ClientGameView | null;
  slots: Slots;
  selected: TileId[];
  stagedMelds: MeldSpec[];
  stagedPairs: [TileId, TileId][];
  busy: boolean;
  presence: Record<number, boolean>;
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

/** Oyuncunun özel ıstaka dizilimini korur: gelen taşlar boş yuvalara, giden taşlar kaldırılır. */
function reconcile(prev: Slots, hand: TileId[], drawn: TileId | null): Slots {
  const set = new Set(hand);
  const slots = prev.map((id) => (id && set.has(id) ? id : null));
  const placed = new Set(slots.filter(Boolean) as TileId[]);
  const missing = hand.filter((id) => !placed.has(id));
  for (const id of missing) {
    // Çekilen taş: son dolu yuvanın hemen sağına; diğerleri ilk boş yuvaya.
    let idx = -1;
    if (id === drawn) {
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
  presence: {},

  setView: (v) => {
    const prev = get().view;
    if (prev && prev.matchId === v.matchId && v.version < prev.version) return; // eski görünüm
    const newHand = !prev || prev.matchId !== v.matchId || prev.hand.handNumber !== v.hand.handNumber;
    const base = newHand ? loadSlots(v) ?? Array(RACK_SLOTS).fill(null) : get().slots;
    const hand = v.myHand.map((t) => t.id);
    const slots = reconcile(base, hand, v.hand.myDrawnTileId);
    const inHand = new Set(hand);
    const prune = (ids: TileId[]) => ids.every((id) => inHand.has(id));
    if (prev && v.hand.currentTurn !== prev.hand.currentTurn && v.hand.currentTurn === v.mySeat) play("turn");
    if (prev && prev.version !== v.version && v.phase === "playing") play("tile");
    set({
      view: v,
      slots,
      presence: v.presence,
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
    const slots = get().slots.slice();
    const from = slots.indexOf(id);
    if (from < 0 || toSlot < 0 || toSlot >= RACK_SLOTS || from === toSlot) return;
    const occupant = slots[toSlot];
    slots[toSlot] = id;
    slots[from] = occupant; // dolu yuvaya bırakılırsa yer değiştirir
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
  reset: () => set({ view: null, slots: Array(RACK_SLOTS).fill(null), selected: [], stagedMelds: [], stagedPairs: [] }),
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
