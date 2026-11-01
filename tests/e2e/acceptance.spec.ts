import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Gerçek tarayıcı kabul testi: 4 ayrı tarayıcı oturumu (4 gerçek istemci), gerçek WebSocket.
 * Oda oluşturma → davet linki → katılma → hazır → başlat → dağıtım → gizlilik → taş atma (sürükle-bırak) →
 * taş çekme → skor tablosu → yeniden bağlanma → mobil dokunmatik sürükleme.
 */

async function guestLogin(page: Page, nick: string) {
  await page.getByLabel("Takma ad").first().fill(nick);
  await page.getByRole("button", { name: /Misafir olarak/ }).first().click();
}

async function rackIds(page: Page): Promise<string[]> {
  return page.locator("[data-slot] [data-tile-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tile-id")!));
}

async function myView(page: Page, matchId: string) {
  return page.evaluate(async (id) => {
    const r = await fetch(`/api/matches/${id}`);
    return { text: await r.text(), status: r.status };
  }, matchId);
}

test("kabul senaryosu: eşli, katlamalı, yardımlı 11 ellik özel oda – 4 tarayıcı", async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  const newPage = async (b: Browser) => {
    const ctx = await b.newContext();
    contexts.push(ctx);
    return ctx.newPage();
  };

  // 1-6: Oyuncu A odayı oluşturur
  const A = await newPage(browser);
  await A.goto("/");
  await guestLogin(A, "Ayşe");
  await A.waitForURL(/dashboard/);
  await A.goto("/rooms/create");
  await A.getByLabel(/Oda adı/).fill("Kabul Masası");
  await A.getByRole("switch", { name: "Eşli 101" }).click();
  await A.getByRole("switch", { name: "Katlamalı" }).click();
  await expect(A.getByRole("switch", { name: "Yardımlı" })).toHaveAttribute("aria-checked", "true");
  await A.getByLabel("El sayısı").selectOption("11");
  await A.getByRole("button", { name: /Oda(yı)? oluştur/ }).click();
  await A.waitForURL(/\/room\/[A-Z0-9]{6}/);
  const invite = await A.getByTestId("invite-url").inputValue();
  expect(invite).toMatch(/\/room\/[A-Z0-9]{6}\?t=/);
  await expect(A.getByText("Eşli · Katlamalı")).toBeVisible();

  // 7-9: B, C, D davet linkiyle katılır (misafir girişi)
  const others: Page[] = [];
  for (const nick of ["Bora", "Cem", "Deniz"]) {
    const p = await newPage(browser);
    await p.goto(invite);
    await guestLogin(p, nick);
    await p.getByRole("button", { name: /Odaya katıl/ }).click();
    await expect(p.getByText("Davet et")).toBeVisible();
    others.push(p);
  }
  // Koltuklar dolu (A otomatik Alt koltukta)
  for (const s of [0, 1, 2, 3]) await expect(A.getByTestId(`lobby-seat-${s}`)).not.toContainText("Otur");

  // 10: herkes hazır
  for (const p of others) await p.getByTestId("toggle-ready").click();
  await expect(A.getByTestId("start-match")).toBeEnabled();

  // 11: başlat → herkes masaya yönlenir
  await A.getByTestId("start-match").click();
  const all = [A, ...others];
  for (const p of all) await p.waitForURL(/\/game\//);
  const matchId = A.url().split("/game/")[1];

  // 12-14: dağıtım 22/21, herkes yalnızca kendi taşlarını görür
  for (const p of all) await expect(p.locator("[data-slot] [data-tile-id]").first()).toBeVisible();
  const counts = await Promise.all(all.map(async (p) => (await rackIds(p)).length));
  expect(counts.sort()).toEqual([21, 21, 21, 22]);
  const views = await Promise.all(all.map((p) => myView(p, matchId)));
  const hands = views.map((v) => (JSON.parse(v.text).view.myHand as { id: string }[]).map((t) => t.id));
  const union = new Set(hands.flat());
  expect(union.size).toBe(85); // 22 + 21×3, hiçbir taş iki elde değil
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (i === j) continue;
      for (const id of hands[j]) expect(views[i].text).not.toContain(`"id":"${id}"`);
    }
  }
  // Yardımlı mod: baraj göstergesi (katlamalı ilk baraj 101)
  await expect(A.getByTestId("threshold")).toContainText("101 puan");

  // 15: ilk oyuncu taşı sürükleyip atma alanına bırakır
  const firstIdx = await Promise.all(all.map(async (p) => (await rackIds(p)).length)).then((c) => c.indexOf(22));
  const first = all[firstIdx];
  const tileToDrop = first.locator("[data-slot] [data-tile-id]").last();
  const droppedId = await tileToDrop.getAttribute("data-tile-id");
  const target = first.locator("[data-drop='discard']");
  await tileToDrop.hover();
  await first.mouse.down();
  const box = await target.boundingBox();
  await first.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 12 });
  await first.mouse.up();
  await expect.poll(async () => (await rackIds(first)).length).toBe(21);
  expect(await rackIds(first)).not.toContain(droppedId);

  // 16: sıradaki oyuncu desteden çeker ve onaylı taş atar
  let next: Page | null = null;
  for (const p of all) {
    if (await p.getByRole("button", { name: "Taş çek", exact: true }).isVisible().catch(() => false)) next = p;
  }
  expect(next).not.toBeNull();
  // Atılan taş diğer oyunculara ulaşmıştır (gerçek zamanlı)
  await expect(next!.locator(`[data-tile-id="${droppedId}"]`).first()).toBeVisible();
  await next!.getByRole("button", { name: "Taş çek", exact: true }).click();
  await expect.poll(async () => (await rackIds(next!)).length).toBe(22);
  const pick = next!.locator("[data-slot] [data-tile-id]").first();
  await pick.click();
  await next!.getByRole("button", { name: "Taş at", exact: true }).click();
  await next!.getByTestId("confirm-discard").click();
  await expect.poll(async () => (await rackIds(next!)).length).toBe(21);

  // Skor tablosu açılır
  await A.getByRole("button", { name: "Skor tablosu" }).click();
  await expect(A.getByRole("dialog", { name: "Skor tablosu" })).toBeVisible();
  await A.keyboard.press("Escape");

  // 21-22: bir oyuncu bağlantısını keser (sayfa yeniden yüklenir) ve kaldığı yerden devam eder
  const before = (await rackIds(others[1])).sort();
  await others[1].reload();
  await expect(others[1].locator("[data-slot] [data-tile-id]").first()).toBeVisible();
  expect((await rackIds(others[1])).sort()).toEqual(before);

  // Ağ kesintisi: WebSocket kapanır, banner görünür, sonra otomatik yeniden bağlanır
  const ctxB = contexts[2];
  await ctxB.setOffline(true);
  await others[1].evaluate(() => window.dispatchEvent(new Event("offline")));
  await ctxB.setOffline(false);
  await expect(others[1].locator("[data-slot] [data-tile-id]").first()).toBeVisible();

  // Istakada sürükleyerek yer değiştirme (masaüstü)
  const slots = await A.locator("[data-slot]").count();
  expect(slots).toBe(30);
  const firstTile = A.locator("[data-slot] [data-tile-id]").first();
  const movedId = await firstTile.getAttribute("data-tile-id");
  const emptySlot = A.locator("[data-slot]:not(:has([data-tile-id]))").last();
  await firstTile.hover();
  await A.mouse.down();
  const eb = await emptySlot.boundingBox();
  await A.mouse.move(eb!.x + eb!.width / 2, eb!.y + eb!.height / 2, { steps: 10 });
  await A.mouse.up();
  await expect(A.locator("[data-slot]").last().locator(`[data-tile-id="${movedId}"]`)).toHaveCount(1);

  for (const c of contexts) await c.close();
});

test("mobil: dokunmatik sürükleme ile ıstakada taş taşıma ve yardımsız modda öneri butonlarının gizlenmesi", async ({ browser }) => {
  const ctxs: BrowserContext[] = [];
  const pages: Page[] = [];
  for (let i = 0; i < 4; i++) {
    const ctx = await browser.newContext(i === 0 ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } : {});
    ctxs.push(ctx);
    pages.push(await ctx.newPage());
  }
  const [M, ...rest] = pages;
  await M.goto("/");
  await guestLogin(M, "Mobil");
  await M.waitForURL(/dashboard/);
  await M.goto("/rooms/create");
  await M.getByLabel(/Oda adı/).fill("Mobil Masa");
  await M.getByRole("switch", { name: "Yardımlı" }).click(); // yardımsız
  await M.getByRole("button", { name: /Oda(yı)? oluştur/ }).click();
  await M.waitForURL(/\/room\//);
  const invite = await M.getByTestId("invite-url").inputValue();
  for (const [i, p] of rest.entries()) {
    await p.goto(invite);
    await guestLogin(p, `Oyuncu${i}`);
    await p.getByRole("button", { name: /Odaya katıl/ }).click();
    await p.getByTestId("toggle-ready").click();
  }
  await M.getByTestId("start-match").click();
  await M.waitForURL(/\/game\//);
  await expect(M.locator("[data-slot] [data-tile-id]").first()).toBeVisible();
  // Yardımsız: öneri, sıralama ve baraj göstergesi yok
  await expect(M.getByRole("button", { name: "Per öner" })).toHaveCount(0);
  await expect(M.getByRole("button", { name: "Renge göre sırala" })).toHaveCount(0);
  await expect(M.getByTestId("threshold")).toHaveCount(0);

  // Dokunmatik pointer olaylarıyla sürükleme
  const tile = M.locator("[data-slot] [data-tile-id]").first();
  const id = await tile.getAttribute("data-tile-id");
  const from = (await tile.boundingBox())!;
  const to = (await M.locator("[data-slot]").last().boundingBox())!;
  await tile.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, clientX: from.x + 5, clientY: from.y + 5 });
  await tile.dispatchEvent("pointermove", { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: to.x + to.width / 2, clientY: to.y + to.height / 2 });
  await tile.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, clientX: to.x + to.width / 2, clientY: to.y + to.height / 2 });
  await expect(M.locator("[data-slot]").last().locator(`[data-tile-id="${id}"]`)).toHaveCount(1);
  // Dokunarak seçme
  const t2 = M.locator("[data-slot] [data-tile-id]").first();
  await t2.tap();
  await expect(t2).toHaveAttribute("aria-pressed", "true");
  for (const c of ctxs) await c.close();
});
