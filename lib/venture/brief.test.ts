import { describe, expect, it } from "vitest";
import { briefForScouting, challengeFieldsFromBrief, EMPTY_BRIEF, parseBriefReport, readBrief, type Brief } from "./brief";
import { cleanText, fromFile, htmlToText } from "./transcript";

const brief: Brief = {
  ...EMPTY_BRIEF,
  summary: "In der Halbzeit verlieren wir Umsatz an den Ständen.",
  problem: "Gäste warten 12 Minuten.",
  current_process: "Bestellen und Bezahlen an derselben Kasse.",
  context: "Arena, 50.000 Plätze.",
  stakeholders: [{ role: "Betriebsleitung", interest: "Durchsatz" }],
  goal: "Wartezeit senken.",
  success_criteria: ["unter 4 Minuten"],
  must_haves: ["DSGVO-konform"],
  nice_to_haves: ["Pfand integriert"],
  exclusions: ["Komplett neue Kassen"],
  constraints: [{ topic: "budget", text: "Pilot bis 50.000 €" }],
  existing_systems: ["Kassensystem X"],
  search_hypotheses: [{ approach: "Kassen ohne Schlange", keywords: ["frictionless checkout"], analogies: ["Kantine"] }],
  open_questions: ["Wer betreibt die Stände?"],
  pain_points: [{ text: "Abbruch in der Schlange", evidence: "jeder 5. Gast", from: "Gespräch 1" }],
  timeframe: "Rückrunde",
};

describe("Problem-Briefing", () => {
  it("füllt die Challenge-Felder", () => {
    const f = challengeFieldsFromBrief(brief);
    expect(f.problem).toContain("12 Minuten");
    expect(f.problem).toContain("Heute: Bestellen und Bezahlen");
    expect(f.goal).toContain("- unter 4 Minuten");
    expect(f.context).toContain("Beteiligte: Betriebsleitung (Durchsatz)");
    expect(f.context).toContain("Vorhandene Systeme: Kassensystem X");
    expect(f.mustHaves).toEqual(["DSGVO-konform"]);
    expect(f.timeframe).toBe("Rückrunde");
    expect("budget" in f).toBe(false);
  });

  it("gibt dem Venture-Agenten Hypothesen und offene Fragen mit", () => {
    const t = briefForScouting(brief);
    expect(t).toContain("Kassen ohne Schlange – Suchbegriffe: frictionless checkout – Analogien: Kantine");
    expect(t).toContain("Budget: Pilot bis 50.000 €");
    expect(t).toContain("Abbruch in der Schlange (jeder 5. Gast)");
    expect(t).toContain("Wer betreibt die Stände?");
  });

  it("prüft den Bericht des Agenten und liest alte Stände tolerant", () => {
    expect(parseBriefReport({ brief, session_summary: "Kurz." }).sessionSummary).toBe("Kurz.");
    expect(() => parseBriefReport({ brief: { ...brief, constraints: [{ topic: "magie", text: "x" }] }, session_summary: "" })).toThrow();
    expect(readBrief({ summary: "alt" })?.summary).toBe("alt");
    expect(readBrief(null)).toBeNull();
  });
});

describe("Transkripte", () => {
  it("macht aus HTML lesbaren Text", () => {
    expect(htmlToText("<h1>Gespräch</h1><p>Wartezeit &amp; Umsatz</p><ul><li>eins</li><li>zwei</li></ul><script>x()</script>")).toBe("Gespräch\nWartezeit & Umsatz\n- eins\n- zwei");
  });
  it("säubert Text", () => {
    expect(cleanText("a\r\n\r\n\r\n\r\nb\u0007")).toBe("a\n\nb");
  });
  it("erkennt Dateiarten", () => {
    expect(fromFile("notiz.md", "", new TextEncoder().encode("# Hallo"))).toEqual({ kind: "text", text: "# Hallo" });
    expect(fromFile("x.pdf", "application/pdf", new Uint8Array([37, 80])).kind).toBe("pdf");
    expect(() => fromFile("x.docx", "application/vnd.openxmlformats", new Uint8Array())).toThrow(/Notion/);
  });
});

describe("Briefing bearbeiten", () => {
  it("hin und zurück ohne Verlust", async () => {
    const m = await import("./brief");
    expect(m.painFrom(m.painLines(brief.pain_points))).toEqual(brief.pain_points);
    expect(m.stakeFrom(m.stakeLines(brief.stakeholders))).toEqual(brief.stakeholders);
    expect(m.constraintFrom(m.constraintLines(brief.constraints))).toEqual(brief.constraints);
    expect(m.hypoFrom(m.hypoLines(brief.search_hypotheses))).toEqual(brief.search_hypotheses);
  });
  it("versteht freie Eingaben", async () => {
    const m = await import("./brief");
    expect(m.painFrom("Schlange zu lang\n\n  ")).toEqual([{ text: "Schlange zu lang", evidence: null, from: null }]);
    expect(m.constraintFrom("Datenschutz: keine Kameras\nirgendwas")).toEqual([{ topic: "datenschutz", text: "keine Kameras" }, { topic: "sonstiges", text: "irgendwas" }]);
    expect(m.hypoFrom("Vorbestellung | mobile order, click & collect")).toEqual([{ approach: "Vorbestellung", keywords: ["mobile order", "click & collect"], analogies: [] }]);
  });
});
