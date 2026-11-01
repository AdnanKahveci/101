/**
 * 101 Okey oyun motoru tipleri.
 * Bu modül React/Next.js'den tamamen bağımsızdır.
 */

export type Color = "red" | "yellow" | "blue" | "black";
export const COLORS: readonly Color[] = ["red", "yellow", "blue", "black"] as const;

export const COLOR_LABELS: Record<Color, string> = {
  red: "Kırmızı",
  yellow: "Sarı",
  blue: "Mavi",
  black: "Siyah",
};

export type TileId = string;

/** Fiziksel bir taş. Sahte okeyler için color/value null'dır. */
export interface Tile {
  id: TileId;
  color: Color | null;
  value: number | null;
  copyIndex: 0 | 1;
  isFakeJoker: boolean;
}

/** Taşın "yüzü" (renk + sayı). */
export interface Face {
  color: Color;
  value: number;
}

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: readonly Seat[] = [0, 1, 2, 3] as const;

export type MeldKind = "run" | "group";

/** Masadaki bir perin tek hücresi: hangi taş, hangi yüzü temsil ediyor. */
export interface MeldCell {
  tileId: TileId;
  color: Color;
  /** Temsil edilen değer. 13'ten sonra gelen 1 için 14 kullanılır (yalnızca ilgili kural açıksa). */
  value: number;
  isJoker: boolean;
}

export interface TableMeld {
  id: string;
  kind: MeldKind;
  owner: Seat;
  cells: MeldCell[];
}

export interface TablePair {
  id: string;
  owner: Seat;
  tileIds: [TileId, TileId];
  face: Face;
}

export type TeamOpeningPolicy = "table" | "independent" | "partnerBase";
export type JokerReplacePolicy = "disabled" | "openedOnly";
export type TimeoutPolicy = "autoPlay" | "wait";
export type DeckExhaustedScoring = "penalties" | "noScore";

/**
 * Masanın kural profili. Maç başladığında dondurulur.
 * Ayrıntılı açıklama: docs/GAME_RULES.md ve docs/RULE_VARIANTS.md
 */
export interface RuleProfile {
  profileName: string;
  teamMode: boolean;
  folding: boolean; // katlamalı
  assisted: boolean; // yardımlı
  penaltiesEnabled: boolean; // cezalı
  allowRunOpening: boolean;
  allowPairOpening: boolean;
  /** 12-13-1 ve 11-12-13-1 gibi 13'ten sonra 1 gelen dizilimler. 13-1-2 her zaman geçersizdir. */
  allowThirteenOne: boolean;
  /** 13'ten sonra gelen 1'in puan değeri. */
  aceAfterThirteenPoints: number;
  minOpeningPoints: number; // 101
  minOpeningPairs: number; // 5
  allowJokerPair: boolean; // okey + herhangi taş = çift
  allowDoubleJokerPair: boolean; // okey + okey = çift
  pairOpenerCanAddToMelds: boolean;
  pairOpenerCanOpenMelds: boolean;
  meldOpenerCanOpenPairs: boolean;
  teamOpeningPolicy: TeamOpeningPolicy;
  jokerReplacePolicy: JokerReplacePolicy;
  /** Okey göstergesi sahte okey çıkarsa yeni gösterge seçilir. */
  redrawFakeJokerIndicator: boolean;
  // Puanlama
  finishScore: number; // -101
  jokerFinishScore: number; // -202
  pairFinishScore: number; // -202
  handFinishScore: number; // elden bitiş -202
  handJokerFinishScore: number; // elden okeyle -404
  unopenedPenalty: number; // +202
  jokerInHandPenalty: number; // +101
  jokerFinishMultiplier: number; // 2
  pairFinishMultiplier: number; // 2
  handFinishMultiplier: number; // 2
  stackMultipliers: boolean;
  pairOpenerHandMultiplier: number; // 2
  partnerOfFinisherScoresZero: boolean;
  discardJokerPenalty: number; // 101
  discardPlayablePenalty: number; // 101 (işlek taş)
  failedTakePenalty: number; // 101 (yandan alıp kullanamama)
  /** Yandan alınan taşla seri açılır/işlenirse taşı ATAN oyuncuya taş değeri × bu çarpan ceza (10) */
  takenTileMeldMultiplier?: number;
  /** Rakibin perindeki okey gerçek taşla alınırsa per sahibine ceza (101) */
  jokerTakenPenalty?: number;
  /**
   * Kafadan bitiş: kimse açmamışken bir oyuncu ilk açışında (tek turda açıp) biterse
   * bitirene ve eşine puan yazılmaz, rakiplerin her birine bu ceza yazılır (404).
   */
  headFinishPenalty?: number;
  /** Yandan alınan taşla çift açılırsa taşı ATAN oyuncuya taş değeri × bu çarpan ceza (20) */
  takenTilePairMultiplier?: number;
  silerEnabled: boolean;
  deckExhaustedScoring: DeckExhaustedScoring;
  // Maç
  totalHands: number;
  turnSeconds: number; // 0 = süresiz
  timeoutPolicy: TimeoutPolicy;
}

export type TurnPhase = "awaitingDraw" | "awaitingAction";

export type FinishType =
  | "normal"
  | "joker"
  | "pairs"
  | "hand"
  | "handJoker"
  | "deckExhausted";

export const FINISH_LABELS: Record<FinishType, string> = {
  normal: "Normal bitiş",
  joker: "Okey atarak bitiş",
  pairs: "Çiftten bitiş",
  hand: "Elden bitiş",
  handJoker: "Elden okeyle bitiş",
  deckExhausted: "Deste bitti",
};

export interface OpenedInfo {
  kind: "melds" | "pairs";
  /** Seri açılışta puan, çift açılışta çift sayısı. */
  value: number;
  turnNumber: number;
}

export interface PenaltyRecord {
  seat: Seat;
  amount: number;
  reason: string;
  turnNumber: number;
}

export interface TakeObligation {
  tileId: TileId;
  /** Alınmadan önce oyuncunun açık olup olmadığı. */
  wasOpened: boolean;
  fromSeat: Seat;
}

export interface HandState {
  handNumber: number; // 1'den başlar
  dealer: Seat;
  firstPlayer: Seat;
  indicator: Tile;
  okey: Face;
  drawPile: Tile[];
  /** Her koltuğun attığı taşlar (son eleman en üstte). */
  discards: Record<Seat, Tile[]>;
  hands: Record<Seat, Tile[]>;
  melds: TableMeld[];
  pairs: TablePair[];
  opened: Record<Seat, OpenedInfo | null>;
  highestRunOpening: { seat: Seat; value: number }[];
  highestPairOpening: { seat: Seat; value: number }[];
  currentTurn: Seat;
  turnPhase: TurnPhase;
  turnNumber: number;
  /** Bu turda çekilen taş. */
  drawnTileId: TileId | null;
  takeObligation: TakeObligation | null;
  /**
   * Göstergeyle çift: göstergenin eşini elinde tutan oyuncu ilk açılışında masadaki göstergeyi alıp
   * eşiyle çift yapabilir. inPair=false iken taş elde, aynı hamlede çiftte kullanılmalı veya geri bırakılmalı.
   */
  indicatorTaken?: { seat: Seat; inPair: boolean } | null;
  /** Oyuncunun bu turun başında açık olup olmadığı (elden bitiş için). */
  openedAtTurnStart: boolean;
  penalties: PenaltyRecord[];
  turnDeadline: number | null; // epoch ms
  nextMeldSeq: number;
}

export interface ScoreLine {
  seat: Seat;
  label: string;
  amount: number;
}

export interface HandResult {
  handNumber: number;
  dealer: Seat;
  firstPlayer: Seat;
  indicator: Tile;
  okey: Face;
  finisher: Seat | null;
  finishType: FinishType;
  multiplier: number;
  appliedMultipliers: { label: string; factor: number }[];
  playerScores: Record<Seat, number>;
  teamScores: [number, number] | null;
  breakdown: ScoreLine[];
  penalties: PenaltyRecord[];
  bonuses: ScoreLine[];
  reasons: string[];
}

export type MatchPhase = "playing" | "handResult" | "finished";

export interface PlayerInfo {
  seat: Seat;
  userId: string;
  displayName: string;
}

export interface GameState {
  matchId: string;
  roomId: string;
  rules: RuleProfile;
  players: PlayerInfo[];
  phase: MatchPhase;
  startDealer: Seat;
  hand: HandState;
  handResults: HandResult[];
  totals: Record<Seat, number>;
  readyForNext: Seat[];
  /** Her başarılı aksiyonda bir artar (optimistic concurrency). */
  version: number;
  createdAt: number;
  updatedAt: number;
  winner: { seats: Seat[]; team: 0 | 1 | null } | null;
}

// --------------------------------------------------------------- Aksiyonlar

export interface MeldSpec {
  tileIds: TileId[];
  kind?: MeldKind;
  /** Okeylerin temsil edeceği yüzler (isteğe bağlı). */
  jokerFaces?: Record<TileId, Face>;
}

export type JokerUse =
  | { type: "newMeld"; meld: MeldSpec } // meld.tileIds içinde geri alınan okey bulunmalı
  | { type: "addToMeld"; meldId: string; side?: "start" | "end" };

export type GameAction =
  | { type: "DRAW_TILE" }
  | { type: "TAKE_DISCARD" }
  | { type: "RETURN_DISCARD" }
  | { type: "TAKE_INDICATOR" }
  | { type: "RETURN_INDICATOR" }
  | { type: "OPEN_MELDS"; melds: MeldSpec[] }
  | { type: "OPEN_PAIRS"; pairs: [TileId, TileId][] }
  | { type: "ADD_TO_MELD"; meldId: string; tileId: TileId; side?: "start" | "end" }
  /** jokerUse verilmezse geri alınan okey ıstakaya (ele) gelir. */
  | { type: "REPLACE_JOKER"; meldId: string; tileId: TileId; jokerUse?: JokerUse }
  | { type: "DISCARD_TILE"; tileId: TileId }
  | { type: "FINISH_HAND"; tileId: TileId }
  | { type: "READY_NEXT_HAND" }
  | { type: "TIMEOUT" };

export type GameActionType = GameAction["type"];

export interface GameEvent {
  type: string;
  seat: Seat | null;
  /** Herkese açık olay verisi; gizli taş bilgisi içermez. */
  data: Record<string, unknown>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
