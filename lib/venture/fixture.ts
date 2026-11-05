import "server-only";

import { domainOf, totalOf } from "./scoring";
import type { ChallengeInput, StartupInput, VentureRepo, VentureRun } from "./store";
import { EMPTY_BRIEF, type Brief } from "./brief";
import { CRITERIA, EMPTY_PRIVATE, type Candidate, type Challenge, type CriterionKey, type DeepDiveSession, type Startup, type StartupPrivate } from "./types";

/**
 * Venture Clienting im lokalen Testmodus (RADAR_FIXTURES=1): eine Beispiel-Challenge mit vorbewerteten Kandidaten.
 * Zustand im Speicher des Server-Prozesses; Entscheidungen verhalten sich wie decide_candidate() in Migration 0009.
 */
interface Store {
  challenges: Challenge[];
  candidates: Candidate[];
  startups: Startup[];
  priv: Map<string, StartupPrivate>;
  runs: (VentureRun & { challengeId: string })[];
  sessions: (DeepDiveSession & { challengeId: string })[];
  seq: number;
}

const g = globalThis as unknown as { __trendradarVenture?: Store };
const B = "[Beispiel] ";

function init(): Store {
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const challenge: Challenge = {
    id: "ch-1", title: `${B}Wartezeit am Bierstand in der Halbzeit`, status: "review", createdAt: ago(30), lastRunAt: ago(2),
    problem: "In der Halbzeitpause stehen Gäste im Schnitt 12 Minuten am Bierstand an. Viele geben auf, der Umsatz in den 15 Minuten bleibt unter den Möglichkeiten.",
    goal: "Wartezeit unter 4 Minuten, Umsatz pro Gast in der Halbzeit +10 %, Zufriedenheit am Stand messbar besser.",
    context: "Bundesliga-Stadion, 50.000 Plätze, 40 Verkaufsstände, Kassensystem vorhanden, Pfandbecher.",
    audience: "public", journeyStages: ["stadion"], trendNumbers: [24, 25, 26], regions: ["DACH", "EU"], minMaturity: "pilot",
    mustHaves: ["DSGVO-konform", "Anbindung an bestehendes Kassensystem", "Betrieb bei 50.000 Gästen"], exclusions: [], leads: [],
    timeframe: "Pilot in der Rückrunde 2027", budget: "Pilot bis 50.000 €", maxCandidates: 8, maxSearches: 15, maxCostUsd: 3,
    model: "claude-opus-5-5", effort: "high", briefUpdatedAt: ago(26),
    brief: {
      ...EMPTY_BRIEF,
      summary: "In der Halbzeitpause bilden sich an den 40 Ständen Schlangen; viele Gäste geben auf. Der Engpass ist das Bezahlen, nicht das Zapfen.",
      problem: "Im Schnitt 12 Minuten Wartezeit in der Halbzeit, an den Ständen hinter den Kurven bis zu 18 Minuten.",
      current_process: "Bestellen, Zapfen und Bezahlen an derselben Kasse; eine Kraft je Kasse; Pfand wird am selben Stand zurückgegeben.",
      context: "Bundesliga-Stadion, 50.000 Plätze, 40 Verkaufsstände, Catering durch einen Dienstleister.",
      root_causes: ["Bezahlvorgang dauert zu lang (Karte, Bargeld, Pfand)", "Alle wollen in denselben 15 Minuten"],
      pain_points: [
        { text: "Gäste brechen das Anstehen ab", evidence: "geschätzt jeder fünfte Gast", from: "Gespräch Gastronomie" },
        { text: "Personal fehlt an Spieltagen", evidence: null, from: "Gespräch Betriebsleitung" },
      ],
      stakeholders: [{ role: "Leitung Gastronomie", interest: "Umsatz je Gast" }, { role: "Betriebsleitung", interest: "Sicherheit auf den Umläufen" }],
      goal: "Wartezeit in der Halbzeit deutlich senken, ohne mehr Personal.",
      success_criteria: ["Wartezeit unter 4 Minuten", "Umsatz pro Gast in der Halbzeit +10 %"],
      must_haves: ["DSGVO-konform", "Anbindung an bestehendes Kassensystem", "Betrieb bei 50.000 Gästen"],
      nice_to_haves: ["Pfandrückgabe integriert"],
      exclusions: ["Komplett neue Kasseninfrastruktur"],
      constraints: [{ topic: "budget", text: "Pilot bis 50.000 €" }, { topic: "zeit", text: "Pilot in der Rückrunde" }],
      existing_systems: ["Kassensystem des Caterers", "Club-App"],
      search_hypotheses: [
        { approach: "Kassen ohne Schlange (Bilderkennung am Tablett)", keywords: ["frictionless checkout", "computer vision kasse"], analogies: ["Kantine", "Supermarkt"] },
        { approach: "Vorbestellung mit Abholzeitfenster", keywords: ["mobile order pickup", "click and collect stadium"], analogies: ["Schnellrestaurant", "Flughafen"] },
      ],
      open_questions: ["Wer entscheidet beim Caterer über neue Kassentechnik?", "Gibt es Daten zu Wartezeiten je Stand?"],
      contradictions: ["Gastronomie nennt 12 Minuten, Betriebsleitung eher 8 Minuten"],
      timeframe: "Pilot in der Rückrunde 2027", budget: "Pilot bis 50.000 €",
    } as Brief,
  };
  const sc = (vals: number[], why: string[]) =>
    CRITERIA.map((c, i) => ({ criterion: c.key as CriterionKey, score: vals[i], rationale: why[i] ?? "Beispielbegründung.", source_url: null }));
  const cand = (id: string, name: string, website: string, vals: number[], rec: Candidate["recommendation"], extra: Partial<Candidate>): Candidate => {
    const scores = sc(vals, []);
    return {
      id, challengeId: challenge.id, runId: "run-1", startupId: null, name: `${B}${name}`, website, domain: domainOf(website), country: "DE", founded: 2021,
      stage: "market", funding: null, summary: "Beispielkandidat für den Testmodus.", approach: null, scores, total: totalOf(scores), recommendation: rec,
      mustHaveGaps: [], openQuestions: [], sources: [{ url: website, title: "Website" }], uncertain: false, status: "pending",
      decidedAt: null, decisionNote: null, createdAt: ago(2), example: true, ...extra,
    };
  };
  const candidates: Candidate[] = [
    cand("cand-1", "QueueLess", "https://queueless.example", [5, 4, 4, 4, 4, 3, 3], "shortlist", {
      summary: "Kamerabasierte Kasse erkennt Getränke und Snacks auf dem Tablett, Gäste zahlen kontaktlos in Sekunden.",
      approach: "Aus Betriebskantinen übertragen, erste Arenen in den Niederlanden.", funding: "Seed, 6 Mio. € (2025)",
      openQuestions: ["Wie verhält sich das System bei 40 Ständen gleichzeitig?", "Welche Kassensysteme sind angebunden?"],
    }),
    cand("cand-2", "TapFlow", "https://tapflow.example", [4, 3, 3, 3, 4, 3, 3], "watch", {
      summary: "Selbstzapf-Wand mit Bezahlung per Karte, bis zu 4 Zapfhähne je Gast parallel.", stage: "pilot",
      mustHaveGaps: ["Anbindung an bestehendes Kassensystem nicht belegt"], openQuestions: ["Wie wird das Jugendschutzalter geprüft?"],
    }),
    cand("cand-3", "Pre-Order Pro", "https://preorder.example", [4, 4, 2, 4, 3, 4, 4], "watch", {
      summary: "Vorbestellung per App mit Abholfach, Slot-Steuerung für die Halbzeit.", approach: "Analogie: Abholstationen im Handel.",
    }),
    cand("cand-4", "CrowdSense", "https://crowdsense.example", [2, 3, 2, 3, 2, 3, 3], "no_fit", {
      summary: "Misst Besucherströme an Flughäfen, Warteschlangen nur als Anzeige.", country: "NL", uncertain: true,
    }),
  ];
  return {
    challenges: [challenge], candidates, startups: [], priv: new Map(), seq: 1,
    sessions: [
      { id: "dd-1", challengeId: challenge.id, title: "Gespräch Gastronomie", heldOn: ago(40).slice(0, 10), source: "paste", fileName: null, charCount: 21_400, status: "done", error: null, createdAt: ago(40),
        summary: "Beispiel: Der Engpass ist das Bezahlen; geschätzt jeder fünfte Gast bricht ab. Budget für einen Piloten vorhanden." },
      { id: "dd-2", challengeId: challenge.id, title: "Gespräch Betriebsleitung", heldOn: ago(26).slice(0, 10), source: "upload", fileName: "Notion-Export.md", charCount: 14_900, status: "done", error: null, createdAt: ago(26),
        summary: "Beispiel: Sicherheit auf den Umläufen ist Bedingung; Personal ist knapp; Wartezeit wird eher auf 8 Minuten geschätzt." },
    ],
    runs: [{ id: "run-1", challengeId: challenge.id, status: "succeeded", startedAt: ago(2.1), finishedAt: ago(2), costUsd: 1.84, searches: 12, error: null,
      strategy: "Beispiel: Kassen ohne Schlange, Vorbestellung, Selbstzapfen; Analogien aus Kantinen und Handel.", notes: "Beispiel für den Testmodus.", found: 4 }],
  };
}

const store = () => (g.__trendradarVenture ??= init());

export function fixtureVenture(): VentureRepo {
  return {
    async challenges() { return structuredClone(store().challenges); },
    async challenge(id) { return structuredClone(store().challenges.find((c) => c.id === id) ?? null); },
    async saveChallenge(id, c: ChallengeInput) {
      const s = store();
      if (id) {
        const i = s.challenges.findIndex((x) => x.id === id);
        if (i < 0) throw new Error("Challenge nicht gefunden.");
        s.challenges[i] = { ...s.challenges[i], ...structuredClone(c) };
        return id;
      }
      const nid = `ch-${++s.seq}`;
      s.challenges.unshift({ ...structuredClone(c), id: nid, lastRunAt: null, createdAt: new Date().toISOString() });
      return nid;
    },
    async candidates(challengeId) {
      return structuredClone(store().candidates.filter((c) => !challengeId || c.challengeId === challengeId).sort((a, b) => b.total - a.total));
    },
    async decide(candidateId, decision, note) {
      const s = store();
      const c = s.candidates.find((x) => x.id === candidateId);
      if (!c) throw new Error("Kandidat nicht gefunden.");
      if (c.status !== "pending" && c.status !== "watch") throw new Error("Über diesen Kandidaten ist bereits entschieden.");
      if (decision === "rejected" && !note?.trim()) throw new Error("Bitte eine Begründung angeben.");
      let sid = c.startupId;
      if (decision === "qualified") {
        const trends = s.challenges.find((x) => x.id === c.challengeId)?.trendNumbers ?? [];
        const existing = sid ? s.startups.find((x) => x.id === sid) : s.startups.find((x) => c.domain && x.domain === c.domain);
        if (existing) {
          existing.status = "qualified";
          existing.trendNumbers = [...new Set([...existing.trendNumbers, ...trends])].sort((a, b) => a - b);
          sid = existing.id;
        } else {
          sid = `st-${++s.seq}`;
          const now = new Date().toISOString();
          s.startups.push({
            id: sid, name: c.name, website: c.website, domain: c.domain, country: c.country, city: null, founded: c.founded, stage: c.stage,
            funding: c.funding, teamSize: null, tagline: null, solution: c.summary, useCases: null, referenceCustomers: null, trendNumbers: [...trends],
            tags: [], status: "qualified", approved: false, published: false, logoUrl: null, sources: c.sources, createdAt: now, updatedAt: now,
          });
        }
      }
      Object.assign(c, { status: decision, startupId: sid, decidedAt: new Date().toISOString(), decisionNote: note?.trim() || null });
      return sid;
    },
    async startups() { return structuredClone([...store().startups].sort((a, b) => a.name.localeCompare(b.name))); },
    async startup(id) {
      const s = store().startups.find((x) => x.id === id);
      return s ? { startup: structuredClone(s), priv: structuredClone(store().priv.get(id) ?? EMPTY_PRIVATE) } : null;
    },
    async saveStartup(id, input: StartupInput, priv) {
      const s = store().startups.find((x) => x.id === id);
      if (!s) throw new Error("Startup nicht gefunden.");
      if (input.published && input.status !== "qualified") throw new Error("Archivierte Profile lassen sich nicht veröffentlichen.");
      Object.assign(s, structuredClone(input), { domain: domainOf(input.website), updatedAt: new Date().toISOString() });
      store().priv.set(id, structuredClone(priv));
    },
    async runs(challengeId) { return structuredClone(store().runs.filter((r) => r.challengeId === challengeId)); },
    async sessions(challengeId) {
      return structuredClone(store().sessions.filter((s) => s.challengeId === challengeId).map(({ challengeId: _c, ...s }) => { void _c; return s; }));
    },
    async addSession(challengeId, s) {
      const id = `dd-${++store().seq}`;
      // Testmodus: keine Auswertung – der Eintrag zeigt, wo das Ergebnis erscheinen würde
      store().sessions.push({ ...s, id, challengeId, status: "failed", summary: null, error: "Im Testmodus wird nicht ausgewertet (kein API-Schlüssel).", createdAt: new Date().toISOString() });
      return id;
    },
    async deleteSession(id) { store().sessions = store().sessions.filter((s) => s.id !== id); },
    async resetSession(id) {
      const s = store().sessions.find((x) => x.id === id);
      if (!s) throw new Error("Gespräch nicht gefunden.");
      Object.assign(s, { status: "failed", error: "Im Testmodus wird Notion nicht gelesen." });
      return { sourceUrl: s.sourceUrl ?? null };
    },
    async saveBrief(challengeId, brief) {
      const c = store().challenges.find((x) => x.id === challengeId);
      if (!c) throw new Error("Challenge nicht gefunden.");
      Object.assign(c, { brief: structuredClone(brief), briefUpdatedAt: new Date().toISOString() });
    },
  };
}

/** Testmodus: veröffentlichte Profile für den Radar (wie die RLS-Regel startups_read_published) */
export function fixturePublishedStartups(): Startup[] {
  const s = g.__trendradarVenture;
  return s ? structuredClone(s.startups.filter((x) => x.published && x.status === "qualified")) : [];
}
