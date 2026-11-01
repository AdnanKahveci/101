import { describe, expect, it } from "vitest";
import { addBots, createRoom, getRoom, removeBot, startMatch } from "@/server/rooms";
import { loadState, processCommand } from "@/server/game-service";
import { runBots } from "@/server/bots";
import { AppError } from "@/server/errors";
import { getLegalActions } from "@/engine";
import { makePlayer, useInfra } from "./env";

useInfra();

describe("Bot oyuncular", () => {
  it("tek oyuncu boş koltukları botlarla doldurup maçı başlatabilir; botlar sıra insana gelene kadar oynar", async () => {
    const A = await makePlayer("Tekci");
    const room = await createRoom(A.user, { name: "Tek Masa", visibility: "private" });
    const view = await addBots(room.code, A.user);
    const bots = view.members.filter((m) => m.isBot);
    expect(bots).toHaveLength(3);
    expect(bots.every((b) => b.ready && b.seat !== null)).toBe(true);

    // Bot çıkarılabilir ve yeniden eklenebilir; insan oyuncu bot diye çıkarılamaz
    const after = await removeBot(room.code, A.user, bots[0].userId);
    expect(after.members.filter((m) => m.isBot)).toHaveLength(2);
    await expect(removeBot(room.code, A.user, A.user.id)).rejects.toBeInstanceOf(AppError);
    await addBots(room.code, A.user);

    const { matchId } = await startMatch(room.code, A.user);
    const humanSeat = (await loadState(matchId)).players.find((p) => p.userId === A.user.id)!.seat;

    // Birkaç tur: botlar oynar, sonra insan "çek + at" yapar
    for (let round = 0; round < 60; round++) {
      await runBots(matchId, { delayMs: 0 });
      const st = await loadState(matchId);
      if (st.phase !== "playing") break;
      expect(st.hand.currentTurn).toBe(humanSeat);
      const legal = getLegalActions(st, humanSeat);
      let v = st.version;
      if (legal.includes("DRAW_TILE")) {
        const r = await processCommand(A.user, { commandId: `d${round}`, matchId, expectedVersion: v, action: { type: "DRAW_TILE" } });
        v = r.version;
      }
      const st2 = await loadState(matchId);
      const tile = st2.hand.hands[humanSeat][0];
      await processCommand(A.user, { commandId: `x${round}`, matchId, expectedVersion: v, action: { type: "DISCARD_TILE", tileId: tile.id } });
    }
    const final = await loadState(matchId);
    expect(final.hand.turnNumber + final.handResults.length * 100).toBeGreaterThan(10);
    // Botlar sunucu komut hattından gerçekten açabiliyor (en az bir bot açılışı veya el sonu)
    const botSeats = final.players.filter((p) => p.userId !== A.user.id).map((p) => p.seat);
    const botOpened = botSeats.some((s) => final.hand.opened[s]) || final.handResults.length > 0;
    expect(botOpened).toBe(true);
    const r = await getRoom(room.code, A.user);
    expect(r.access).toBe("full");
  }, 60_000);
});
