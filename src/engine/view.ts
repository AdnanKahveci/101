import { getLegalActions, prevSeat, requiredPairCount, requiredRunPoints } from "./game";
import type {
  Face,
  GameActionType,
  GameState,
  HandResult,
  MatchPhase,
  OpenedInfo,
  PenaltyRecord,
  RuleProfile,
  Seat,
  TableMeld,
  TablePair,
  Tile,
  TileId,
  TurnPhase,
} from "./types";

export interface PublicPlayer {
  seat: Seat;
  userId: string;
  displayName: string;
  tileCount: number;
  opened: OpenedInfo | null;
  team: 0 | 1 | null;
}

/**
 * Bir oyuncuya (veya seyirciye) gönderilen oyun görünümü.
 * Diğer oyuncuların gizli taşlarını ve destenin sırasını ASLA içermez.
 */
export interface GameView {
  matchId: string;
  roomId: string;
  version: number;
  phase: MatchPhase;
  rules: RuleProfile;
  mySeat: Seat | null;
  players: PublicPlayer[];
  myHand: Tile[];
  hand: {
    handNumber: number;
    dealer: Seat;
    firstPlayer: Seat;
    indicator: Tile;
    okey: Face;
    drawPileCount: number;
    discards: Record<Seat, Tile[]>;
    melds: TableMeld[];
    pairs: TablePair[];
    currentTurn: Seat;
    turnPhase: TurnPhase;
    turnNumber: number;
    turnDeadline: number | null;
    myDrawnTileId: TileId | null;
    myTakeObligation: TileId | null;
    indicatorTakenBy: Seat | null;
    myIndicatorPending: boolean;
    requiredRunPoints: number;
    requiredPairCount: number;
    penalties: PenaltyRecord[];
    /** El bittikten sonra herkesin kalan taşları gösterilir (el sona erdiği için gizli bilgi değildir). */
    revealedHands: Record<Seat, Tile[]> | null;
  };
  handResults: HandResult[];
  totals: Record<Seat, number>;
  readyForNext: Seat[];
  winner: GameState["winner"];
  legalActions: GameActionType[];
}

export function getPlayerView(state: GameState, viewerSeat: Seat | null): GameView {
  const h = state.hand;
  const isMine = (s: Seat) => viewerSeat !== null && s === viewerSeat;
  const handOver = state.phase !== "playing";
  const thresholdSeat = viewerSeat ?? h.currentTurn;
  return {
    matchId: state.matchId,
    roomId: state.roomId,
    version: state.version,
    phase: state.phase,
    rules: state.rules,
    mySeat: viewerSeat,
    players: state.players.map((p) => ({
      seat: p.seat,
      userId: p.userId,
      displayName: p.displayName,
      tileCount: h.hands[p.seat].length,
      opened: h.opened[p.seat],
      team: state.rules.teamMode ? ((p.seat % 2) as 0 | 1) : null,
    })),
    myHand: viewerSeat !== null ? h.hands[viewerSeat].map((t) => ({ ...t })) : [],
    hand: {
      handNumber: h.handNumber,
      dealer: h.dealer,
      firstPlayer: h.firstPlayer,
      indicator: h.indicator,
      okey: h.okey,
      drawPileCount: h.drawPile.length,
      discards: h.discards,
      melds: h.melds,
      pairs: h.pairs,
      currentTurn: h.currentTurn,
      turnPhase: h.turnPhase,
      turnNumber: h.turnNumber,
      turnDeadline: h.turnDeadline,
      myDrawnTileId: isMine(h.currentTurn) ? h.drawnTileId : null,
      myTakeObligation: isMine(h.currentTurn) ? h.takeObligation?.tileId ?? null : null,
      /** Göstergeyi çift için alan oyuncu (çiftte kullanılmışsa da dolu kalır) */
      indicatorTakenBy: h.indicatorTaken?.seat ?? null,
      /** Gösterge elimde ve henüz çiftte kullanılmadı */
      myIndicatorPending: viewerSeat !== null && h.indicatorTaken?.seat === viewerSeat && !h.indicatorTaken.inPair,
      requiredRunPoints: requiredRunPoints(state, thresholdSeat),
      requiredPairCount: requiredPairCount(state, thresholdSeat),
      penalties: h.penalties,
      revealedHands: handOver ? h.hands : null,
    },
    handResults: state.handResults,
    totals: state.totals,
    readyForNext: state.readyForNext,
    winner: state.winner,
    legalActions: viewerSeat !== null ? getLegalActions(state, viewerSeat) : [],
  };
}

/** Görünümdeki yandan alınabilecek taş (önceki oyuncunun son attığı). */
export function takeableDiscard(view: GameView): Tile | null {
  if (view.mySeat === null) return null;
  const pile = view.hand.discards[prevSeat(view.mySeat)];
  return pile[pile.length - 1] ?? null;
}
