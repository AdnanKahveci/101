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

/** Hızlı laflar: kıraathane ağzı. */
export const QUICK_LINES = ["Hayırlı oyunlar!", "Kolay gelsin", "Eyvallah", "Hadi bakalım", "Ocağına sağlık", "Bu el bizim", "Oha!", "Elinize sağlık"];

export interface ChatMessage {
  id: string;
  ts: number;
  seat: number;
  name: string;
  kind: "text" | "drink" | "emote";
  text?: string;
  drink?: DrinkId;
  emote?: EmoteId;
  /** İkramın / atışmanın gönderildiği koltuk; null = masaya (herkese) */
  to?: number | null;
}

export const CHAT_MAX_LEN = 200;
