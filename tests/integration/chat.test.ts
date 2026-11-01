import { describe, expect, it } from "vitest";
import { addBots, createRoom, startMatch } from "@/server/rooms";
import { chatHistory, cleanChatText, sendChat } from "@/server/chat";
import { AppError } from "@/server/errors";
import { makePlayer, useInfra } from "./env";

useInfra();

describe("Masa sohbeti ve ikramlar", () => {
  it("oyuncu yazar ve ikram eder; geçmiş tutulur; masada olmayan yazamaz; bot teşekkür eder", async () => {
    const A = await makePlayer("Sohbetci");
    const B = await makePlayer("Yabanci");
    const room = await createRoom(A.user, { name: "Çay Ocağı", visibility: "private" });
    await addBots(room.code, A.user);
    const { matchId } = await startMatch(room.code, A.user);

    const m1 = await sendChat(A.user, matchId, { text: "  Hayırlı   oyunlar‮!  " });
    expect(m1.text).toBe("Hayırlı oyunlar !");
    const m2 = await sendChat(A.user, matchId, { drink: "cay", to: null });
    expect(m2.kind).toBe("drink");

    await expect(sendChat(B.user, matchId, { text: "selam" })).rejects.toBeInstanceOf(AppError);
    await expect(sendChat(A.user, matchId, { text: "   " })).rejects.toBeInstanceOf(AppError);
    await expect(sendChat(A.user, matchId, { drink: "cay", to: m1.seat })).rejects.toBeInstanceOf(AppError); // kendine ikram

    const e1 = await sendChat(A.user, matchId, { emote: "patlican", to: (m1.seat + 1) % 4 });
    expect(e1).toMatchObject({ kind: "emote", emote: "patlican", to: (m1.seat + 1) % 4 });
    await expect(sendChat(A.user, matchId, { emote: "ortaparmak", to: m1.seat })).rejects.toBeInstanceOf(AppError); // kendine olmaz
    await new Promise((r) => setTimeout(r, 3500));
    const h = await chatHistory(matchId);
    expect(h.slice(0, 3).map((m) => m.id)).toEqual([m1.id, m2.id, e1.id]);
    expect(h.some((m) => m.seat !== m1.seat && m.kind === "text" && m.text?.startsWith("Sohbetci"))).toBe(true);
  }, 30_000);

  it("metin temizleme ve uzunluk sınırı", () => {
    expect(cleanChatText("a\n\tb")).toBe("a b");
    expect(cleanChatText("x".repeat(500))).toHaveLength(200);
  });
});
