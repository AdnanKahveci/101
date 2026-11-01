import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Geçici yerel test ortamı: gömülü PGlite + bellek içi pub/sub (üretimde kullanılmaz).
    command: `npx tsx scripts/dev-server.ts`,
    env: { PORT: String(port), OKEY_DEV_DB: "pglite:memory" },
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
