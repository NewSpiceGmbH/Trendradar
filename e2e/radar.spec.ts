import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, persona: RegExp) {
  await page.goto("/login");
  await page.getByRole("button", { name: persona }).click();
  await page.waitForURL("**/radar");
  // Die bisherigen Klickpfade prüfen die 2D-Ansicht; das Stadion unter /radar ist WebGL
  await page.goto("/radar/klassisch");
  // erst nach dem Hydrieren reagieren Fokus und Tastatur
  await page.waitForLoadState("networkidle");
}

test("ohne Login geht es zur Anmeldung", async ({ page }) => {
  await page.goto("/radar");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
});

test("Member: Arena, Trendkarte, Filter, Perspektive, Vergleich", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginAs(page, /Kunde A · Member/);

  await expect(page.getByRole("heading", { name: "Future of Experiences" })).toBeVisible();
  await expect(page.getByText(/Ihr Zugang für Kunde A endet in/)).toBeVisible();
  await expect(page.locator('g[role="button"]')).toHaveCount(44);

  await page.locator('g[role="button"][aria-label^="25 "]').click();
  await expect(page.locator("#arena article h3").first()).toHaveText("Self-Pour & Smart Schank");
  await page.getByRole("button", { name: "Zum Vergleich hinzufügen" }).click();
  await expect(page.getByRole("button", { name: "Vergleich leeren" })).toBeVisible();

  await page.getByRole("group", { name: "Fokus" }).getByRole("button", { name: "Hospitality" }).click();
  await expect(page.getByText(/^\d+ von 44 Trends sichtbar$/)).not.toHaveText("44 von 44 Trends sichtbar");
  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(page.getByText("44 von 44 Trends sichtbar")).toBeVisible();

  // Perspektive: Trend #10 liegt global im Aufwärmen, in Europa im Scouting
  const dot10 = page.locator('g[role="button"][aria-label^="10 "]');
  await expect(dot10).toHaveAttribute("aria-label", /Scouting/);
  await page.getByRole("group", { name: "Perspektive", exact: true }).getByRole("button", { name: "Global" }).click();
  await expect(dot10).toHaveAttribute("aria-label", /Aufwärmen/);

  // Basic: Premium gesperrt
  await expect(page.getByText("Premium-Bereich", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Tastatur: Fokus zeigt Tooltip, Enter öffnet die Karte", async ({ page, isMobile }) => {
  test.skip(isMobile, "Tastaturtest nur am Desktop");
  await loginAs(page, /Kunde A · Owner/);
  const dot = page.locator('g[role="button"][aria-label^="7 "]');
  await dot.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dot).toHaveAttribute("aria-pressed", "true");
});

test("Trend als eigene Seite", async ({ page }) => {
  await loginAs(page, /Kunde A · Member/);
  await page.goto("/trends/10");
  await expect(page.getByRole("heading", { level: 2, name: "Bar- & Küchenrobotik" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Europa-Einordnung", { exact: true })).toBeVisible();
});

test("Premium sieht Top 10, abgelaufene Org sieht nichts", async ({ page }) => {
  await loginAs(page, /Kunde P · Premium/);
  await expect(page.getByRole("heading", { name: "Top 10 Strategic Trends für Europa" })).toBeVisible();
  await page.getByRole("button", { name: "Abmelden" }).click();
  await loginAs(page, /Kunde X · abgelaufen/);
  await expect(page.getByRole("heading", { name: "Ihr Zugang ist abgelaufen" })).toBeVisible();
  await expect(page.locator('g[role="button"]')).toHaveCount(0);
});

test("mobil ohne horizontales Scrollen", async ({ page }) => {
  await loginAs(page, /Kunde A · Member/);
  await expect(page.getByRole("heading", { name: "Future of Experiences" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
