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
  // Trenddatenbank und Quellen liegen im Backend: nicht in der Kundennavigation, Seiten gesperrt
  const nav = page.getByRole("navigation", { name: "Bereiche" });
  await expect(nav.getByRole("link")).toHaveText([/Dashboard \(3D\)|3D/, /2D-Ansicht|2D/, /News-Ticker|News/]);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Nur für die Redaktion" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Redaktion" })).toHaveCount(0);
  await page.goto("/admin/datenbank");
  await expect(page.getByRole("heading", { name: "Nur für die Redaktion" })).toBeVisible();
  await page.goto("/radar/klassisch");
  await expect(page.locator("#datenbank, #quellen")).toHaveCount(0);
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
    await page.waitForLoadState("networkidle"); // erst nach dem Hydrieren reagiert der Editor
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

  test("Liveticker im Stadion: Kunde sieht freigegebene Meldungen, filtert nach Themen", async ({ page }) => {
    // Das Stadion ist WebGL; ohne GPU rendert der Testbrowser langsam – mehr Zeit geben
    test.slow();
    await loginAs(page, /Kunde A · Member/);
    await page.goto("/radar?v=journey");
    const ticker = page.getByRole("region", { name: "Liveticker" });
    await expect(ticker.getByRole("link", { name: /Batteriespeicher/ })).toHaveAttribute("href", "https://example.org/beispiel/speicher");

    // Themenfilter: nur Fan & Guest Experience – die Speicher-Meldung (Cluster F) verschwindet
    await ticker.getByRole("button", { name: "Themen wählen" }).click();
    await ticker.getByRole("checkbox", { name: /Fan & Guest Experience/ }).check();
    await expect(ticker.getByRole("link", { name: /Batteriespeicher/ })).toHaveCount(0);
    await ticker.getByRole("checkbox", { name: /Sustainability/ }).check();
    await expect(ticker.getByRole("link", { name: /Batteriespeicher/ })).toBeVisible();
    await ticker.getByRole("button", { name: "Alle Themen" }).click();

    // Einklappen: Spalte weg, ruhige Pille (alles gesehen); Klick klappt wieder aus
    await ticker.getByRole("button", { name: "Liveticker einklappen" }).click();
    await expect(ticker).toBeHidden();
    await page.getByRole("button", { name: /Liveticker öffnen, \d+ Meldungen, keine neuen/ }).click();
    await expect(ticker).toBeVisible();

    await ticker.getByRole("button", { name: /#34 Energiespeicher/ }).click();
    await expect(page.locator("main aside, aside").getByRole("heading", { name: /Energiespeicher/ }).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Mehr erfahren" }).click();
    // Hinter dem Panel rendert WebGL ohne GPU sehr langsam; Playwrights Stabilitätsprüfung wartet dann ewig
    await page.getByRole("tab", { name: /News/ }).dispatchEvent("click");
    await expect(page.getByRole("tabpanel").getByRole("link", { name: /Batteriespeicher/ })).toBeVisible({ timeout: 20_000 });
  });
  test("Backend: Trenddatenbank und Quellenverzeichnis", async ({ page }) => {
    await loginAs(page, /Redaktion/);
    await page.goto("/admin/datenbank");
    await expect(page.getByRole("heading", { name: "Trenddatenbank" })).toBeVisible();
    await expect(page.getByRole("button", { name: "CSV herunterladen" })).toBeVisible();
    await page.goto("/admin/quellenverzeichnis");
    await expect(page.getByRole("heading", { name: "Quellenverzeichnis" })).toBeVisible();
    await expect(page.getByRole("link").filter({ hasText: /./ }).first()).toBeVisible();
  });

  test("Liveticker eingeklappt: neue Meldungen fallen auf", async ({ page }) => {
    await loginAs(page, /Kunde A · Member/);
    // eingeklappt, aber noch nie hineingeschaut: Meldungen der letzten 7 Tage gelten als neu
    await page.addInitScript(() => window.localStorage.setItem("trendradar.ticker-eingeklappt", "1"));
    await page.goto("/radar?v=journey");
    await expect(page.getByRole("region", { name: "Liveticker" })).toBeHidden();
    const strip = page.getByRole("button", { name: /Liveticker öffnen, \d+ neue Meldungen/ });
    await expect(strip).toContainText("Neu ·");
    await strip.click();
    await expect(page.getByRole("region", { name: "Liveticker" })).toBeVisible();
  });
});

test.describe("Scouting", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "Ändert den gemeinsamen Testzustand – nur einmal am Desktop");

  test("Kader, Scout bearbeiten, Quelle andocken, Tipp einreichen", async ({ page }) => {
    await loginAs(page, /Redaktion/);
    await page.goto("/admin/scouting");
    await expect(page.getByRole("heading", { name: "Food & Beverage" })).toBeVisible();
    await expect(page.getByText("Testmodus: Scouts lassen sich konfigurieren, aber nicht starten.")).toBeVisible();

    await page.getByRole("article").filter({ hasText: "Food & Beverage" }).getByRole("link", { name: "Bearbeiten" }).click();
    await page.getByLabel("Nicht melden").fill("Werbung, Gewinnspiele");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Gespeichert.");

    await page.goto("/admin/scouting/quellen");
    await page.getByRole("button", { name: "Quelle andocken" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Test-Feed");
    await page.getByLabel("Typ").selectOption("rss");
    await page.getByLabel("Adresse", { exact: true }).fill("https://example.org/feed");
    await page.getByLabel(/Zugangsdaten/).fill("sk-geheim");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Zugangsdaten nie direkt eintragen");
    await page.getByLabel(/Zugangsdaten/).fill("");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Test-Feed")).toBeVisible();

    await page.goto("/admin/scouting");
    await page.getByLabel("Link").fill("https://www.linkedin.com/posts/beispiel-pfand");
    await page.getByRole("button", { name: "Tipp einreichen" }).click();
    await expect(page.getByText("https://www.linkedin.com/posts/beispiel-pfand")).toBeVisible();
  });
});
