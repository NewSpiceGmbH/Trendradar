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
  await expect(nav.getByRole("link")).toHaveText([/Dashboard \(3D\)|3D/, /2D-Ansicht|2D/, /News-Ticker|News/, /Netzwerk/, /Projekte/]);
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
    await page.waitForLoadState("networkidle"); // Stadion (WebGL) erst fertig laden lassen
    await page.getByRole("link", { name: "Redaktion", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cockpit" })).toBeVisible();
    // Netzwerk-Funnel (der Limetten-Block) und Projekte mit Ampel
    await expect(page.getByRole("heading", { name: /Netzwerk-Funnel/ })).toBeVisible();
    const red = page.getByRole("listitem").filter({ hasText: "Nachhaltige Fan-Anreise" });
    await expect(red.getByRole("img", { name: /Ampel Rot: Zwischenauswertung überfällig/ })).toBeVisible();
    await red.getByRole("button").first().click();
    await expect(red.getByRole("link", { name: "Projekt öffnen" })).toBeVisible();

    // Live-Feed: nach Bereich filtern, mit Trend in den Ticker
    const feed = page.getByRole("region", { name: "Live-Feed" });
    await feed.getByRole("button", { name: "Startups", exact: true }).click();
    await expect(feed.getByText(/Münchner Startup/)).toBeVisible();
    await expect(feed.getByText(/Flughafen testet Boarding/)).toHaveCount(0);
    await feed.getByRole("button", { name: "Alle", exact: true }).click();
    const item = feed.getByRole("listitem").filter({ hasText: "Flughafen testet Boarding" });
    await expect(item.getByRole("button", { name: /#18/ })).toBeVisible();
    await item.getByRole("button", { name: "In den Ticker" }).click();
    await expect(item.getByText(/Im Ticker seit/)).toBeVisible();

    // Anfrage als Pop-up annehmen → wird Projekt (Problem Deep Dive), erscheint mit „Neu“ oben
    const dock = page.getByRole("dialog", { name: "Neue Anfrage" });
    await expect(dock.getByText(/Wegeleitung am Spieltag/)).toBeVisible();
    await dock.getByRole("button", { name: /Annehmen/ }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Wegeleitung am Spieltag" }).getByText("Neu", { exact: true })).toBeVisible();

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

  test("Venture Clienting: Challenge, Vorevaluierung, Entscheidung, Profil im Radar", async ({ page }) => {
    test.slow(); // am Ende das Stadion (WebGL)
    await loginAs(page, /Redaktion/);
    await page.goto("/admin/venture");
    await page.getByRole("link", { name: /Wartezeit am Bierstand/ }).click();
    await expect(page.getByRole("heading", { name: /Wartezeit am Bierstand/, level: 1 })).toBeVisible();
    await expect(page.getByText(/Suchstrategie:/)).toBeVisible();

    // Shortlist-Kandidat: Bewertung je Kriterium sichtbar, aufnehmen
    const queueless = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: /QueueLess/ }) });
    await expect(queueless.getByText("Problem-Fit")).toBeVisible();
    await expect(queueless.getByText("4,10")).toBeVisible(); // 5·0,25 + 4·0,2 + 4·0,15 + 4·0,15 + 4·0,1 + 3·0,1 + 3·0,05
    await queueless.getByRole("button", { name: "In die Datenbank" }).click();
    // die Karte wandert danach aus „offen“ heraus – geprüft wird das Ergebnis, nicht die kurze Meldung
    await expect(page.getByRole("link", { name: /^In der Datenbank 1$/ })).toBeVisible();

    // Ablehnen nur mit Begründung
    const crowd = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: /CrowdSense/ }) });
    await crowd.getByRole("button", { name: "Ablehnen" }).click();
    await crowd.getByRole("button", { name: "Ablehnung speichern" }).click();
    await expect(crowd.getByRole("status")).toHaveText(/Begründung/);
    await crowd.getByRole("textbox", { name: /Begründung/ }).fill("Nur Anzeige, löst das Problem nicht.");
    await crowd.getByRole("button", { name: "Ablehnung speichern" }).click();
    await page.goto("/admin/venture/ch-1?zeige=abgelehnt");
    await expect(page.getByRole("heading", { name: /CrowdSense/ })).toBeVisible();

    // Eintrag in der Netzwerk-Datenbank ergänzen und öffentlich machen (alte Adresse leitet weiter)
    await page.goto("/admin/startups");
    await expect(page).toHaveURL(/\/admin\/netzwerk\?typ=solution_provider/);
    await page.getByRole("link", { name: /QueueLess/ }).click();
    await page.getByRole("navigation", { name: "Reiter" }).getByRole("link", { name: "Bearbeiten" }).click();
    await page.getByLabel("In einem Satz").fill("Kasse ohne Schlange für Stadien und Arenen.");
    await page.getByLabel("Kosten / Preismodell").fill("2.000 € im Monat");
    await page.getByRole("button", { name: "Öffentlich machen" }).click();
    await expect(page.getByRole("status").filter({ hasText: "veröffentlicht" })).toBeVisible();

    // neue Challenge anlegen; im Testmodus gibt es keine echten Läufe
    await page.goto("/admin/venture/neu");
    await page.getByLabel("Titel").fill("Einlass beschleunigen");
    await page.getByLabel(/Problem – was ist heute/).fill("Vor dem Anpfiff stauen sich die Gäste 25 Minuten an den Drehkreuzen.");
    await page.getByRole("button", { name: "Challenge anlegen" }).click();
    await expect(page.getByRole("heading", { name: "Einlass beschleunigen", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Startups suchen" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Testmodus" })).toBeVisible();

    // Kunde sieht das veröffentlichte Kurzprofil beim Trend – ohne Kosten
    await loginAs(page, /Kunde A · Member/);
    await page.goto("/radar?t=24&d=1");
    await page.getByRole("tab", { name: /Startups/ }).dispatchEvent("click");
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText(/QueueLess/)).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText("Kasse ohne Schlange für Stadien und Arenen.")).toBeVisible();
    await expect(page.getByText("2.000 € im Monat")).toHaveCount(0);
    await page.goto("/admin/startups");
    await expect(page.getByRole("heading", { name: "Nur für die Redaktion" })).toBeVisible();
  });

  test("Netzwerk-Datenbank: Filter, Eintrag mit Angebot, Kategorien, Netzwerk-Manager", async ({ page }) => {
    await loginAs(page, /Redaktion/);
    await page.goto("/admin/netzwerk");
    await expect(page.getByRole("heading", { name: "Netzwerk-Datenbank", level: 1 })).toBeVisible();
    const types = page.getByRole("navigation", { name: "Partner-Typ" });
    await types.getByRole("link", { name: /^Verein · \d+/ }).click();
    await expect(page.getByRole("link", { name: /FC Beispielstadt/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /TapFlow/ })).toHaveCount(0);
    // Suche nach Trendnummer läuft über die Angebotskategorien
    await page.goto("/admin/netzwerk?q=%2325");
    await expect(page.getByRole("link", { name: /TapFlow/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Kassensysteme AG/ })).toHaveCount(0);

    // Netzwerk-Manager: Kategorie anpassen und übernehmen → Eintrag bekommt sie
    const manager = page.getByRole("complementary").filter({ has: page.getByRole("heading", { name: "Netzwerk-Manager" }) });
    const sensorik = manager.getByRole("listitem").filter({ hasText: "Sensorik" });
    await sensorik.getByRole("button", { name: "Anpassen" }).click();
    await sensorik.getByLabel("Name").fill("Sensorik & Messung");
    await sensorik.getByRole("button", { name: "Angepasst übernehmen" }).click();
    await expect(sensorik).toHaveCount(0); // entschieden: verschwindet aus der Liste
    const crowd = manager.getByRole("listitem").filter({ hasText: "Crowd-Management" });
    await crowd.getByRole("button", { name: "Verwerfen" }).click();
    await expect(crowd).toHaveCount(0);
    await expect(manager.getByText("Keine offenen Vorschläge.")).toBeVisible();

    // Eintrag: Angebot mit Kategorie → Trends; Referenz; Sichtbarkeit
    await page.goto("/admin/netzwerk");
    await page.getByRole("link", { name: /TapFlow/ }).click();
    await expect(page.getByRole("heading", { name: /TapFlow/, level: 1 })).toBeVisible();
    await expect(page.getByText("New Spice approved").first()).toBeVisible();
    await expect(page.getByText("Sensorik & Messung").first()).toBeVisible(); // aus dem übernommenen Vorschlag
    await page.getByRole("button", { name: "+ Angebot" }).click();
    await page.getByLabel("Produkt / Leistung").last().fill("TapFlow Pay");
    await page.getByRole("group", { name: "Angebotskategorien" }).last().getByRole("button", { name: "Kassensysteme" }).click();
    await page.getByRole("button", { name: "Angebot hinzufügen" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Angebot gespeichert" })).toBeVisible();
    await expect(page.getByText("TapFlow Pay")).toBeVisible();
    await expect(page.getByText(/#26/).first()).toBeVisible();
    await page.getByRole("button", { name: "+ Referenz" }).click();
    await page.getByLabel("Wo / bei wem").last().fill("Messe Beispiel");
    await page.getByRole("button", { name: "Referenz hinzufügen" }).click();
    await expect(page.getByText("Messe Beispiel")).toBeVisible();
    const vis = page.getByRole("group", { name: "Sichtbarkeit" });
    await vis.getByRole("button", { name: "öffentlich" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Öffentlich" })).toBeVisible();
    await expect(vis.getByRole("button", { name: "öffentlich" })).toHaveAttribute("aria-pressed", "true");
    // Verbindungen: Projekt aus der Shortlist; Kontakt nur intern
    await page.getByRole("navigation", { name: "Reiter" }).getByRole("link", { name: "Verbindungen" }).click();
    await expect(page.getByRole("link", { name: /Halbzeit-Gastro schneller/ })).toBeVisible();
    await page.getByRole("navigation", { name: "Reiter" }).getByRole("link", { name: "Kontakt & Vertrauliches" }).click();
    await expect(page.getByText("ab 2.400 € je Modul und Saison")).toBeVisible();

    // Kategorien verwalten
    await page.goto("/admin/netzwerk/kategorien");
    await expect(page.getByText("Sensorik & Messung")).toBeVisible();
    await page.getByLabel("Name").first().fill("Einlasssysteme");
    await page.getByLabel("Trends (Nummern)").first().fill("18");
    await page.getByRole("button", { name: "Kategorie anlegen" }).click();
    await expect(page.getByText("Einlasssysteme")).toBeVisible();
    await page.getByLabel("Name").first().fill("zapfsysteme");
    await page.getByRole("button", { name: "Kategorie anlegen" }).click();
    await expect(page.getByRole("status").filter({ hasText: "gibt es schon" })).toBeVisible();
    await page.getByRole("button", { name: "Kategorienliste vorschlagen" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Testmodus" })).toBeVisible();

    // neuer Eintrag: Merkmal Startup aus dem Gründungsjahr
    await page.goto("/admin/netzwerk/neu");
    await page.getByLabel("Name").fill("Hallen-Catering Nord");
    await page.getByRole("group", { name: /Partner-Typ/ }).getByRole("button", { name: "Solution Provider" }).click();
    await page.getByRole("group", { name: /Partner-Typ/ }).getByRole("button", { name: "Caterer" }).click();
    await page.getByLabel("Gründungsjahr").fill(String(new Date().getFullYear() - 1));
    await expect(page.getByLabel(/Startup \(jünger als 5 Jahre\)/)).toBeChecked();
    await page.getByRole("button", { name: "Eintrag anlegen" }).click();
    await expect(page.getByRole("heading", { name: "Hallen-Catering Nord", level: 1 })).toBeVisible();
    await expect(page.getByText("Caterer · Startup")).toBeVisible();
    await expect(page.getByLabel("Art der Gastronomie")).toBeVisible();
  });

  test("Bewerbung: Formular, Eingang, Annehmen, On hold, Ablehnen, Änderungsanfrage", async ({ page }) => {
    // öffentliches Formular ohne Login, von der Login-Seite verlinkt
    await page.goto("/login");
    await page.getByRole("link", { name: "Jetzt bewerben" }).click();
    await expect(page.getByRole("heading", { name: "Jetzt bewerben", level: 1 })).toBeVisible();
    await page.getByRole("radio", { name: /Solution Provider/ }).check();
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.getByLabel("Organisation *").fill("Becher-Rücknahme GmbH");
    await page.getByLabel("Ihr Name *").fill("Mara Muster");
    await page.getByLabel("E-Mail (geschäftlich) *").fill("mara@becher.example");
    await page.getByLabel("Website").fill("becher.example");
    await page.getByLabel("Gründungsjahr *").fill(String(new Date().getFullYear() - 1));
    await page.getByLabel(/Angebot \(Produkt \/ Leistung\)/).fill("Automaten für die Rückgabe von Mehrwegbechern im Stadion");
    await page.getByRole("checkbox", { name: "Mehrweg" }).check();
    await expect(page.getByRole("checkbox", { name: /einverstanden/ })).toHaveAttribute("required", ""); // Pflichtfeld (Server prüft ebenfalls)
    await page.getByRole("checkbox", { name: /einverstanden/ }).check();
    await page.getByRole("button", { name: "Bewerbung senden" }).click();
    await expect(page.getByRole("heading", { name: "Danke!" })).toBeVisible();

    await loginAs(page, /Redaktion/);
    await page.goto("/admin/netzwerk/eingang");
    await expect(page.getByRole("heading", { name: "Eingang", level: 1 })).toBeVisible();
    await expect(page.getByText(/1 warten noch auf die Bestätigung/)).toBeVisible();
    // neue Bewerbung annehmen: Solution Provider mit 1 Monat kostenlos, Einladungslink zum Kopieren (kein Mailversand im Test)
    await page.getByRole("link", { name: /Becher-Rücknahme GmbH/ }).click();
    const details = page.getByRole("region", { name: "Details" });
    await expect(details.getByRole("heading", { name: "Becher-Rücknahme GmbH" })).toBeVisible();
    await expect(details.getByText("Vorprüfung · entscheidet nicht")).toBeVisible();
    await details.getByRole("button", { name: "Akzeptieren" }).click();
    await expect(details.getByLabel(/Laufzeit/)).toHaveValue("1");
    await expect(details.getByText("1 Monat kostenlos, danach Abo (Abrechnung folgt).")).toBeVisible();
    await details.getByRole("button", { name: "Anlegen und einladen" }).click();
    await expect(details.getByRole("status")).toContainText("Eintrag und Zugang angelegt");
    await expect(details.getByLabel("Einladungslink")).toHaveValue(/\/invite\//);
    await details.getByRole("link", { name: /Zum Eintrag/ }).click();
    await expect(page.getByRole("heading", { name: "Becher-Rücknahme GmbH", level: 1 })).toBeVisible();
    await expect(page.getByText("Solution Provider · Startup")).toBeVisible();

    // On hold mit Wiedervorlage
    await page.goto("/admin/netzwerk/eingang");
    await page.getByRole("link", { name: /SeatServe/ }).click();
    await details.getByRole("button", { name: "On hold" }).click();
    await details.getByLabel("Grund").selectOption("documents");
    await details.getByRole("button", { name: "Auf Wiedervorlage setzen" }).click();
    await expect(details.getByRole("status")).toContainText("On hold bis");

    // Ablehnen mit Textvorlage; ohne Mailversand Text zum Kopieren
    await page.goto("/admin/netzwerk/eingang");
    await page.getByRole("link", { name: /SV Musterhausen/ }).click();
    await expect(details.getByText("E-Mail bei einem Freemail-Anbieter")).toBeVisible();
    await details.getByRole("button", { name: "Ablehnen" }).click();
    await expect(details.getByLabel("Text an den Bewerber")).toHaveValue(/vielen Dank für Ihr Interesse/);
    await details.getByRole("button", { name: "Ablehnen" }).last().click();
    await expect(details.getByRole("status")).toContainText("Abgelehnt");
    await expect(details.getByLabel(/Text der Absage/)).toHaveValue(/Guten Tag Vorstand/);

    // Cockpit: fällige Wiedervorlage mit Ampel, neue Bewerbungen im Funnel
    await page.goto("/admin");
    const holds = page.getByRole("region", { name: "Wiedervorlagen" });
    await expect(holds.getByRole("img", { name: /Ampel rot: Wiedervorlage/i })).toBeVisible(); // Agentur Nord: seit gestern fällig
    await expect(holds.getByText(/SeatServe/)).toBeVisible();

    // Änderungsanfrage eines Solution Providers übernehmen → Eintrag geändert
    await page.goto("/admin/netzwerk/eingang");
    await page.getByRole("link", { name: /Kurzbeschreibung/ }).click();
    await details.getByRole("button", { name: "Übernehmen" }).click();
    await expect(details.getByRole("status")).toContainText("Übernommen");
    await page.goto("/admin/netzwerk/fx-st-2");
    await expect(page.getByText("jetzt auch mit Pfandrückgabe")).toBeVisible();
  });

  test("Partner, Investor und Solution Provider sehen nur ihren Bereich", async ({ page }) => {
    // Partner: Radar und Netzwerk, keine Projekte; Kontakt empfehlen landet im Eingang
    await loginAs(page, /Partner · Verband/);
    const nav = page.getByRole("navigation", { name: "Bereiche" });
    await expect(nav.getByRole("link", { name: /Empfehlen|Kontakt empfehlen/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Projekte/ })).toHaveCount(0);
    await page.goto("/empfehlen");
    await page.getByLabel("Organisation").fill("Halle West");
    await page.getByLabel("E-Mail").fill("info@halle-west.example");
    await page.getByRole("button", { name: "Empfehlung senden" }).click();
    await expect(page.getByRole("status")).toContainText("einverstanden");
    await page.getByRole("checkbox", { name: /einverstanden/ }).check();
    await page.getByRole("button", { name: "Empfehlung senden" }).click();
    await expect(page.getByRole("status")).toContainText("Danke");
    await page.goto("/projekte");
    await expect(page.getByText(/Projekte mit New Spice sind Kunden vorbehalten/)).toBeVisible();

    // Investor: Netzwerk mit öffentlichen Einträgen, nichts Vertrauliches
    await loginAs(page, /Investor · Ventures/);
    await page.goto("/netzwerk");
    await expect(page.getByRole("heading", { name: "Netzwerk", level: 1 })).toBeVisible();
    await expect(page.getByText("ab 2.400 € je Modul und Saison")).toHaveCount(0);
    await page.goto("/empfehlen");
    await expect(page).toHaveURL(/\/radar/);

    // Solution Provider: kein Radar, nur das eigene Profil; Änderung anfragen
    await page.goto("/login");
    await page.getByRole("button", { name: /Solution Provider · TapFlow/ }).click();
    await page.waitForURL("**/profil");
    await expect(page.getByRole("heading", { name: /TapFlow/, level: 1 })).toBeVisible();
    await expect(page.getByText("ab 2.400 € je Modul und Saison")).toHaveCount(0); // Preise stehen nicht im Profil
    await page.getByLabel("Was soll sich ändern?").selectOption("website");
    await page.getByLabel("Neu").fill("https://tapflow.example/neu");
    await page.getByRole("button", { name: "Änderung anfragen" }).click();
    await expect(page.getByRole("status")).toContainText("Redaktion prüft");
    await page.goto("/radar");
    await expect(page).toHaveURL(/\/profil/);
    await expect(page.getByRole("navigation", { name: "Bereiche" }).getByRole("link")).toHaveText([/Mein Profil|Profil/]);
  });

  test("Problem Deep Dive: Briefing prüfen, bearbeiten, als Scouting-Grundlage übernehmen", async ({ page }) => {
    await loginAs(page, /Redaktion/);
    await page.goto("/admin/venture/ch-1");
    const dd = page.getByRole("region", { name: "Problem Deep Dive" });
    await expect(dd.getByText(/Der Engpass ist das Bezahlen/).first()).toBeVisible();
    await expect(dd.getByText("Kassen ohne Schlange (Bilderkennung am Tablett)")).toBeVisible();
    await expect(dd.getByText(/Gastronomie nennt 12 Minuten/)).toBeVisible();
    await expect(dd.getByText("Gespräch Betriebsleitung", { exact: true })).toBeVisible();

    // bearbeiten
    await dd.getByRole("button", { name: "Bearbeiten" }).click();
    await dd.getByLabel("Zusammenfassung", { exact: true }).fill("Halbzeit: Der Engpass ist das Bezahlen. Ziel ist ein Pilot an vier Ständen.");
    await dd.getByLabel("Suchhypothesen").fill("Kassen ohne Schlange | frictionless checkout | Kantine\nPfand am Automaten | reverse vending | Supermarkt");
    await dd.getByRole("button", { name: "Briefing speichern" }).click();
    await expect(dd.getByText("Halbzeit: Der Engpass ist das Bezahlen. Ziel ist ein Pilot an vier Ständen.")).toBeVisible();
    await expect(dd.getByText("Pfand am Automaten")).toBeVisible();

    // übernehmen: Problem der Challenge kommt aus dem Briefing
    await dd.getByRole("button", { name: "Als Scouting-Grundlage übernehmen" }).click();
    await expect(dd.getByRole("status").filter({ hasText: "übernommen" })).toBeVisible();
    await page.reload();
    await expect(page.locator("dl").first().getByText(/Ziel ist ein Pilot an vier Ständen/)).toBeVisible();

    // Notion-Link: im Testmodus nicht gelesen, aber als Gespräch mit Link sichtbar
    await dd.getByLabel("Notion-Link").fill("https://www.notion.so/newspice/Meeting-Caterer-1234567890abcdef1234567890abcdef");
    await dd.getByRole("button", { name: "Einlesen", exact: true }).click();
    await expect(dd.getByRole("status").filter({ hasText: "Notion nicht gelesen" })).toBeVisible();
    await expect(dd.getByRole("link", { name: /In Notion öffnen/ })).toHaveAttribute("href", /notion\.so/);
    await dd.getByLabel("Notion-Link").fill("https://example.org/keine-notion-seite");
    await dd.getByRole("button", { name: "Einlesen", exact: true }).click();
    await expect(dd.getByRole("status").filter({ hasText: "Link auf eine Notion-Seite" })).toBeVisible();

    // ohne Notion: Text einfügen (eingeklappt)
    await dd.getByText("Ohne Notion: Text einfügen oder Datei hochladen").click();
    await dd.getByLabel("Titel").fill("Gespräch Caterer");
    await dd.getByLabel(/Transkript oder Notion-KI/).fill("Caterer: Wir haben 40 Stände. ".repeat(20));
    await dd.getByRole("button", { name: "Auswerten" }).click();
    await expect(dd.getByRole("status").filter({ hasText: "Testmodus" })).toBeVisible();
    await expect(dd.getByText("Gespräch Caterer", { exact: true })).toBeVisible();
  });

  test("Projekte: Anfrage, kuratierte Shortlist, Rückmeldung, Abschluss mit Siegel, Einladung", async ({ page }) => {
    test.slow();
    // Kunde sieht nur Freigegebenes, nichts Internes
    await loginAs(page, /Kunde A · Owner/);
    await page.goto("/projekte");
    await page.getByRole("link", { name: /Halbzeit-Gastro schneller/ }).click();
    const shortlist = page.locator("li").filter({ has: page.getByRole("heading", { name: /QueueLess/ }) });
    await expect(shortlist.getByText("2.000 € im Monat je 10 Stände")).toBeVisible();
    await expect(page.getByRole("heading", { name: /TapFlow/ })).toBeVisible();
    await expect(page.getByText("500 € je Stand und Monat")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Pre-Order Pro/ })).toHaveCount(0);
    await expect(page.getByText(/Rabatt/)).toHaveCount(0);
    await expect(page.getByText("Kalkulation intern.xlsx")).toHaveCount(0);
    await expect(page.getByText("Shortlist Halbzeit-Gastro.pdf")).toBeVisible();

    // Rückmeldung und Nachricht
    await shortlist.getByRole("textbox").fill("Gern ein Erstgespräch im Januar.");
    await shortlist.getByRole("button", { name: "Interessant" }).click();
    await expect(shortlist.getByRole("status")).toHaveText(/Danke/);
    await page.getByRole("textbox", { name: "Nachricht" }).fill("Passt uns der 12. Januar?");
    await page.getByRole("button", { name: "Senden" }).click();
    await expect(page.getByText("Passt uns der 12. Januar?")).toBeVisible();

    // neue Anfrage
    await page.goto("/projekte");
    await page.getByLabel("Worum geht es?").fill("Einlass am Nordtor beschleunigen");
    await page.getByLabel("Was ist heute das Problem?").fill("Vor dem Anpfiff warten die Gäste bis zu 25 Minuten am Nordtor.");
    await page.getByRole("button", { name: "Anfrage senden" }).click();
    await expect(page.getByRole("heading", { name: "Einlass am Nordtor beschleunigen", level: 1 })).toBeVisible();
    await expect(page.getByRole("list", { name: "Phase: Angefragt" })).toBeVisible();

    // andere Organisation sieht nichts davon
    await loginAs(page, /Kunde P · Premium/);
    await page.goto("/projekte");
    await expect(page.getByText(/Halbzeit-Gastro|Nordtor/)).toHaveCount(0);
    await page.goto("/projekte/pr-1");
    await expect(page.getByRole("heading", { name: /Halbzeit-Gastro/ })).toHaveCount(0);

    // Redaktion: Anfrage sehen, Rückmeldung sehen, Auswahl festhalten, abschließen
    await loginAs(page, /Redaktion/);
    await page.goto("/admin/projekte");
    await expect(page.getByRole("heading", { name: /Neue Anfragen/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Einlass am Nordtor/ })).toBeVisible();
    await page.goto("/admin/projekte/pr-1");
    await expect(page.getByText("Gern ein Erstgespräch im Januar.")).toBeVisible();
    await expect(page.getByText(/Intern: Bei QueueLess Rabatt/)).toBeVisible();
    const entry = page.locator("li").filter({ has: page.getByRole("heading", { name: /QueueLess/ }) });
    await entry.getByRole("combobox").selectOption("selected");
    await expect(entry.getByRole("combobox")).toHaveValue("selected");
    await page.getByRole("textbox", { name: "Ergebnis in einem Satz" }).fill("Wartezeit halbiert.");
    await page.getByRole("button", { name: "Abschließen" }).click();
    await expect(page.getByRole("status").filter({ hasText: "New Spice approved" })).toBeVisible();

    // Kundenverwaltung: Einladung mit Link
    await page.goto("/admin/kunden");
    await page.getByRole("link", { name: /Kunde A/ }).click();
    await page.getByLabel("Einladen").fill("neu@kunde-a.example");
    await page.getByRole("button", { name: "Einladen" }).click();
    await expect(page.getByText(/\/invite\/fixture-/)).toBeVisible();
    await expect(page.getByText("neu@kunde-a.example")).toBeVisible();

    // Kunde sieht Abschluss und Siegel
    await loginAs(page, /Kunde A · Owner/);
    await page.goto("/projekte/pr-1");
    await expect(page.getByText("Erfolgreich abgeschlossen.")).toBeVisible();
    await expect(page.getByText("New Spice approved").first()).toBeVisible();
    await expect(page.getByText("Wartezeit halbiert.")).toBeVisible();
  });

  test("Liveticker eingeklappt: neue Meldungen fallen auf", async ({ page }) => {
    test.slow(); // Stadion ist WebGL, ohne GPU langsam
    await loginAs(page, /Kunde A · Member/);
    // eingeklappt, aber noch nie hineingeschaut: Meldungen der letzten 7 Tage gelten als neu
    await page.addInitScript(() => window.localStorage.setItem("trendradar.ticker-eingeklappt", "1"));
    await page.goto("/radar?v=journey");
    await expect(page.getByRole("region", { name: "Liveticker" })).toBeHidden();
    const strip = page.getByRole("button", { name: /Liveticker öffnen, \d+ neue Meldungen/ });
    await expect(strip).toContainText("Neu ·");
    await strip.click();
    await expect(page.getByRole("region", { name: "Liveticker" })).toBeVisible({ timeout: 20_000 });
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
