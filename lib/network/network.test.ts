import { describe, expect, it } from "vitest";
import { MEMBER_DEFAULTS, type Startup } from "@/lib/venture/types";
import { CATEGORY_TOOL, categoryMessage, parseCategoryReport } from "./agent";
import { suggestStartup, type Offer, type OfferCategory } from "./types";
import { buildRows, countByCategory, countByType, filterRows, matchesQuery, memberTrends, subtitle } from "./view";

const member = (id: string, extra: Partial<Startup> = {}): Startup => ({
  id, name: id, website: null, domain: null, country: null, city: null, founded: null, stage: null, funding: null, teamSize: null, tagline: null,
  solution: null, useCases: null, referenceCustomers: null, trendNumbers: [], tags: [], status: "qualified", approved: false, published: false,
  logoUrl: null, sources: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...structuredClone(MEMBER_DEFAULTS), ...extra,
});
const cat = (id: string, name: string, trendNumbers: number[], archived = false): OfferCategory => ({ id, name, description: null, trendNumbers, archived });
const offer = (id: string, memberId: string, categoryIds: string[]): Offer => ({ id, memberId, title: id, description: null, categoryIds, position: 0 });

const categories = [cat("k", "Kassensysteme", [19, 26]), cat("z", "Zapfsysteme", [25]), cat("alt", "Altes", [1], true)];
const members = [
  member("tapflow", { isStartup: true, tags: ["Self-Pour"] }),
  member("kasse", { isPartner: true, trendNumbers: [11] }),
  member("fcb", { partnerTypes: ["club"], status: "review", details: { league: "3. Liga", venue: "Stadion, 15.000" } }),
  member("hotel", { partnerTypes: ["operator", "caterer"] }),
  member("weg", { status: "archived" }),
];
const offers = [offer("o1", "tapflow", ["z", "alt"]), offer("o2", "kasse", ["k"]), offer("o3", "kasse", ["k", "z"])];
const rows = buildRows(members, offers, categories);
const row = (id: string) => rows.find((r) => r.member.id === id)!;

describe("Trends über Angebotskategorien", () => {
  it("leitet Trends aus den Kategorien ab, archivierte zählen nicht, bisherige Zuordnung bleibt", () => {
    expect(row("tapflow").trends).toEqual([25]);
    expect(row("kasse").trends).toEqual([11, 19, 25, 26]);
    expect(memberTrends({ trendNumbers: [] }, ["unbekannt"], categories)).toEqual([]);
  });
  it("sammelt Kategorien über alle Angebote ohne Dubletten", () => {
    expect(row("kasse").categoryIds).toEqual(["k", "z"]);
    expect(row("kasse").offerCount).toBe(2);
    expect(row("fcb").offerCount).toBe(0);
  });
});

describe("Filter der Liste", () => {
  const ids = (f: Parameters<typeof filterRows>[1]) => filterRows(rows, f, categories).map((r) => r.member.id);
  it("blendet Archivierte aus, außer sie werden gefiltert", () => {
    expect(ids({})).toEqual(["tapflow", "kasse", "fcb", "hotel"]);
    expect(ids({ status: "archived" })).toEqual(["weg"]);
    expect(ids({ status: "review" })).toEqual(["fcb"]);
  });
  it("Partner-Typ: auch bei mehreren Typen", () => {
    expect(ids({ type: "caterer" })).toEqual(["hotel"]);
    expect(ids({ type: "operator" })).toEqual(["hotel"]);
    expect(ids({ type: "solution_provider" })).toEqual(["tapflow", "kasse"]);
  });
  it("Kategorie, „bietet etwas an“ und Startups", () => {
    expect(ids({ category: "z" })).toEqual(["tapflow", "kasse"]);
    expect(ids({ offers: true })).toEqual(["tapflow", "kasse"]);
    expect(ids({ startup: true })).toEqual(["tapflow"]);
  });
  it("Suche nach Name, Kategorie, Schlagwort und Trendnummer", () => {
    expect(ids({ q: "kassen" })).toEqual(["kasse"]);
    expect(ids({ q: "self-pour" })).toEqual(["tapflow"]);
    expect(ids({ q: "#25" })).toEqual(["tapflow", "kasse"]);
    expect(ids({ q: "26" })).toEqual(["kasse"]);
    expect(matchesQuery(row("fcb"), "  ", categories)).toBe(true);
  });
  it("zählt je Typ und Kategorie ohne Archivierte", () => {
    expect(countByType(rows)).toMatchObject({ solution_provider: 2, club: 1, operator: 1, caterer: 1, investor: 0 });
    expect(countByCategory(rows).get("z")).toBe(2);
  });
  it("Untertitel: Startup/Partner bzw. Angaben je Typ", () => {
    expect(subtitle(row("tapflow").member)).toBe("Startup");
    expect(subtitle(row("kasse").member)).toBe("Partner");
    expect(subtitle(row("fcb").member)).toBe("3. Liga, Stadion, 15.000");
  });
});

describe("Merkmal Startup", () => {
  it("schlägt „Startup“ nur bei weniger als 5 Jahren vor", () => {
    expect(suggestStartup(2022, 2026)).toBe(true);
    expect(suggestStartup(2021, 2026)).toBe(false);
    expect(suggestStartup(null, 2026)).toBeNull();
  });
});

describe("Netzwerk-Manager: Kategorien", () => {
  const briefing = {
    members: [{ id: "m1", name: "TapFlow", types: ["Solution Provider"], text: "Selbstzapfen", tags: [] }],
    trends: [{ number: 24, name: "Mobile Order" }, { number: 25, name: "Self-Pour" }],
    existing: ["Kassensysteme"],
  };
  it("übernimmt nur bekannte Trends und Mitglieder, ohne Dubletten und ohne Begründung", () => {
    const r = parseCategoryReport({
      notes: "ok",
      categories: [
        { name: "  Zapfsysteme ", description: "Selbstzapfen", trend_numbers: [25, 25, 99], member_ids: ["m1", "x"], rationale: "TapFlow bietet das an." },
        { name: "zapfsysteme", description: "", trend_numbers: [], member_ids: [], rationale: "Doppelt." },
        { name: "Kassensysteme", description: "", trend_numbers: [], member_ids: [], rationale: "Gibt es schon." },
        { name: "Bestell-Apps", description: "", trend_numbers: [24], member_ids: [], rationale: "  " },
      ],
    }, briefing);
    expect(r.categories).toEqual([{ name: "Zapfsysteme", description: "Selbstzapfen", trend_numbers: [25], member_ids: ["m1"], rationale: "TapFlow bietet das an." }]);
    expect(r.rejected).toBe(3);
    expect(r.notes).toBe("ok");
  });
  it("begrenzt auf 40 Kategorien", () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ name: `K${i}`, description: "", trend_numbers: [], member_ids: [], rationale: "x" }));
    expect(parseCategoryReport({ notes: "", categories: many }, briefing).categories).toHaveLength(40);
  });
  it("wirft bei kaputter Antwort", () => {
    expect(() => parseCategoryReport({ categories: "nein" }, briefing)).toThrow();
  });
  it("Nachricht enthält Trends, bestehende Kategorien und Mitglieder mit ID", () => {
    const msg = categoryMessage({ ...briefing, candidates: [{ name: "QueueLess", text: "Kasse ohne Schlange" }] });
    expect(msg).toContain("#25 – Self-Pour");
    expect(msg).toContain("nicht erneut vorschlagen): Kassensysteme");
    expect(msg).toContain("[m1] TapFlow (Solution Provider)");
    expect(msg).toContain("QueueLess");
  });
  it("Tool-Schema ist strikt", () => {
    expect(CATEGORY_TOOL.strict).toBe(true);
    expect(CATEGORY_TOOL.input_schema.properties.categories.items.required).toContain("rationale");
  });
});
