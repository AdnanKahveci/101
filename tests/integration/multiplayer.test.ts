import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { createRoom, getRoom, joinRoom, selectSeat, setReady, startMatch, updateRoom, moveMember, leaveRoom, inviteToRoom, myInvitations, respondInvitation } from "@/server/rooms";
import { loadState, processCommand } from "@/server/game-service";
import { friendsOverview, matchHistory, profile, respondFriendRequest, sendFriendRequest } from "@/server/social";
import { AppError } from "@/server/errors";
import { createTileSet, type Seat } from "@/engine";
import { TestClient, makePlayer, startInstance, useInfra, type TestPlayer } from "./env";
import { botTurn, type BotStats } from "./bot";

useInfra();

let instA: Awaited<ReturnType<typeof startInstance>>;
let instB: Awaited<ReturnType<typeof startInstance>>;
let A: TestPlayer, B: TestPlayer, C: TestPlayer, D: TestPlayer;

beforeAll(async () => {
  instA = await startInstance();
  instB = await startInstance();
  A = await makePlayer("Ayse");
  B = await makePlayer("Bora", true);
  C = await makePlayer("Cem", true);
  D = await makePlayer("Deniz");
});
afterAll(async () => {
  await instA?.close();
  await instB?.close();
});

async function expectAppError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe(code);
    return (e as AppError).message;
  }
  throw new Error(`${code} hatası bekleniyordu`);
}

describe("Oda ve davet sistemi", () => {
  it("özel odaya davet belirteci olmadan katılılamaz, şifre ve belirteç kontrol edilir", async () => {
    const room = await createRoom(A.user, { name: "Gizli Masa", visibility: "private", password: "1234" });
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.inviteToken).toBeTruthy();
    // Belirteçsiz, şifresiz
    await expectAppError(joinRoom(room.code, B.user, {}), "FORBIDDEN");
    // Yanlış şifre
    await expectAppError(joinRoom(room.code, B.user, { password: "0000" }), "FORBIDDEN");
    // Belirteçsiz kullanıcı yalnızca sınırlı bilgi görür
    const limited = await getRoom(room.code, B.user);
    expect(limited.access).toBe("limited");
    expect(JSON.stringify(limited)).not.toContain(room.inviteToken!);
    // Doğru şifre
    const joined = await joinRoom(room.code, B.user, { password: "1234" });
    expect(joined.members.find((m) => m.userId === B.user.id)?.seat).toBe(1);
    // Davet linki (belirteç) şifreyi atlar
    const viaLink = await joinRoom(room.code, C.user, { token: room.inviteToken });
    expect(viaLink.isMember).toBe(true);
    // Tekrar katılma çifte üyelik oluşturmaz
    await joinRoom(room.code, C.user, { token: room.inviteToken });
    const db = await getDb();
    const rows = await db.select().from(schema.roomMembers).where(eq(schema.roomMembers.roomId, room.id));
    expect(rows.filter((r) => r.userId === C.user.id)).toHaveLength(1);
  });

  it("arkadaşlık isteği → kabul → özel odaya arkadaş daveti → davetle katılım; reddedilen davet giriş vermez", async () => {
    const F = await makePlayer("Fatma");
    const G = await makePlayer("Gokhan");
    await expectAppError(sendFriendRequest(B.user, "fatma"), "FORBIDDEN"); // misafir arkadaş ekleyemez
    expect((await sendFriendRequest(F.user, "gokhan")).status).toBe("pending");
    const incoming = (await friendsOverview(G.user.id)).incoming;
    expect(incoming.map((r) => r.username)).toEqual(["fatma"]);
    await respondFriendRequest(G.user, incoming[0].id, true);
    expect((await friendsOverview(F.user.id)).friends.map((f) => f.username)).toEqual(["gokhan"]);
    await expectAppError(sendFriendRequest(F.user, "gokhan"), "CONFLICT");

    const room = await createRoom(F.user, { name: "Arkadaş Masası", visibility: "private", password: "4321" });
    // Arkadaş olmayan davet edilemez
    await expectAppError(inviteToRoom(room.code, F.user, D.user.id), "FORBIDDEN");
    // Reddedilen davet sonradan giriş belirteci olarak kullanılamaz
    const first = await inviteToRoom(room.code, F.user, G.user.id);
    await respondInvitation(G.user.id, first.invitationId, false, G.user);
    await expectAppError(joinRoom(room.code, G.user, { invitationId: first.invitationId }), "FORBIDDEN");
    // Yeni davet kabul edilir → oda kodu döner, kullanıcı koltuğa oturur
    const second = await inviteToRoom(room.code, F.user, G.user.id);
    expect((await myInvitations(G.user.id)).map((i) => i.roomCode)).toEqual([room.code]);
    const res = await respondInvitation(G.user.id, second.invitationId, true, G.user);
    expect(res.roomCode).toBe(room.code);
    const view = await getRoom(room.code, G.user);
    expect(view.access === "full" && view.room.isMember).toBe(true);
    expect(await myInvitations(G.user.id)).toHaveLength(0);
  });

  it("şifresiz özel odaya oda koduyla katılınabilir", async () => {
    const H = await makePlayer("Hakan");
    const room = await createRoom(A.user, { name: "Kodlu Masa", visibility: "private" });
    const view = await getRoom(room.code, H.user);
    expect(view.access).toBe("full");
    const joined = await joinRoom(room.code, H.user, {});
    expect(joined.isMember).toBe(true);
  });

  it("iki kişi aynı koltuğu alamaz (eşzamanlı istekler)", async () => {
    const room = await createRoom(A.user, { name: "Koltuk Testi", visibility: "public" });
    await joinRoom(room.code, B.user, {});
    await joinRoom(room.code, C.user, {});
    await selectSeat(room.code, B.user, null);
    await selectSeat(room.code, C.user, null);
    const results = await Promise.allSettled([selectSeat(room.code, B.user, 3), selectSeat(room.code, C.user, 3)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe("CONFLICT");
  });

  it("oda kapasitesi sunucuda korunur; ayarları yalnızca sahibi değiştirir; özel el sayısı doğrulanır", async () => {
    const E = await makePlayer("Ece", true);
    const room = await createRoom(A.user, { name: "Dolu Masa", visibility: "public" });
    for (const p of [B, C, D]) await joinRoom(room.code, p.user, {});
    const full = await joinRoom(room.code, E.user, {});
    expect(full.members.find((m) => m.userId === E.user.id)?.seat).toBeNull(); // seyirci/bekleme
    expect(full.members.filter((m) => m.seat !== null)).toHaveLength(4);
    await expectAppError(updateRoom(room.code, B.user, { settings: { folding: true } }), "FORBIDDEN");
    await expectAppError(updateRoom(room.code, A.user, { settings: { totalHands: 0 } }), "BAD_REQUEST");
    await expectAppError(updateRoom(room.code, A.user, { settings: { totalHands: 999 } }), "BAD_REQUEST");
    const ok = await updateRoom(room.code, A.user, { settings: { totalHands: 13 } });
    expect(ok.settings.totalHands).toBe(13);
    await expectAppError(startMatch(room.code, B.user), "FORBIDDEN");
    await expectAppError(startMatch(room.code, A.user), "BAD_REQUEST"); // kimse hazır değil
    // Oda sahibi koltuk düzenleyebilir (yer değiştirme)
    const moved = await moveMember(room.code, A.user, E.user.id, 2);
    expect(moved.members.find((m) => m.userId === E.user.id)?.seat).toBe(2);
    expect(moved.members.find((m) => m.userId === C.user.id)?.seat).toBeNull();
  });
});

describe("Gerçek zamanlı 4 oyunculu maç (iki sunucu instance'ı)", () => {
  let roomCode = "";
  let matchId = "";
  const clients: TestClient[] = [];
  const stats: BotStats = { opens: 0, pairOpens: 0, adds: 0, finishes: 0, commands: 0 };

  it("kabul senaryosu: eşli + katlamalı + yardımlı + 11 el, davet linkiyle katılım, hazır, başlat", async () => {
    const room = await createRoom(A.user, {
      name: "Kabul Masası",
      visibility: "private",
      settings: { teamMode: true, folding: true, assisted: true, totalHands: 11, turnSeconds: 0 },
    });
    roomCode = room.code;
    expect(room.settings).toMatchObject({ teamMode: true, folding: true, assisted: true, totalHands: 11 });
    // A lobiyi WebSocket üzerinden izler
    const lobby = await new TestClient(instA.url, A).connect();
    lobby.send({ t: "room", code: roomCode });
    await lobby.waitFor((m) => m.t === "room");
    for (const p of [B, C, D]) await joinRoom(roomCode, p.user, { token: room.inviteToken });
    // Koltuk seçimi: D üst koltuğa (A'nın eşi), C sağa
    await selectSeat(roomCode, D.user, null);
    await selectSeat(roomCode, C.user, null);
    await selectSeat(roomCode, D.user, 2);
    await selectSeat(roomCode, C.user, 3);
    for (const p of [A, B, C, D]) await setReady(roomCode, p.user, true);
    const nav = lobby.waitFor((m) => m.t === "room" && !!(m as { navigateToMatch?: string }).navigateToMatch);
    ({ matchId } = await startMatch(roomCode, A.user));
    await nav; // lobi istemcisi maça yönlendirilir
    lobby.close();

    // İstemciler iki farklı instance'a dağıtılır
    clients.push(
      await new TestClient(instA.url, A).connect(),
      await new TestClient(instA.url, B).connect(),
      await new TestClient(instB.url, D).connect(),
      await new TestClient(instB.url, C).connect(),
    );
    for (const c of clients) await c.watch(matchId);
    const state = await loadState(matchId);
    // 106 taş, 22/21 dağıtım
    const all = [state.hand.indicator, ...state.hand.drawPile, ...Object.values(state.hand.hands).flat()];
    expect(all).toHaveLength(106);
    expect(new Set(all.map((t) => t.id)).size).toBe(106);
    expect(new Set(all.map((t) => t.id))).toEqual(new Set(createTileSet().map((t) => t.id)));
    const first = state.hand.firstPlayer;
    for (const c of clients) {
      const v = c.view!;
      expect(v.myHand).toHaveLength(v.mySeat === first ? 22 : 21);
      // Her oyuncu yalnızca kendi taşlarını görür
      const json = JSON.stringify(c.messages.filter((m) => m.t === "state"));
      for (const s of [0, 1, 2, 3] as Seat[]) {
        if (s === v.mySeat) continue;
        for (const t of state.hand.hands[s]) expect(json).not.toContain(`"id":"${t.id}"`);
      }
      for (const t of state.hand.drawPile) expect(json).not.toContain(`"id":"${t.id}"`);
      expect(v.rules.teamMode).toBe(true);
      expect(v.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
    }
    expect(clients.find((c) => c.view!.mySeat === 2)!.player).toBe(D);
  });

  it("geçersiz komutlar state'i değiştirmez: sıra dışı, eski versiyon, sahte taş, seyirci", async () => {
    const state = await loadState(matchId);
    const turn = state.hand.currentTurn;
    const other = clients.find((c) => c.view!.mySeat !== turn)!;
    const mine = clients.find((c) => c.view!.mySeat === turn)!;
    const outOfTurn = await other.command({ type: "DISCARD_TILE", tileId: other.view!.myHand[0].id });
    expect(outOfTurn).toMatchObject({ t: "nack", code: "INVALID_ACTION" });
    const stale = await mine.command({ type: "DISCARD_TILE", tileId: mine.view!.myHand[0].id }, { expectedVersion: 0 });
    expect(stale).toMatchObject({ t: "nack", code: "STALE_VERSION" });
    const fake = await mine.command({ type: "DISCARD_TILE", tileId: "r99-0" });
    expect(fake).toMatchObject({ t: "nack", code: "BAD_REQUEST" });
    const notMine = state.hand.hands[((turn + 1) % 4) as Seat][0].id;
    const steal = await mine.command({ type: "DISCARD_TILE", tileId: notMine });
    expect(steal).toMatchObject({ t: "nack", code: "INVALID_ACTION" });
    const outsider = await makePlayer("Yabanci", true);
    await expectAppError(
      processCommand(outsider.user, { commandId: "outsider-1", matchId, expectedVersion: state.version, action: { type: "DRAW_TILE" } }),
      "FORBIDDEN",
    );
    expect((await loadState(matchId, { fresh: true })).version).toBe(state.version);
  });

  it("aynı komut iki kez gönderilse de bir kez uygulanır (idempotent)", async () => {
    const state = await loadState(matchId);
    const mine = clients.find((c) => c.view!.mySeat === state.hand.currentTurn)!;
    const tile = mine.view!.myHand.find((t) => t.id)!.id;
    const action = state.hand.turnPhase === "awaitingDraw" ? { type: "DRAW_TILE" } : { type: "DISCARD_TILE", tileId: tile };
    const id = "dup-command-0001";
    const [r1, r2] = await Promise.all([
      mine.command(action, { commandId: id, expectedVersion: state.version }),
      mine.command(action, { commandId: id, expectedVersion: state.version }),
    ]).catch(async () => {
      // Aynı commandId için tek bekleyen yakalanabilir; ikinciyi ayrı gönder
      const a = await mine.command(action, { commandId: id, expectedVersion: state.version });
      const b = await mine.command(action, { commandId: id, expectedVersion: state.version });
      return [a, b];
    });
    expect(r1.t).toBe("ack");
    const after = await loadState(matchId, { fresh: true });
    expect(after.version).toBeGreaterThan(state.version);
    // Tekrar gönderim: sonuç aynı versiyon, duplicate işaretli
    const r3 = await mine.command(action, { commandId: id, expectedVersion: state.version });
    expect(r3).toMatchObject({ t: "ack", duplicate: true, version: (r1 as { version: number }).version });
    expect((await loadState(matchId, { fresh: true })).version).toBe(after.version);
    void r2;
  });

  it("hamleler diğer instance'taki oyunculara ulaşır; kopan oyuncu geri gelince aynı state'i görür; 11 el tamamlanır", async () => {
    let disconnected = false;
    let handsSeen = 0;
    for (let step = 0; step < 4000; step++) {
      const state = await loadState(matchId);
      if (state.phase === "finished") break;
      // Tüm istemcilerin son versiyonu görmesini bekle (instance'lar arası yayılım)
      await Promise.all(clients.map((c) => c.waitForVersion(state.version)));
      if (state.handResults.length > handsSeen) {
        handsSeen = state.handResults.length;
        // El sonucu bütün kullanıcılara gösterilir
        for (const c of clients) expect(c.view!.handResults).toHaveLength(handsSeen);
      }
      // 2. elin ortasında B'nin bağlantısı kopar ve geri gelir
      if (!disconnected && state.hand.handNumber === 2 && state.hand.turnNumber > 6 && state.phase === "playing") {
        disconnected = true;
        const idx = clients.findIndex((c) => c.player === B);
        clients[idx].ws.terminate();
        // B yokken diğerleri oynamaya devam eder (B'nin sırası değilse)
        const reconnect = await new TestClient(instB.url, B).connect(); // farklı instance'a döner
        const v = await reconnect.watch(matchId);
        const fresh = await loadState(matchId);
        expect(v.version).toBe(fresh.version);
        expect(v.myHand.map((t) => t.id).sort()).toEqual(fresh.hand.hands[v.mySeat!].map((t) => t.id).sort());
        clients[idx] = reconnect;
        // Aynı koltukta tek oyuncu: maçtaki oyuncu listesi değişmez
        expect(fresh.players.filter((p) => p.userId === B.user.id)).toHaveLength(1);
      }
      if (state.phase === "handResult") {
        for (const c of clients) await botTurn(c, stats);
        continue;
      }
      const actor = clients.find((c) => c.view!.mySeat === state.hand.currentTurn)!;
      await botTurn(actor, stats);
    }
    const final = await loadState(matchId, { fresh: true });
    expect(disconnected).toBe(true);
    expect(final.phase).toBe("finished");
    expect(final.handResults).toHaveLength(11);
    expect(stats.opens + stats.pairOpens).toBeGreaterThan(0);
    // Takım puanları ve kazanan
    const t0 = final.totals[0] + final.totals[2];
    const t1 = final.totals[1] + final.totals[3];
    for (const h of final.handResults) {
      expect(h.teamScores).toEqual([h.playerScores[0] + h.playerScores[2], h.playerScores[1] + h.playerScores[3]]);
    }
    if (t0 !== t1) expect(final.winner!.team).toBe(t0 < t1 ? 0 : 1);
    await Promise.all(clients.map((c) => c.waitForVersion(final.version)));
    for (const c of clients) {
      expect(c.view!.phase).toBe("finished");
      expect(c.view!.winner).toEqual(final.winner);
    }
    process.stderr.write(`[maç] komut=${stats.commands} seriAçma=${stats.opens} çiftAçma=${stats.pairOpens} işleme=${stats.adds} bitiş=${stats.finishes}
`);
  }, 240_000);

  it("maç geçmişe kaydedilir, istatistikler güncellenir; oyuncular aynı odada yeni maç başlatabilir", async () => {
    const db = await getDb();
    const handsRows = await db.select().from(schema.hands).where(eq(schema.hands.matchId, matchId));
    expect(handsRows).toHaveLength(11);
    const mp = await db.select().from(schema.matchPlayers).where(eq(schema.matchPlayers.matchId, matchId));
    expect(mp.every((p) => p.finalScore !== null)).toBe(true);
    const hist = await matchHistory(A.user.id);
    expect(hist.some((h) => h.matchId === matchId && h.status === "finished")).toBe(true);
    const prof = await profile("ayse");
    expect(prof.stats!.matchesPlayed).toBeGreaterThanOrEqual(1);
    expect(prof.stats!.handsPlayed).toBeGreaterThanOrEqual(11);
    expect(prof.stats!.teamMatchesPlayed).toBeGreaterThanOrEqual(1);
    const events = await db.select().from(schema.gameEvents).where(eq(schema.gameEvents.matchId, matchId));
    expect(events.length).toBeGreaterThan(50);
    // Olay kayıtlarında çekilen taşın kimliği yoktur (gizli bilgi)
    expect(events.filter((e) => e.type === "TILE_DRAWN").every((e) => !("tile" in (e.payload as object)))).toBe(true);
    // Rövanş
    const room = await getRoom(roomCode, A.user);
    expect(room.access === "full" && room.room.status).toBe("lobby");
    for (const p of [A, B, C, D]) await setReady(roomCode, p.user, true);
    const { matchId: second } = await startMatch(roomCode, A.user);
    expect(second).not.toBe(matchId);
    // Maç sırasında ayarlar değiştirilemez, koltuk korunur
    await expectAppError(updateRoom(roomCode, A.user, { settings: { folding: false } }), "CONFLICT");
    expect(await leaveRoom(roomCode, B.user)).toEqual({ left: false, seatKept: true });
    for (const c of clients) c.close();
  });
});
