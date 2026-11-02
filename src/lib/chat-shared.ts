/** Masa sohbeti: sunucu ve istemcinin paylaştığı tipler ve kıraathane ikramları. */

export const DRINKS = {
  cay: { label: "Çay", emoji: "🍵", line: "bir ince belli çay ısmarladı" },
  oralet: { label: "Oralet", emoji: "🍊", line: "bir oralet ısmarladı" },
  kahve: { label: "Türk kahvesi", emoji: "☕", line: "bir orta şekerli Türk kahvesi ısmarladı" },
  adacayi: { label: "Ada çayı", emoji: "🌿", line: "bir ada çayı ısmarladı" },
  sahlep: { label: "Sahlep", emoji: "🥛", line: "bir tarçınlı sahlep ısmarladı" },
  gazoz: { label: "Gazoz", emoji: "🥤", line: "bir buz gibi gazoz ısmarladı" },
  su: { label: "Su", emoji: "💧", line: "bir bardak su ısmarladı" },
  simit: { label: "Simit", emoji: "🥨", line: "bir susamlı simit ısmarladı" },
} as const;

export type DrinkId = keyof typeof DRINKS;
export const DRINK_IDS = Object.keys(DRINKS) as [DrinkId, ...DrinkId[]];

/** Atışma emojileri: rakibe fırlatılır, kısa süre yanında patlar. */
export const EMOTES = {
  ortaparmak: { label: "Orta parmak", emoji: "🖕" },
  patlican: { label: "Patlıcan", emoji: "🍆" },
  palyaco: { label: "Palyaço", emoji: "🤡" },
  kaka: { label: "Kaka", emoji: "💩" },
  koyun: { label: "Koyun", emoji: "🐑" },
  kaplumbaga: { label: "Kaplumbağa (yavaş oyna!)", emoji: "🐢" },
  uyku: { label: "Uyudun mu?", emoji: "😴" },
  gulme: { label: "Gülmekten öldüm", emoji: "🤣" },
  sinir: { label: "Sinir", emoji: "🤬" },
  begenmedim: { label: "Beğenmedim", emoji: "👎" },
  alkis: { label: "Alkış", emoji: "👏" },
  aglama: { label: "Ağla", emoji: "😭" },
} as const;

export type EmoteId = keyof typeof EMOTES;
export const EMOTE_IDS = Object.keys(EMOTES) as [EmoteId, ...EmoteId[]];

/**
 * Eşe işaret: kıraathanenin ezeli "işaretleşme" geleneği. Eşine (eşsiz masada istediğin oyuncuya) hareket yaparsın.
 * `anim`: hedefte nasıl görüneceği. Gizli gönderilirse yalnızca karşı taraf görür ama yakalanma ihtimali vardır.
 */
export const GESTURES = {
  gozkirp: { label: "Göz kırp", emoji: "😉", line: "göz kırptı", anim: "wink" },
  kas: { label: "Kaş göz yap", emoji: "🤨", line: "kaş göz yaptı", anim: "wink" },
  tekme: { label: "Masanın altından tekme", emoji: "🦶", line: "masanın altından tekme attı", anim: "kick" },
  burun: { label: "Burun kaşı (okey bende!)", emoji: "👃", line: "burnunu kaşıdı… okey bende demek bu!", anim: "wink" },
  kulak: { label: "Kulak çek (çifte gidiyorum)", emoji: "👂", line: "kulağını çekti… çifte gidiyor!", anim: "wink" },
  sus: { label: "Sus, belli etme", emoji: "🤫", line: "\u201cSus, belli etme!\u201d dedi", anim: "wink" },
  omuz: { label: "Sırtını sıvazla", emoji: "🤗", line: "sırtını sıvazladı", anim: "pat" },
  yalvar: { label: "O taşı at, ne olur", emoji: "🙏", line: "\u201cNe olur o taşı at!\u201d diye yalvardı", anim: "pat" },
  facepalm: { label: "Ne yaptın sen?!", emoji: "🤦", line: "\u201cNe yaptın sen?!\u201d diye kafasını tuttu", anim: "shake" },
  pazi: { label: "Bu el bizim", emoji: "💪", line: "\u201cBu el bizim!\u201d diye pazı gösterdi", anim: "pat" },
  ter: { label: "Ter döküyorum", emoji: "😰", line: "ter döküyor, yardım istiyor", anim: "shake" },
  opucuk: { label: "Öpücük", emoji: "😘", line: "öpücük yolladı", anim: "pat" },
} as const;

export type GestureId = keyof typeof GESTURES;
export const GESTURE_IDS = Object.keys(GESTURES) as [GestureId, ...GestureId[]];
/** Gizli işaretin rakiplerce yakalanma olasılığı */
export const GESTURE_CATCH_CHANCE = 0.3;

/** Hızlı laflar: kıraathane ağzı. */
export const QUICK_LINES = ["Hayırlı oyunlar!", "Kolay gelsin", "Eyvallah", "Hadi bakalım", "Ocağına sağlık", "Bu el bizim", "Oha!", "Elinize sağlık"];

export interface ChatMessage {
  id: string;
  ts: number;
  seat: number;
  name: string;
  kind: "text" | "drink" | "emote" | "gesture";
  text?: string;
  drink?: DrinkId;
  emote?: EmoteId;
  gesture?: GestureId;
  /** Gizli işaret (yalnızca gönderen ve alan görür; yakalanırsa herkes görür) */
  secret?: boolean;
  /** Gizli işaret rakiplerce yakalandı */
  caught?: boolean;
  /** Yalnızca bu koltuklar görür (sunucu süzer). Yoksa herkes. */
  visibleTo?: number[];
  /** İkramın / atışmanın gönderildiği koltuk; null = masaya (herkese) */
  to?: number | null;
}

export const CHAT_MAX_LEN = 200;
