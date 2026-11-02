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

  it("eşe işaret: açık işaret herkese, gizli işaret yalnızca iki tarafa görünür (yakalanmadıysa)", async () => {
    const A = await makePlayer("Isaretci");
    const room = await createRoom(A.user, { name: "İşaret Masası", visibility: "private" });
    await addBots(room.code, A.user);
    const { matchId } = await startMatch(room.code, A.user);
    const me = (await sendChat(A.user, matchId, { text: "selam" })).seat;
    const partner = (me + 2) % 4;
    const rival = (me + 1) % 4;

    const open = await sendChat(A.user, matchId, { gesture: "tekme", to: partner });
    expect(open).toMatchObject({ kind: "gesture", gesture: "tekme", to: partner });
    expect(open.visibleTo).toBeUndefined();
    await expect(sendChat(A.user, matchId, { gesture: "gozkirp", to: null })).rejects.toBeInstanceOf(AppError);
    await expect(sendChat(A.user, matchId, { gesture: "gozkirp", to: me })).rejects.toBeInstanceOf(AppError);

    const rnd = Math.random;
    try {
      Math.random = () => 0.99; // yakalanmasın
      const hidden = await sendChat(A.user, matchId, { gesture: "burun", to: partner, secret: true });
      expect(hidden).toMatchObject({ secret: true, caught: false, visibleTo: [me, partner] });
      Math.random = () => 0; // yakalansın
      const caught = await sendChat(A.user, matchId, { gesture: "kulak", to: partner, secret: true });
      expect(caught).toMatchObject({ secret: true, caught: true });
      expect(caught.visibleTo).toBeUndefined();

      const forPartner = await chatHistory(matchId, partner);
      const forRival = await chatHistory(matchId, rival);
      expect(forPartner.some((m) => m.id === hidden.id)).toBe(true);
      expect(forRival.some((m) => m.id === hidden.id)).toBe(false);
      expect(forRival.some((m) => m.id === caught.id)).toBe(true);
      expect(forRival.some((m) => m.id === open.id)).toBe(true);
      expect(await chatHistory(matchId, null)).not.toContainEqual(expect.objectContaining({ id: hidden.id }));
    } finally {
      Math.random = rnd;
    }
  }, 30_000);

  it("metin temizleme ve uzunluk sınırı", () => {
    expect(cleanChatText("a\n\tb")).toBe("a b");
    expect(cleanChatText("x".repeat(500))).toHaveLength(200);
  });
});
