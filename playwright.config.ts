import { defineConfig, devices } from "@playwright/test";

// Smoketests gegen die App im Testmodus (RADAR_FIXTURES=1, Seed-Daten, Demo-Personas ohne Datenbank).
// Gegen eine echte Vorschau: E2E_BASE_URL=https://… npx playwright test
const port = 3210;
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobil", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx next start -p ${port}`,
        port,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
        env: {
          RADAR_FIXTURES: "1",
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-placeholder",
        },
      },
});
