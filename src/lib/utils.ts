import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function newCommandId(): string {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");
}

export const SEAT_NAMES = ["Alt", "Sağ", "Üst", "Sol"] as const;

export const AVATAR_EMOJI: Record<string, string> = {
  cay: "🍵",
  simit: "🥯",
  lale: "🌷",
  nazar: "🧿",
  kedi: "🐈",
  marti: "🕊️",
  zeytin: "🫒",
  lokum: "🍬",
  kahve: "☕",
  cinar: "🌳",
};
export const AVATARS = Object.keys(AVATAR_EMOJI);
