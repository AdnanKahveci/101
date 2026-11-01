import { defineConfig, devices } from "@playwright/test";

/** Yayındaki siteye karşı uçtan uca duman testi: E2E_BASE_URL=https://... npx playwright test -c playwright.prod.config.ts */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://online101okey.vercel.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
