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

describe("Masalarım listesinden kaldırma", () => {
  it("lobideki oda: ayrılır; yalnız botlu maç: kapanır; başkalarıyla maç: koltuk korunur, liste gizlenir, geri katılınca görünür", async () => {
    const { myRooms, removeFromMyRooms, joinRoom, setReady } = await import("@/server/rooms");
    const A = await makePlayer("Kaldiran");
    const B = await makePlayer("Diger");

    const lobby = await createRoom(A.user, { name: "Lobi", visibility: "private" });
    expect((await myRooms(A.user.id)).some((r) => r.code === lobby.code)).toBe(true);
    expect((await removeFromMyRooms(lobby.code, A.user)).closed).toBe(true);
    expect((await myRooms(A.user.id)).some((r) => r.code === lobby.code)).toBe(false);

    const solo = await createRoom(A.user, { name: "Solo", visibility: "private" });
    await addBots(solo.code, A.user);
    await startMatch(solo.code, A.user);
    expect((await removeFromMyRooms(solo.code, A.user)).closed).toBe(true);
    expect((await myRooms(A.user.id)).some((r) => r.code === solo.code)).toBe(false);

    const duo = await createRoom(A.user, { name: "Ikili", visibility: "private" });
    await joinRoom(duo.code, B.user, {});
    await setReady(duo.code, B.user, true);
    await addBots(duo.code, A.user);
    const { matchId } = await startMatch(duo.code, A.user);
    expect((await removeFromMyRooms(duo.code, A.user)).closed).toBe(false);
    expect((await myRooms(A.user.id)).some((r) => r.code === duo.code)).toBe(false);
    expect((await loadState(matchId)).players.some((p) => p.userId === A.user.id)).toBe(true);
    expect((await myRooms(B.user.id)).find((r) => r.code === duo.code)?.status).toBe("playing");
    await joinRoom(duo.code, A.user, {});
    expect((await myRooms(A.user.id)).some((r) => r.code === duo.code)).toBe(true);
  }, 60_000);
});
