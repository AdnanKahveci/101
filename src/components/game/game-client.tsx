"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGroup } from "motion/react";
import { ArrowDownUp, BookOpen, Lightbulb, ListOrdered, LogOut, Trash2, Trophy, Volume2, VolumeX, X } from "lucide-react";
import {
  addTileToMeld,
  calculateOpeningPoints,
  isJoker,
  playableTargets,
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
import { CenterPile, ConnectionIcon, DiscardPile, MeldView, PairView, PlayerBadge, seatName } from "./table";
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
  const [addMode, setAddMode] = useState(false);
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
      if (m.t === "pong" && m.presence) useGame.getState().setPresence(m.presence as Record<number, boolean>);
      if (m.t === "error" && (m.code === "FORBIDDEN" || m.code === "NOT_FOUND")) setError(String(m.error));
    });
    realtime.watchMatch(matchId);
    api<{ view: ClientGameView }>(`/api/matches/${matchId}`)
      .then((r) => useGame.getState().setView(r.view))
      .catch((e: Error & { status?: number }) => {
        if (e.status === 401) router.replace(`/login?next=/game/${matchId}`);
        else setError(e.message);
      });
    return () => {
      off();
      offStatus();
      realtime.unwatchMatch();
      release();
      useGame.getState().reset();
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
    const targets = playableTargets(view.myHand, view.hand.melds, okey, view.rules);
    return { potential, pairIds, targets };
  }, [view, okey, assisted]);

  const highlights = useMemo(() => {
    const h: Record<TileId, "joker" | "meld" | "pair" | null> = {};
    if (!view || !okey) return h;
    for (const t of view.myHand) {
      if (assisted && isJoker(t, okey)) h[t.id] = "joker";
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
        setAddMode(false);
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
    async (tileId: TileId, meldId: string) => {
      if (!view || !okey) return;
      const meld = view.hand.melds.find((m) => m.id === meldId);
      const tile = view.myHand.find((t) => t.id === tileId);
      if (!meld || !tile) return;
      // Okeyi değiştirmeye uygun mu? (gerçek taş + perde okey varsa)
      if (!isJoker(tile, okey) && legal.has("REPLACE_JOKER") && replaceJokerInMeld(meld, tile, okey).ok && !addTileToMeld(meld, tile, okey, view.rules).ok) {
        setJokerDialog({ tileId, meldId });
        return;
      }
      let side: "start" | "end" | undefined;
      if (isJoker(tile, okey) && meld.kind === "run") {
        const canEnd = addTileToMeld(meld, tile, okey, view.rules, "end").ok;
        const canStart = addTileToMeld(meld, tile, okey, view.rules, "start").ok;
        if (canEnd && canStart) side = window.confirm("Okey serinin SONUNA eklensin mi? (İptal: başına)") ? "end" : "start";
      }
      await act({ type: "ADD_TO_MELD", tileId, meldId, side });
    },
    [view, okey, legal, act],
  );

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
        void tryAddToMeld(tileId, target.meldId);
      }
    },
    [view, legal, mySeat, doDiscard, tryAddToMeld],
  );

  if (error) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Maç açılamadı</h1>
        <p className="mt-2 text-white/60">{error}</p>
        <Button className="mt-6" onClick={() => router.push("/dashboard")}>
          Panele dön
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
  const meldTargets = new Set(
    addMode && selectedOne && assist?.targets[selectedOne] ? assist.targets[selectedOne] : [],
  );
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

  return (
    <LayoutGroup>
      <div className="felt fixed inset-0 flex flex-col overflow-hidden">
        {/* Üst çubuk */}
        <div className="flex items-center gap-2 bg-felt-950/70 px-2 py-1.5 text-xs sm:text-sm">
          <span className="font-black">
            El {view.hand.handNumber}/{view.rules.totalHands}
          </span>
          <span className="hidden text-white/60 sm:inline">{view.rules.profileName}</span>
          <span className="ml-auto flex items-center gap-1">
            <ConnectionIcon status={status} />
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
        {status !== "open" && (
          <div className="bg-amber-500/90 px-3 py-1 text-center text-xs font-bold text-felt-950" role="status">
            {status === "offline" ? "Bağlantı yok – oturum veya internet bağlantınızı kontrol edin." : "Bağlantı yeniden kuruluyor… Oyun durumu korunuyor."}
          </div>
        )}

        {/* Masa */}
        <div className="relative grid min-h-0 flex-1 grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] gap-1 p-1 sm:gap-2 sm:p-2">
          <div className="col-start-2 row-start-1 flex justify-center">
            <PlayerBadge view={view} seat={pos.top} position="top" online={presence[pos.top] ?? false} />
          </div>
          <div className="col-start-1 row-start-2 flex flex-col items-center justify-center gap-2">
            <PlayerBadge view={view} seat={pos.left} position="left" online={presence[pos.left] ?? false} />
            <DiscardPile
              tiles={view.hand.discards[leftSeat]}
              okey={okey}
              label={`${seatName(view, leftSeat)} attığı taşlar`}
              takeable={isMyTurn && legal.has("TAKE_DISCARD")}
              onTake={() => act({ type: "TAKE_DISCARD" })}
            />
          </div>
          <div className="col-start-3 row-start-2 flex flex-col items-center justify-center gap-2">
            <PlayerBadge view={view} seat={pos.right} position="right" online={presence[pos.right] ?? false} />
            <DiscardPile tiles={view.hand.discards[pos.right]} okey={okey} label={`${seatName(view, pos.right)} attığı taşlar`} />
          </div>

          {/* Orta alan: deste, gösterge, perler */}
          <div className="col-start-2 row-start-2 flex min-h-0 flex-col items-center gap-2 overflow-hidden">
            <div className="flex items-center gap-4">
              <DiscardPile tiles={view.hand.discards[pos.top]} okey={okey} label={`${seatName(view, pos.top)} attığı taşlar`} />
              <CenterPile view={view} canDraw={isMyTurn && legal.has("DRAW_TILE")} onDraw={() => act({ type: "DRAW_TILE" })} />
            </div>
            <div className="w-full min-h-0 flex-1 overflow-y-auto rounded-xl bg-black/10 p-1.5" aria-label="Açılmış perler">
              {view.hand.melds.length === 0 && view.hand.pairs.length === 0 ? (
                <p className="py-4 text-center text-xs text-white/40">Henüz açan yok</p>
              ) : (
                <div className="space-y-1.5">
                  {meldsByOwner
                    .filter((o) => o.melds.length || o.pairs.length)
                    .map((o) => (
                      <div key={o.seat}>
                        <p className="mb-0.5 text-[10px] font-bold text-white/60">{seatName(view, o.seat)}</p>
                        <div className="flex flex-wrap gap-1">
                          {o.melds.map((m) => (
                            <MeldView
                              key={m.id}
                              meld={m}
                              okey={okey}
                              ownerName={seatName(view, o.seat)}
                              target={meldTargets.has(m.id)}
                              onClick={addMode && selectedOne ? () => tryAddToMeld(selectedOne, m.id) : undefined}
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

          <div className="col-span-3 row-start-3 flex items-end justify-between gap-2 px-1">
            <PlayerBadge view={view} seat={pos.bottom} position="bottom" online={status === "open"} />
            {(assisted || stagedMelds.length > 0 || stagedPairs.length > 0) && (
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1 text-[11px]">
                {assisted && view.phase === "playing" && !opened && (
                  <span className="rounded bg-black/30 px-2 py-0.5 font-bold" data-testid="threshold">
                    Baraj: {required.run} puan / {required.pairs} çift
                  </span>
                )}
                {stagedMelds.map((m, i) => (
                  <span key={i} className="flex items-center gap-1 rounded bg-emerald-900/60 px-1.5 py-0.5">
                    Per {i + 1} ({m.tileIds.length})
                    <button aria-label="Peri kaldır" onClick={() => g.unstageMeld(i)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {stagedPairs.map((p, i) => (
                  <span key={i} className="flex items-center gap-1 rounded bg-sky-900/60 px-1.5 py-0.5">
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
            <DiscardPile tiles={view.hand.discards[pos.bottom]} okey={okey} label="Taş atma alanı (sürükleyip bırakın)" dropTarget />
          </div>
        </div>

        {/* Aksiyonlar */}
        {mySeat !== null && view.phase === "playing" && (
          <div className="flex flex-wrap items-center justify-center gap-1 bg-felt-950/70 px-1 py-1" data-testid="actions">
            {legal.has("DRAW_TILE") && <Button size="sm" onClick={() => act({ type: "DRAW_TILE" })} disabled={busy}>Taş çek</Button>}
            {legal.has("TAKE_DISCARD") && <Button size="sm" variant="secondary" onClick={() => act({ type: "TAKE_DISCARD" })} disabled={busy}>Yandan al</Button>}
            {legal.has("RETURN_DISCARD") && (
              <Button size="sm" variant="danger" onClick={() => act({ type: "RETURN_DISCARD" })} disabled={busy}>
                Geri bırak{view.rules.penaltiesEnabled ? ` (+${view.rules.failedTakePenalty})` : ""}
              </Button>
            )}
            {legal.has("OPEN_MELDS") && (
              <>
                <Button size="sm" variant="secondary" onClick={g.stageMeld} disabled={selected.length < 3}>Per oluştur</Button>
                <Button size="sm" variant="success" disabled={busy || stagedMelds.length === 0} onClick={() => act({ type: "OPEN_MELDS", melds: stagedMelds })}>
                  {opened ? "Per aç" : "Seri aç"}
                </Button>
              </>
            )}
            {legal.has("OPEN_PAIRS") && (
              <>
                <Button size="sm" variant="secondary" onClick={g.stagePair} disabled={selected.length !== 2}>Çift oluştur</Button>
                <Button size="sm" variant="success" disabled={busy || stagedPairs.length === 0} onClick={() => act({ type: "OPEN_PAIRS", pairs: stagedPairs })}>
                  Çift aç
                </Button>
              </>
            )}
            {legal.has("ADD_TO_MELD") && (
              <Button size="sm" variant={addMode ? "default" : "secondary"} disabled={!selectedOne} onClick={() => setAddMode((v) => !v)}>
                {addMode ? "Per seçin…" : "Taş işle"}
              </Button>
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
          <Rack tiles={view.myHand} okey={okey} highlights={highlights} showJokerMark={assisted} onDropOutside={onDropOutside} />
        ) : (
          <div className="bg-felt-950/80 p-3 text-center text-sm text-white/60">Seyirci modundasınız. Oyuncuların taşları gizlidir.</div>
        )}
      </div>

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
          onHome={() => router.push("/dashboard")}
        />
      )}
      <Dialog open={confirmDiscard !== null} onClose={() => setConfirmDiscard(null)} title={view.myHand.length === 1 ? "Eli bitir" : "Taş at"}>
        {confirmDiscard && (
          <div className="space-y-4">
            <p className="text-sm text-white/80">
              {view.myHand.length === 1 ? "Son taşınızı atarak eli bitirmek istiyor musunuz?" : "Seçili taşı atmak istiyor musunuz?"}
              {assisted && assist?.targets[confirmDiscard] && view.rules.penaltiesEnabled && (
                <b className="mt-1 block text-red-300">Dikkat: Bu taş masadaki bir pere işlenebilir (işlek taş cezası +{view.rules.discardPlayablePenalty}).</b>
              )}
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
    <Dialog open onClose={onClose} title="Okeyi nereye koyacaksınız?">
      <p className="mb-3 text-sm text-white/70">Geri aldığınız okey aynı hamlede kullanılmalıdır.</p>
      <div className="space-y-2">
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
        {options.length === 0 && others.length < 2 && (
          <p className="text-sm text-amber-300">Okeyi kullanabileceğiniz bir yer yok. Önce yeni per için en az iki taş seçin.</p>
        )}
      </div>
    </Dialog>
  );
}

export { play };
