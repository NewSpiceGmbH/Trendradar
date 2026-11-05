import { expect, test, type Page } from "@playwright/test";

// Redaktions-Backend im Testmodus (RADAR_FIXTURES=1). Der Testmodus hält seinen Zustand im Speicher des
// Servers – Tests, die etwas ändern, laufen deshalb nur am Desktop und nacheinander.

async function loginAs(page: Page, persona: RegExp) {
  await page.goto("/login");
  await page.getByRole("button", { name: persona }).click();
  await page.waitForURL("**/radar");
}

test("Kunde: kein Zugang zum Backend", async ({ page }) => {
  await loginAs(page, /Kunde A · Member/);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Nur für die Redaktion" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Redaktion" })).toHaveCount(0);
});

test.describe("Redaktion", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "Ändert den gemeinsamen Testzustand – nur einmal am Desktop");

  test("Cockpit und Review-Queue mit Auswirkung im Stadion", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await loginAs(page, /Redaktion/);
    await page.getByRole("link", { name: "Redaktion", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cockpit" })).toBeVisible();

    await page.getByRole("navigation", { name: "Redaktion" }).getByRole("link", { name: /Review-Queue/ }).click();
    await expect(page.getByText("Scouting → Aufwärmen")).toBeVisible();
    await page.getByRole("link", { name: /#10 Bar- & Küchenrobotik/ }).click();
    await expect(page.getByRole("heading", { name: "Auswirkung im Stadion" })).toBeVisible();

    // Freigeben: Meldungs-Zuordnung (ändert keine Position – die Radar-Tests prüfen #10 im Scouting)
    await page.goto("/admin/review/prop-4");
    await page.getByRole("button", { name: "Freigeben", exact: true }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("prop-4"));
    await page.goto("/admin/ticker?tab=live");
    await expect(page.getByText("Bestellung am Platz")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Ablehnen nur mit Begründung", async ({ page }) => {
    await loginAs(page, /Redaktion/);
    await page.goto("/admin/review/prop-2");
    await page.getByRole("button", { name: "Ablehnen …" }).click();
    const reject = page.getByRole("button", { name: "Ablehnen", exact: true });
    await expect(reject).toBeDisabled();
    await page.getByLabel("Begründung (Pflicht)").fill("Keine belastbare Quelle");
    await reject.click();
    await page.waitForURL((u) => !u.pathname.endsWith("prop-2"));
    await page.goto("/admin/review?status=rejected");
    await expect(page.getByText("Keine belastbare Quelle")).toBeVisible();
  });

  test("Trend bearbeiten: Vorschau, Version, Wiederherstellen", async ({ page }) => {
    await loginAs(page, /Redaktion/);
    await page.goto("/admin/trends/18");
    await page.getByLabel("Horizont Europa").selectOption("3–5");
    await page.getByRole("radiogroup", { name: "Market Readiness" }).nth(1).getByRole("radio", { name: "3" }).click();
    await expect(page.getByText("Scouting → Aufwärmen")).toBeVisible();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status")).toHaveText(/Gespeichert/);
    await page.reload();
    await page.getByRole("button", { name: "Wiederherstellen" }).first().click();
    await page.getByRole("button", { name: "Ja" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Bewertung" })).toHaveCount(2);
  });

  test("Liveticker: veröffentlichen erst mit Trend", async ({ page }) => {
    await loginAs(page, /Redaktion/);
    await page.goto("/admin/ticker");
    const row = page.getByRole("listitem").filter({ hasText: "Batteriespeicher" });
    await row.getByRole("combobox", { name: "Trend zuordnen" }).selectOption("");
    await expect(row.getByRole("button", { name: "Veröffentlichen" })).toBeDisabled();
    await row.getByRole("combobox", { name: "Trend zuordnen" }).selectOption({ label: "#34 Energiespeicher & EMS" });
    const assigned = page.getByRole("listitem").filter({ hasText: "Batteriespeicher" });
    await assigned.getByRole("button", { name: "Veröffentlichen" }).click();
    await page.goto("/admin/ticker?tab=live");
    await expect(page.getByText("Batteriespeicher")).toBeVisible();
  });
});
