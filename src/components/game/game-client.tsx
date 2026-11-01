"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGroup } from "motion/react";
import { ArrowDownUp, BookOpen, Lightbulb, ListOrdered, LogOut, Trash2, Trophy, Volume2, VolumeX, X } from "lucide-react";
import {
  addTileToMeld,
  calculateOpeningPoints,
  isJoker,
  meldsFromRack,
  pairsFromRack,
  prevSeat,
  replaceJokerInMeld,
  sortHand,
  suggestBestMelds,
  suggestPairs,
  tilesInPotentialMelds,
  tilesMap,
  validatePairs,
  type GameAction,
  type Seat,
  type TileId,
} from "@/engine";
import type { ClientGameView } from "@/server/game-service";
import { api } from "@/lib/api";
import { realtime, type ConnStatus } from "@/lib/realtime";
import { toast } from "@/lib/toast";
import { play, setSoundEnabled, soundEnabled } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageLoading } from "@/components/require-session";
import { RACK_COLS, relativePositions, useGame } from "./store";
import { Rack, type DropTarget } from "./rack";
import { CenterPile, ConnectionIcon, DiscardPile, MeldView, OpponentRail, PairView, PlayerBadge, seatName } from "./table";
import { FlightLayer, TableCaption } from "./effects";
import { ChatButton, ChatPanel, ChatTableLayer, useChat } from "./chat";
import { AmbientButton, AmbientPlayer } from "./ambient";
import type { ChatMessage } from "@/lib/chat-shared";
import { useFx } from "./fx";
import { HandResultDialog, MatchEndDialog, ScoreBoard } from "./panels";

function pref(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1" || v === "true";
  } catch {
    return fallback;
  }
}

export function GameClient({ matchId }: { matchId: string }) {
  const router = useRouter();
  const g = useGame();
  const { view, selected, stagedMelds, stagedPairs, busy, send } = g;
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<TileId | null>(null);
  const [jokerDialog, setJokerDialog] = useState<{ tileId: TileId; meldId: string } | null>(null);
  const [sound, setSound] = useState(true);

  // Bağlantı: WebSocket + ilk yükleme için HTTP
  useEffect(() => {
    setSound(soundEnabled());
    const release = realtime.acquire();
    const offStatus = realtime.onStatus(setStatus);
    const off = realtime.on((m) => {
      if (m.t === "state") {
        const v = m.view as ClientGameView;
        if (v.matchId === matchId) useGame.getState().setView(v);
      }
      if (m.t === "chatHistory" && m.matchId === matchId) useChat.getState().history(matchId, m.messages as ChatMessage[]);
      if (m.t === "chat" && m.matchId === matchId) useChat.getState().receive(matchId, m.msg as ChatMessage, useGame.getState().view?.mySeat ?? null);
      if (m.t === "error" && m.code === "RATE_LIMITED") toast.error(String(m.error));
      if (m.t === "pong" && m.presence) useGame.getState().setPresence(m.presence as Record<number, boolean>);
      if (m.t === "error" && (m.code === "FORBIDDEN" || m.code === "NOT_FOUND")) setError(String(m.error));
    });
    realtime.watchMatch(matchId);
    api<{ view: ClientGameView }>(`/api/matches/${matchId}`)
      .then((r) => useGame.getState().setView(r.view))
      .catch((e: Error & { status?: number }) => {
        if (e.status === 401) router.replace(`/?next=/game/${matchId}`);
        else setError(e.message);
      });
    return () => {
      off();
      offStatus();
      realtime.unwatchMatch();
      release();
      useGame.getState().reset();
      useFx.getState().clear();
      useChat.getState().reset();
    };
  }, [matchId, router]);

  const mySeat = view?.mySeat ?? null;
  const legal = useMemo(() => new Set(view?.legalActions ?? []), [view]);
  const assisted = !!view?.rules.assisted;
  const okey = view?.hand.okey;
  const me = view && mySeat !== null ? view.players.find((p) => p.seat === mySeat)! : null;

  // Yardımlı mod hesaplamaları (yalnızca kendi taşlarım + masadaki açık bilgi)
  const assist = useMemo(() => {
    if (!view || !okey || !assisted) return null;
    const potential = tilesInPotentialMelds(view.myHand, okey, view.rules);
    const pairIds = new Set(suggestPairs(view.myHand, okey, view.rules).flat());
    return { potential, pairIds };
  }, [view, okey, assisted]);

  const highlights = useMemo(() => {
    const h: Record<TileId, "joker" | "meld" | "pair" | "fresh" | "taken" | null> = {};
    if (!view || !okey) return h;
    for (const t of view.myHand) {
      if (t.id === view.hand.myTakeObligation) h[t.id] = "taken";
      else if (view.hand.myIndicatorPending && t.id === view.hand.indicator.id) h[t.id] = "fresh";
      else if (t.id === view.hand.myDrawnTileId && view.hand.turnPhase === "awaitingAction") h[t.id] = "fresh";
      else if (assisted && isJoker(t, okey)) h[t.id] = "joker";
      else if (assist?.potential.has(t.id)) h[t.id] = "meld";
      else if (assist?.pairIds.has(t.id)) h[t.id] = "pair";
    }
    return h;
  }, [view, okey, assisted, assist]);

  const staged = useMemo(() => {
    if (!view || !okey) return null;
    const map = tilesMap(view.myHand);
    const melds = calculateOpeningPoints(stagedMelds, map, okey, view.rules);
    const pairs = validatePairs(stagedPairs, map, okey, view.rules);
    return { melds, pairs };
  }, [view, okey, stagedMelds, stagedPairs]);

  const act = useCallback(
    async (action: GameAction) => {
      const ok = await send(action);
      if (ok) {
        if (action.type === "OPEN_MELDS" || action.type === "OPEN_PAIRS") useGame.getState().clearStaging();
        else useGame.getState().clearSelection();
      }
      return ok;
    },
    [send],
  );

  const doDiscard = useCallback(
    async (tileId: TileId, confirmed = false) => {
      if (!view) return;
      const finishing = view.myHand.length === 1;
      if (!confirmed && pref("okey:confirmDiscard", true)) {
        setConfirmDiscard(tileId);
        return;
      }
      setConfirmDiscard(null);
      await act(finishing ? { type: "FINISH_HAND", tileId } : { type: "DISCARD_TILE", tileId });
    },
    [view, act],
  );

  const tryAddToMeld = useCallback(
    async (tileId: TileId, meldId: string, forcedSide?: "start" | "end") => {
      if (!view || !okey) return;
      const meld = view.hand.melds.find((m) => m.id === meldId);
      const tile = view.myHand.find((t) => t.id === tileId);
      if (!meld || !tile) return;
      // Okeyi değiştirmeye uygun mu? (gerçek taş + perde okey varsa)
      if (!isJoker(tile, okey) && legal.has("REPLACE_JOKER") && replaceJokerInMeld(meld, tile, okey).ok && !addTileToMeld(meld, tile, okey, view.rules).ok) {
        setJokerDialog({ tileId, meldId });
        return;
      }
      let side: "start" | "end" | undefined = meld.kind === "run" ? forcedSide : undefined;
      if (!side && isJoker(tile, okey) && meld.kind === "run") {
        const canEnd = addTileToMeld(meld, tile, okey, view.rules, "end").ok;
        const canStart = addTileToMeld(meld, tile, okey, view.rules, "start").ok;
        if (canEnd && canStart) side = window.confirm("Okey serinin SONUNA eklensin mi? (İptal: başına)") ? "end" : "start";
      }
      await act({ type: "ADD_TO_MELD", tileId, meldId, side });
    },
    [view, okey, legal, act],
  );

  /** Desteden çek / yandan al; slot verilirse taş ıstakada o yuvaya yerleşir. */
  const take = useCallback(
    async (type: "DRAW_TILE" | "TAKE_DISCARD", slot: number | null) => {
      useGame.getState().setPendingSlot(slot);
      const ok = await act({ type });
      if (!ok) useGame.getState().setPendingSlot(null);
    },
    [act],
  );

  /** Göstergenin eşi eldeyse masadaki göstergeyi çift için ıstakaya al. */
  const takeIndicator = useCallback(
    async (slot: number | null) => {
      useGame.getState().setPendingSlot(slot);
      const ok = await act({ type: "TAKE_INDICATOR" });
      if (!ok) useGame.getState().setPendingSlot(null);
      else toast.info("Göstergeyi eşinin yanına koyun ve “Çift aç”a basın.");
    },
    [act],
  );

  /** Istakadaki dizilim (veya hazırlanan perler) ile seri aç. */
  const rackMelds = useMemo(() => {
    if (!view || !okey) return null;
    return meldsFromRack(g.slots, RACK_COLS, view.myHand, okey, view.rules);
  }, [view, okey, g.slots]);

  /** Istakada yan yana dizili çift sayısı */
  const rackPairs = useMemo(() => {
    if (!view || !okey) return 0;
    return pairsFromRack(g.slots, RACK_COLS, view.myHand, okey, view.rules).length;
  }, [view, okey, g.slots]);

  const openMelds = useCallback(async () => {
    if (!view || !okey) return;
    if (stagedMelds.length > 0) {
      await act({ type: "OPEN_MELDS", melds: stagedMelds });
      return;
    }
    const found = rackMelds ?? { melds: [], total: 0 };
    let melds = found.melds;
    // En az bir taş elde kalmalı: gerekiyorsa en küçük peri çıkar.
    while (melds.length && melds.reduce((n, m) => n + m.tileIds.length, 0) >= view.myHand.length) melds = melds.slice(0, -1);
    if (melds.length === 0) {
      toast.error("Istakada dizili per bulunamadı. Perleri yan yana dizin, aralarına boşluk bırakın.");
      return;
    }
    const me = view.players.find((p) => p.seat === view.mySeat);
    if (!me?.opened) {
      const map = tilesMap(view.myHand);
      const calc = calculateOpeningPoints(melds, map, okey, view.rules);
      const total = calc.ok ? calc.value.total : 0;
      if (total < view.hand.requiredRunPoints) {
        toast.error(`Dizili perler ${total} puan; açmak için en az ${view.hand.requiredRunPoints} gerekiyor.`);
        return;
      }
      const ob = view.hand.myTakeObligation;
      if (ob && !melds.some((m) => m.tileIds.includes(ob))) {
        toast.error("Yandan aldığınız taş dizili perlerin içinde olmalı.");
        return;
      }
    }
    await act({ type: "OPEN_MELDS", melds });
  }, [view, okey, stagedMelds, rackMelds, act]);

  const openPairs = useCallback(async () => {
    if (!view || !okey) return;
    let pairs = stagedPairs.length > 0 ? stagedPairs : pairsFromRack(g.slots, RACK_COLS, view.myHand, okey, view.rules);
    while (pairs.length * 2 >= view.myHand.length) pairs = pairs.slice(0, -1);
    if (pairs.length === 0) {
      toast.error("Istakada yan yana dizili çift bulunamadı.");
      return;
    }
    if (view.hand.myIndicatorPending && !pairs.some((p) => p.includes(view.hand.indicator.id))) {
      toast.error("Göstergeyi eşinin hemen yanına koyun; gösterge açtığınız çiftlerde olmalı.");
      return;
    }
    const me = view.players.find((p) => p.seat === view.mySeat);
    if (!me?.opened && pairs.length < view.hand.requiredPairCount) {
      toast.error(`${pairs.length} çift dizili; açmak için en az ${view.hand.requiredPairCount} çift gerekiyor.`);
      return;
    }
    await act({ type: "OPEN_PAIRS", pairs });
  }, [view, okey, stagedPairs, g.slots, act]);

  const onDropOutside = useCallback(
    (tileId: TileId, target: DropTarget) => {
      if (!view) return;
      if (target.kind === "discard") {
        if (!legal.has("DISCARD_TILE") && !legal.has("FINISH_HAND")) {
          toast.error(view.hand.currentTurn !== mySeat ? "Sıra sizde değil." : "Önce taş çekmelisiniz.");
          return;
        }
        void doDiscard(tileId, true); // sürükleyip bırakmak bilinçli bir hareket sayılır
      } else if (target.kind === "meld" && target.meldId) {
        if (!legal.has("ADD_TO_MELD")) {
          toast.error("Şu an taş işleyemezsiniz.");
          return;
        }
        void tryAddToMeld(tileId, target.meldId, target.side);
      }
    },
    [view, legal, mySeat, doDiscard, tryAddToMeld],
  );

  if (error) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Maç açılamadı</h1>
        <p className="mt-2 text-white/60">{error}</p>
        <Button className="mt-6" onClick={() => router.push("/")}>
          Ana sayfaya dön
        </Button>
      </main>
    );
  }
  if (!view || !okey) return <PageLoading text="Masa hazırlanıyor…" />;

  const pos = relativePositions(mySeat);
  const presence = g.presence;
  const isMyTurn = view.phase === "playing" && view.hand.currentTurn === mySeat;
  const leftSeat = prevSeat(pos.bottom);
  const selectedOne = selected.length === 1 ? selected[0] : null;
  const opened = me?.opened ?? null;
  const required = { run: view.hand.requiredRunPoints, pairs: view.hand.requiredPairCount };
  const meldsByOwner = ([pos.bottom, pos.right, pos.top, pos.left] as Seat[]).map((s) => ({
    seat: s,
    melds: view.hand.melds.filter((m) => m.owner === s),
    pairs: view.hand.pairs.filter((p) => p.owner === s),
  }));

  const sortBy = (mode: "color" | "value") => {
    const sorted = sortHand(view.myHand, okey, mode);
    // Renk gruplarını ayrı satırlara/boşluklarla yerleştir
    const ids: (TileId | null)[] = [];
    let prevKey = "";
    for (const t of sorted) {
      const key = mode === "color" ? (isJoker(t, okey) ? "j" : t.isFakeJoker ? okey.color : t.color!) : String(t.isFakeJoker ? okey.value : t.value);
      if (prevKey && key !== prevKey && mode === "color") ids.push(null);
      ids.push(t.id);
      prevKey = key;
    }
    const compact = ids.length > RACK_COLS * 2 ? sorted.map((t) => t.id) : ids;
    useGame.getState().arrange(compact);
  };

  const suggest = () => {
    if (!opened || opened.kind === "melds") {
      const best = suggestBestMelds(view.myHand, okey, view.rules);
      let melds = best.melds;
      while (melds.length && melds.reduce((n, m) => n + m.tileIds.length, 0) >= view.myHand.length) melds = melds.slice(0, -1);
      if (melds.length) {
        useGame.getState().setStagedMelds(melds);
        return;
      }
    }
    let pairs = suggestPairs(view.myHand, okey, view.rules);
    while (pairs.length * 2 >= view.myHand.length) pairs = pairs.slice(0, -1);
    if (pairs.length) useGame.getState().setStagedPairs(pairs);
    else toast.info("Açılabilecek per veya çift bulunamadı.");
  };

  const obligation = view.hand.myTakeObligation;
  const rightSeat = pos.right;

  return (
    <LayoutGroup>
      <div className="kiraathane fixed inset-0 flex flex-col overflow-hidden">
        {/* Üst çubuk */}
        <div className="relative z-10 flex items-center gap-2 bg-black/45 px-2 py-1.5 text-xs backdrop-blur-sm sm:text-sm">
          <span className="rounded-md bg-gold/90 px-2 py-0.5 font-black text-felt-950">
            El {view.hand.handNumber}/{view.rules.totalHands}
          </span>
          <span className="hidden text-white/70 sm:inline">{view.rules.profileName}</span>
          <span className="hidden text-white/50 sm:inline">Kod: <b className="font-mono tracking-wider text-white/80">{view.roomCode}</b></span>
          <span className="ml-auto flex items-center gap-1">
            <ConnectionIcon status={status} />
            <ChatButton />
            <AmbientButton />
            <Button size="sm" variant="secondary" onClick={() => setScoreOpen(true)} aria-label="Skor tablosu">
              <Trophy className="h-4 w-4" /> <span className="hidden sm:inline">Skor</span>
            </Button>
            <a href="/rules" target="_blank" className="rounded-lg p-1.5 text-white/70 hover:bg-white/10" aria-label="Oyun kuralları">
              <BookOpen className="h-4 w-4" />
            </a>
            <button
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"
              aria-label={sound ? "Sesi kapat" : "Sesi aç"}
              onClick={() => {
                setSoundEnabled(!sound);
                setSound(!sound);
              }}
            >
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"
              aria-label="Odadan ayrıl"
              onClick={() => {
                if (view.phase === "finished" || window.confirm("Masadan ayrılmak istiyor musunuz? Koltuğunuz korunur, geri dönebilirsiniz.")) {
                  router.push(`/room/${view.roomCode}${view.phase === "finished" ? "" : "?stay=1"}`);
                }
              }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </span>
        </div>
        <div className="vitray" aria-hidden />
        {status !== "open" && (
          <div className="relative z-10 bg-amber-500/90 px-3 py-1 text-center text-xs font-bold text-felt-950" role="status">
            {status === "offline" ? "Bağlantı yok – oturum veya internet bağlantınızı kontrol edin." : "Bağlantı yeniden kuruluyor… Oyun durumu korunuyor."}
          </div>
        )}

        {/* Masa */}
        <div className="relative mx-auto mt-1 w-full max-w-[1200px] min-h-0 flex-1 px-1 sm:mt-2 sm:px-6">
          <div className="table-shell" aria-hidden>
            <div className="table-felt" />
          </div>
          <TableCaption />
          <div className="relative grid h-full grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] gap-1 p-3 sm:gap-2 sm:p-6">
            {/* Üst sıra: sol üst köşe = karşıdakinin attıkları, üst oyuncu, sağ üst köşe = sağdakinin attıkları */}
            <div className="col-start-1 row-start-1 flex items-start justify-start">
              <DiscardPile seat={pos.top} tiles={view.hand.discards[pos.top]} okey={okey} label={`${seatName(view, pos.top)} attığı taşlar`} />
            </div>
            <div className="col-start-2 row-start-1 flex flex-col items-center gap-1">
              <PlayerBadge view={view} seat={pos.top} position="top" online={presence[pos.top] ?? false} />
              <OpponentRail count={view.players.find((p) => p.seat === pos.top)?.tileCount ?? 0} orientation="horizontal" />
            </div>
            <div className="col-start-3 row-start-1 flex items-start justify-end">
              <DiscardPile seat={rightSeat} tiles={view.hand.discards[rightSeat]} okey={okey} label={`${seatName(view, rightSeat)} attığı taşlar`} />
            </div>

            {/* Orta sıra */}
            <div className="col-start-1 row-start-2 flex items-center gap-1">
              <PlayerBadge view={view} seat={pos.left} position="left" online={presence[pos.left] ?? false} />
              <OpponentRail count={view.players.find((p) => p.seat === pos.left)?.tileCount ?? 0} orientation="vertical" />
            </div>
            <div className="col-start-2 row-start-2 flex min-h-0 flex-col items-center gap-2 overflow-hidden">
              <CenterPile
                view={view}
                canDraw={isMyTurn && legal.has("DRAW_TILE") && !busy}
                onDraw={(slot) => take("DRAW_TILE", slot)}
                canTakeIndicator={isMyTurn && legal.has("TAKE_INDICATOR") && !busy}
                onTakeIndicator={takeIndicator}
              />
              <div className="w-full min-h-0 flex-1 overflow-y-auto rounded-xl p-1.5" aria-label="Açılmış perler">
                {view.hand.melds.length === 0 && view.hand.pairs.length === 0 ? (
                  <p className="py-4 text-center text-xs text-white/35">Henüz açan yok</p>
                ) : (
                  <div className="space-y-1.5">
                    {meldsByOwner
                      .filter((o) => o.melds.length || o.pairs.length)
                      .map((o) => (
                        <div key={o.seat}>
                          <p className="mb-1 text-[11px] font-bold text-white/70">{seatName(view, o.seat)}</p>
                          <div className="flex flex-wrap items-start gap-2">
                            {o.melds.map((m) => (
                              <MeldView
                                key={m.id}
                                meld={m}
                                okey={okey}
                                ownerName={seatName(view, o.seat)}
                                zones={isMyTurn && legal.has("ADD_TO_MELD")}
                                onZone={selectedOne ? (side) => tryAddToMeld(selectedOne, m.id, side) : undefined}
                              />
                            ))}
                            {o.pairs.map((p) => (
                              <PairView key={p.id} pair={p} okey={okey} />
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            <div className="col-start-3 row-start-2 flex items-center justify-end gap-1">
              <OpponentRail count={view.players.find((p) => p.seat === pos.right)?.tileCount ?? 0} orientation="vertical" />
              <PlayerBadge view={view} seat={pos.right} position="right" online={presence[pos.right] ?? false} />
            </div>

            {/* Alt sıra: sol alt köşe = soldakinin attıkları (benim alabileceğim), ben, sağ alt köşe = benim atma alanım */}
            <div className="col-start-1 row-start-3 flex items-end justify-start">
              <DiscardPile
                seat={leftSeat}
                tiles={view.hand.discards[leftSeat]}
                okey={okey}
                label={`${seatName(view, leftSeat)} attığı taşlar`}
                takeable={isMyTurn && legal.has("TAKE_DISCARD") && !busy}
                onTake={(slot) => take("TAKE_DISCARD", slot)}
                hint={isMyTurn && legal.has("TAKE_DISCARD") ? "Yandan al" : undefined}
              />
            </div>
            <div className="col-start-2 row-start-3 flex min-w-0 flex-wrap items-end justify-center gap-2">
              <PlayerBadge view={view} seat={pos.bottom} position="bottom" online={status === "open"} />
              {(assisted || stagedMelds.length > 0 || stagedPairs.length > 0 || obligation) && (
                <div className="flex min-w-0 flex-wrap items-center justify-center gap-1 text-[11px]">
                  {view.hand.myIndicatorPending && (
                    <span className="rounded bg-amber-500/90 px-2 py-0.5 font-bold text-felt-950" data-testid="indicator-pending">
                      Göstergeyi eşiyle yan yana koyup çift açın – açmayacaksanız geri bırakın
                    </span>
                  )}
                  {obligation && (
                    <span className="rounded bg-amber-500/90 px-2 py-0.5 font-bold text-felt-950" data-testid="take-obligation">
                      {opened ? "Yandan aldığınız taşı işleyin veya perde kullanın" : `Yandan aldığınız taşla ${required.run} geçen seriyi açın – açamıyorsanız geri bırakın`}
                    </span>
                  )}
                  {assisted && view.phase === "playing" && !opened && !obligation && (
                    <span className="rounded bg-black/40 px-2 py-0.5 font-bold" data-testid="threshold">
                      Baraj: {required.run} puan / {required.pairs} çift
                    </span>
                  )}
                  {stagedMelds.map((m, i) => (
                    <span key={i} className="flex items-center gap-1 rounded bg-emerald-900/70 px-1.5 py-0.5">
                      Per {i + 1} ({m.tileIds.length})
                      <button aria-label="Peri kaldır" onClick={() => g.unstageMeld(i)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {stagedPairs.map((p, i) => (
                    <span key={i} className="flex items-center gap-1 rounded bg-sky-900/70 px-1.5 py-0.5">
                      Çift {i + 1}
                      <button aria-label="Çifti kaldır" onClick={() => g.unstagePair(i)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {assisted && staged && stagedMelds.length > 0 && (
                    <span className={cn("rounded px-2 py-0.5 font-black", staged.melds.ok && staged.melds.value.total >= required.run ? "bg-emerald-500 text-white" : "bg-red-500/80")} data-testid="staged-points">
                      {staged.melds.ok ? `${staged.melds.value.total} puan` : staged.melds.error}
                    </span>
                  )}
                  {assisted && staged && stagedPairs.length > 0 && !staged.pairs.ok && <span className="rounded bg-red-500/80 px-2 py-0.5">{staged.pairs.error}</span>}
                </div>
              )}
            </div>
            <div className="col-start-3 row-start-3 flex items-end justify-end">
              <DiscardPile seat={pos.bottom} tiles={view.hand.discards[pos.bottom]} okey={okey} label="Taş atma alanı (sürükleyip bırakın)" dropTarget />
            </div>
          </div>
        </div>

        {/* Aksiyonlar */}
        {mySeat !== null && view.phase === "playing" && (
          <div className="relative z-10 flex flex-wrap items-center justify-center gap-1 px-1 py-1" data-testid="actions">
            {legal.has("DRAW_TILE") && <Button size="sm" onClick={() => take("DRAW_TILE", null)} disabled={busy}>Ortadan çek</Button>}
            {legal.has("TAKE_DISCARD") && <Button size="sm" variant="secondary" onClick={() => take("TAKE_DISCARD", null)} disabled={busy}>Yandan al</Button>}
            {legal.has("TAKE_INDICATOR") && (
              <Button size="sm" variant="secondary" onClick={() => takeIndicator(null)} disabled={busy}>
                Göstergeyi al
              </Button>
            )}
            {legal.has("RETURN_INDICATOR") && (
              <Button size="sm" variant="danger" onClick={() => act({ type: "RETURN_INDICATOR" })} disabled={busy}>
                Göstergeyi geri bırak
              </Button>
            )}
            {legal.has("RETURN_DISCARD") && (
              <Button size="sm" variant="danger" onClick={() => act({ type: "RETURN_DISCARD" })} disabled={busy}>
                Geri bırak{view.rules.penaltiesEnabled ? ` (+${view.rules.failedTakePenalty})` : ""}
              </Button>
            )}
            {legal.has("OPEN_MELDS") && (
              <>
                {selected.length >= 3 && (
                  <Button size="sm" variant="secondary" onClick={g.stageMeld}>Per oluştur</Button>
                )}
                <Button size="sm" variant="success" disabled={busy} onClick={openMelds} data-testid="open-melds">
                  {opened ? "Per aç" : "Seri aç"}
                  {assisted && stagedMelds.length === 0 && rackMelds && rackMelds.total > 0 && (
                    <span className="ml-1 rounded bg-black/25 px-1 text-[11px]">{rackMelds.total}</span>
                  )}
                </Button>
              </>
            )}
            {legal.has("OPEN_PAIRS") && (
              <>
                {selected.length === 2 && (
                  <Button size="sm" variant="secondary" onClick={g.stagePair}>Çift oluştur</Button>
                )}
                <Button size="sm" variant="success" disabled={busy} onClick={openPairs}>
                  Çift aç
                </Button>
              </>
            )}
            {legal.has("ADD_TO_MELD") && isMyTurn && (
              <span className="px-1 text-[11px] text-white/60">İşlemek için taşı perin başındaki / sonundaki <b className="text-white/80">+</b> karesine sürükleyin veya seçip kareye dokunun</span>
            )}
            {(legal.has("DISCARD_TILE") || legal.has("FINISH_HAND")) && (
              <Button size="sm" variant={view.myHand.length === 1 ? "success" : "default"} disabled={busy || !selectedOne} onClick={() => selectedOne && doDiscard(selectedOne)}>
                {view.myHand.length === 1 ? "Bitir" : "Taş at"}
              </Button>
            )}
            {assisted && isMyTurn && view.hand.turnPhase === "awaitingAction" && (
              <Button size="sm" variant="ghost" onClick={suggest} aria-label="Per öner">
                <Lightbulb className="h-4 w-4" /> Öner
              </Button>
            )}
            {(stagedMelds.length > 0 || stagedPairs.length > 0) && (
              <Button size="sm" variant="ghost" onClick={g.clearStaging} aria-label="Hazırlığı temizle">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            {assisted && (
              <>
                <Button size="sm" variant="ghost" onClick={() => sortBy("color")} aria-label="Renge göre sırala">
                  <ListOrdered className="h-4 w-4" /> Renk
                </Button>
                <Button size="sm" variant="ghost" onClick={() => sortBy("value")} aria-label="Sayıya göre sırala">
                  <ArrowDownUp className="h-4 w-4" /> Sayı
                </Button>
              </>
            )}
            {!isMyTurn && <span className="px-2 text-xs text-white/60">Sıra: {seatName(view, view.hand.currentTurn)}</span>}
          </div>
        )}

        {/* Istaka */}
        {mySeat !== null ? (
          <Rack
            tiles={view.myHand}
            okey={okey}
            highlights={highlights}
            showJokerMark={assisted}
            onDropOutside={onDropOutside}
            badge={
              view.phase === "playing" && (rackMelds?.total || rackPairs > 0) ? (
                <div className="rack-total pointer-events-none absolute -top-3 left-3 z-10 flex gap-1 text-[11px] font-black sm:left-5 sm:text-xs" data-testid="rack-total">
                  {rackMelds && rackMelds.total > 0 && (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-white shadow">Seri: {rackMelds.total}</span>
                  )}
                  {rackPairs > 0 && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-white shadow">Çift: {rackPairs}</span>}
                </div>
              ) : null
            }
          />
        ) : (
          <div className="rack-stand p-3 text-center text-sm text-white/80">Seyirci modundasınız. Oyuncuların taşları gizlidir.</div>
        )}
      </div>

      <FlightLayer okey={okey} />
      <ChatTableLayer />
      <ChatPanel view={view} />
      <AmbientPlayer muted={!sound} />
      <ScoreBoard view={view} open={scoreOpen} onClose={() => setScoreOpen(false)} />
      {view.phase === "handResult" && <HandResultDialog view={view} busy={busy} onReady={() => act({ type: "READY_NEXT_HAND" })} />}
      {view.phase === "finished" && (
        <MatchEndDialog
          view={view}
          onLobby={() => router.push(`/room/${view.roomCode}`)}
          onRematch={async () => {
            try {
              await api(`/api/rooms/${view.roomCode}/ready`, { body: { ready: true } });
            } catch (e) {
              toast.error((e as Error).message);
            }
            router.push(`/room/${view.roomCode}`);
          }}
          onHome={() => router.push("/")}
        />
      )}
      <Dialog open={confirmDiscard !== null} onClose={() => setConfirmDiscard(null)} title={view.myHand.length === 1 ? "Eli bitir" : "Taş at"}>
        {confirmDiscard && (
          <div className="space-y-4">
            <p className="text-sm text-white/80">
              {view.myHand.length === 1 ? "Son taşınızı atarak eli bitirmek istiyor musunuz?" : "Seçili taşı atmak istiyor musunuz?"}
              {isJoker(view.myHand.find((t) => t.id === confirmDiscard)!, okey) && view.myHand.length > 1 && view.rules.penaltiesEnabled && (
                <b className="mt-1 block text-red-300">Dikkat: Okey atıyorsunuz (+{view.rules.discardJokerPenalty} ceza).</b>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDiscard(null)}>
                Vazgeç
              </Button>
              <Button onClick={() => doDiscard(confirmDiscard, true)} data-testid="confirm-discard">
                {view.myHand.length === 1 ? "Bitir" : "At"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
      <JokerReplaceDialog
        state={jokerDialog}
        view={view}
        onClose={() => setJokerDialog(null)}
        onSubmit={async (action) => {
          setJokerDialog(null);
          await act(action);
        }}
      />
    </LayoutGroup>
  );
}

/** Okey değiştirme: geri alınan okeyin aynı hamlede nereye konacağını seçtirir (atomik komut). */
function JokerReplaceDialog({
  state,
  view,
  onClose,
  onSubmit,
}: {
  state: { tileId: TileId; meldId: string } | null;
  view: ClientGameView;
  onClose: () => void;
  onSubmit: (a: GameAction) => void;
}) {
  const stagedMelds = useGame((s) => s.stagedMelds);
  const selected = useGame((s) => s.selected);
  if (!state) return null;
  const okey = view.hand.okey;
  const meld = view.hand.melds.find((m) => m.id === state.meldId)!;
  const rr = replaceJokerInMeld(meld, view.myHand.find((t) => t.id === state.tileId)!, okey);
  if (!rr.ok) return null;
  const jokerTileId = rr.value.jokerTileId;
  const jokerTile = { id: jokerTileId, color: okey.color, value: okey.value, copyIndex: Number(jokerTileId.slice(-1)) as 0 | 1, isFakeJoker: false };
  const options = view.hand.melds
    .filter((m) => m.id !== meld.id)
    .flatMap((m) =>
      (["start", "end"] as const)
        .filter((side) => addTileToMeld(m, jokerTile, okey, view.rules, side).ok)
        .map((side) => ({ meldId: m.id, side, label: `${seatName(view, m.owner)} – ${m.kind === "run" ? "seri" : "grup"} (${side === "start" ? "başına" : "sonuna"})` })),
    );
  const others = (stagedMelds[0]?.tileIds ?? selected).filter((id) => id !== state.tileId);
  return (
    <Dialog open onClose={onClose} title="Okeyi al">
      <p className="mb-3 text-sm text-white/70">
        Okeyi ıstakanıza alıp sonra kendi perinizde/çiftinizde kullanabilir ya da hemen bir yere koyabilirsiniz.
        {view.rules.penaltiesEnabled &&
          meld.owner !== view.mySeat &&
          (!view.rules.teamMode || meld.owner % 2 !== (view.mySeat ?? 0) % 2) && (
            <b className="mt-1 block text-amber-300">
              {seatName(view, meld.owner)} oyuncusuna +{view.rules.jokerTakenPenalty ?? 101} ceza yazılacak (perindeki okey alınıyor).
            </b>
          )}
      </p>
      <div className="space-y-2">
        <Button
          className="w-full"
          data-testid="joker-to-rack"
          onClick={() => onSubmit({ type: "REPLACE_JOKER", meldId: meld.id, tileId: state.tileId })}
        >
          Okeyi ıstakaya al
        </Button>
        {(options.length > 0 || others.length >= 2) && <p className="pt-1 text-xs text-white/50">veya hemen kullan:</p>}
        {options.slice(0, 8).map((o) => (
          <Button
            key={`${o.meldId}-${o.side}`}
            variant="secondary"
            className="w-full justify-start"
            onClick={() => onSubmit({ type: "REPLACE_JOKER", meldId: meld.id, tileId: state.tileId, jokerUse: { type: "addToMeld", meldId: o.meldId, side: o.side } })}
          >
            {o.label}
          </Button>
        ))}
        {others.length >= 2 && (
          <Button
            className="w-full"
            onClick={() =>
              onSubmit({ type: "REPLACE_JOKER", meldId: meld.id, tileId: state.tileId, jokerUse: { type: "newMeld", meld: { tileIds: [...others, jokerTileId] } } })
            }
          >
            Seçili taşlarla yeni per aç ({others.length} taş + okey)
          </Button>
        )}
      </div>
    </Dialog>
  );
}

export { play };
