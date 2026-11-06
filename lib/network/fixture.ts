import "server-only";

import { fixtureAssignments } from "@/lib/projects/fixture";
import { fixtureStartupStore } from "@/lib/venture/fixture";
import { domainOf } from "@/lib/venture/scoring";
import { EMPTY_PRIVATE, MEMBER_DEFAULTS, type Startup } from "@/lib/venture/types";
import type { NetworkRepo, NetworkRun } from "./store";
import type { MemberReference, Offer, OfferCategory, Suggestion } from "./types";

/**
 * Netzwerk-Datenbank im lokalen Testmodus (RADAR_FIXTURES=1). Mitglieder liegen im Speicher von Venture Clienting
 * (dieselben Profile), Kategorien, Angebote, Referenzen und Vorschläge hier. Regeln wie in Migration 0014.
 */
interface Store {
  categories: OfferCategory[];
  offers: Offer[];
  references: MemberReference[];
  interests: Map<string, string[]>;
  orgs: Map<string, string>;
  suggestions: Suggestion[];
  runs: NetworkRun[];
  seq: number;
}

const g = globalThis as unknown as { __trendradarNetwork?: Store };
const B = "[Beispiel] ";

function init(): Store {
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const year = new Date().getFullYear();
  const member = (id: string, name: string, extra: Partial<Startup>): Startup => ({
    id, name: `${B}${name}`, website: null, domain: null, country: "DE", city: null, founded: null, stage: null, funding: null, teamSize: null,
    tagline: null, solution: null, useCases: null, referenceCustomers: null, trendNumbers: [], tags: [], status: "qualified", approved: false,
    published: false, logoUrl: null, sources: [], createdAt: ago(400), updatedAt: ago(72), ...structuredClone(MEMBER_DEFAULTS), region: "DACH", ...extra,
    ...(extra.website ? { domain: domainOf(extra.website) } : {}),
  });
  const members: Startup[] = [
    member("fx-st-2", "TapFlow", { website: "https://tapflow.example", founded: year - 3, isStartup: true, stage: "market", approved: true, source: "application",
      tagline: "Selbstzapfen ohne Warteschlange: Gäste zapfen selbst, bezahlt wird per Karte oder App.", updatedAt: ago(72) }),
    member("nw-kassen", "Kassensysteme AG", { website: "https://kassen.example", founded: 1998, stage: "scale", isPartner: true,
      tagline: "Kassen und Cashless für Stadien, Arenen und Messen.", updatedAt: ago(24 * 30) }),
    member("nw-energie", "Energie GmbH", { website: "https://energie.example", founded: 2004, stage: "scale", isPartner: true,
      tagline: "Batteriespeicher und Energiemanagement für Venues.", updatedAt: ago(24 * 60) }),
    member("nw-greencup", "GreenCup", { website: "https://greencup.example", founded: year - 2, isStartup: true, stage: "pilot", status: "on_hold", source: "application",
      tagline: "Mehrwegbecher mit Rückgabe am Automaten.", updatedAt: ago(24 * 7) }),
    member("nw-fcb", "FC Beispielstadt 1912 e. V.", { partnerTypes: ["club"], status: "review", source: "application",
      details: { league: "Fußball, 3. Liga", venue: "Stadion, 15.000" }, updatedAt: ago(5) }),
    member("nw-hotel", "Hotel am Stadion", { partnerTypes: ["operator", "caterer"], source: "application",
      details: { venue_type: "Hotel", capacity: "180 Zimmer", gastro_type: "Restaurant und Bankett" }, updatedAt: ago(24 * 9) }),
    member("nw-ventures", "Ventures", { partnerTypes: ["investor"], status: "review", source: "application", region: "EU",
      details: { focus: "Fan Experience, Venue-Tech", ticket: "0,5–3 Mio. €" }, updatedAt: ago(30) }),
    member("nw-verband", "Verband Sportstätten", { partnerTypes: ["multiplier"], status: "on_hold", source: "application",
      details: { network: "Betreiber von Sportstätten", reach: "120 Mitglieder" }, updatedAt: ago(24 * 4) }),
  ];
  const vs = fixtureStartupStore();
  for (const m of members) if (!vs.startups.some((x) => x.id === m.id)) vs.startups.push(m);
  vs.priv.set("fx-st-2", { ...EMPTY_PRIVATE, contactName: "Gründung", contactEmail: "hello@tapflow.example", pricing: "ab 2.400 € je Modul und Saison", notes: "Sehr verlässlich im Pilot." });

  const cat = (id: string, name: string, trendNumbers: number[], description: string | null = null): OfferCategory => ({ id, name, description, trendNumbers, archived: false });
  const categories = [
    cat("cat-zapf", "Zapfsysteme", [25], "Selbstzapfen, Smart Schank"),
    cat("cat-kasse", "Kassensysteme", [19, 26], "Kassen, Cashless, Checkout-frei"),
    cat("cat-bestell", "Bestell-Apps", [24], "Mobile Order, In-Seat, Vorbestellung"),
    cat("cat-energie", "Energiespeicher", [34]),
    cat("cat-mehrweg", "Mehrweg", [31]),
    cat("cat-gastro", "Gastronomie", []),
  ];
  const offer = (id: string, memberId: string, title: string, categoryIds: string[], description: string | null = null, position = 0): Offer =>
    ({ id, memberId, title, description, categoryIds, position });
  return {
    categories,
    offers: [
      offer("of-1", "fx-st-2", "TapFlow Wall", ["cat-zapf"], "Selbstzapf-Wand mit Bezahlung per Karte oder App, 8 Zapfhähne je Modul"),
      offer("of-2", "fx-st-2", "TapFlow Insights", ["cat-gastro"], "Auswertung Absatz und Wartezeit je Stand", 1),
      offer("of-3", "nw-kassen", "Stadionkasse", ["cat-kasse"]),
      offer("of-4", "nw-energie", "Speicher für Flutlicht und Gastro", ["cat-energie"]),
      offer("of-5", "nw-greencup", "Mehrwegbecher mit Automat", ["cat-mehrweg"]),
      offer("of-6", "nw-hotel", "Bankett am Spieltag", ["cat-gastro"]),
    ],
    references: [
      { id: "ref-1", memberId: "fx-st-2", client: "Arena Süd", period: "Pilot 2025", result: "−40 % Wartezeit", url: null, published: true, position: 0 },
      { id: "ref-2", memberId: "fx-st-2", client: "Festival", period: "Einsatz 2024", result: "18.000 Gäste", url: null, published: false, position: 1 },
    ],
    interests: new Map([["nw-fcb", ["cat-gastro", "cat-bestell"]], ["nw-ventures", ["cat-kasse", "cat-bestell"]]]),
    orgs: new Map([["nw-hotel", "p"]]),
    suggestions: [
      { id: "sg-1", runId: "nrun-1", kind: "category", memberId: null, title: "Kategorie „Crowd-Management“",
        rationale: "Beispiel: Zwei Kandidaten aus Challenges messen Besucherströme; bisher keine passende Kategorie.",
        payload: { name: "Crowd-Management", description: "Besucherströme messen und lenken", trend_numbers: [37], member_ids: [] }, status: "pending", decidedAt: null, createdAt: ago(3) },
      { id: "sg-2", runId: "nrun-1", kind: "category", memberId: null, title: "Kategorie „Sensorik“",
        rationale: "Beispiel: Füllstände, Wartezeiten und Besucherzahlen werden über Sensoren erfasst – TapFlow nutzt das schon.",
        payload: { name: "Sensorik", description: "Sensoren für Füllstand, Wartezeit und Auslastung", trend_numbers: [11, 37], member_ids: ["fx-st-2"] }, status: "pending", decidedAt: null, createdAt: ago(3) },
    ],
    runs: [{ id: "nrun-1", status: "succeeded", startedAt: ago(3.1), finishedAt: ago(3), model: "claude-opus-5-5", inputTokens: 18_200, outputTokens: 4_100, costUsd: 0.39,
      error: null, task: "categories", suggestions: 2 }],
    seq: 1,
  };
}

const store = () => (g.__trendradarNetwork ??= init());
const startups = () => { store(); return fixtureStartupStore(); };
const clone = <T>(x: T) => structuredClone(x);

export function fixtureNetwork(): NetworkRepo {
  return {
    async members() { return clone([...startups().startups].sort((a, b) => a.name.localeCompare(b.name))); },
    async member(id) {
      const s = startups().startups.find((x) => x.id === id);
      return s ? { member: clone(s), priv: clone(startups().priv.get(id) ?? EMPTY_PRIVATE) } : null;
    },
    async createMember(m) {
      const vs = startups();
      const domain = domainOf(m.website);
      if (domain && vs.startups.some((x) => x.domain === domain)) throw new Error("Einen Eintrag mit dieser Website gibt es schon.");
      const id = `nw-${++store().seq}`;
      const now = new Date().toISOString();
      vs.startups.push({
        id, name: m.name, website: m.website, domain, country: null, city: null, founded: m.founded, stage: null, funding: null, teamSize: null, tagline: null,
        solution: null, useCases: null, referenceCustomers: null, trendNumbers: [], tags: [], status: m.status, approved: false, published: false, logoUrl: null,
        sources: [], createdAt: now, updatedAt: now, ...clone(MEMBER_DEFAULTS), partnerTypes: [...m.partnerTypes], isStartup: m.isStartup,
      });
      return id;
    },
    async setPublished(id, published) {
      const s = startups().startups.find((x) => x.id === id);
      if (!s) throw new Error("Eintrag nicht gefunden.");
      if (published && s.status !== "qualified") throw new Error("Nur aufgenommene Einträge lassen sich veröffentlichen.");
      Object.assign(s, { published, updatedAt: new Date().toISOString() });
    },
    async categories() { return clone([...store().categories].sort((a, b) => a.name.localeCompare(b.name))); },
    async saveCategory(id, c) {
      const s = store();
      const key = c.name.trim().toLowerCase();
      if (s.categories.some((x) => x.id !== id && x.name.trim().toLowerCase() === key)) throw new Error("Eine Kategorie mit diesem Namen gibt es schon.");
      if (id) {
        const x = s.categories.find((k) => k.id === id);
        if (!x) throw new Error("Kategorie nicht gefunden.");
        Object.assign(x, clone(c));
        return id;
      }
      const nid = `cat-${++s.seq}`;
      s.categories.push({ id: nid, ...clone(c) });
      return nid;
    },
    async offers(memberId) { return clone(store().offers.filter((o) => !memberId || o.memberId === memberId).sort((a, b) => a.position - b.position)); },
    async saveOffer(id, memberId, o) {
      const s = store();
      if (id) {
        const x = s.offers.find((k) => k.id === id);
        if (!x) throw new Error("Angebot nicht gefunden.");
        Object.assign(x, clone(o));
        return id;
      }
      const nid = `of-${++s.seq}`;
      s.offers.push({ id: nid, memberId, ...clone(o), position: s.offers.filter((k) => k.memberId === memberId).length });
      return nid;
    },
    async deleteOffer(id) { store().offers = store().offers.filter((o) => o.id !== id); },
    async references(memberId) { return clone(store().references.filter((r) => r.memberId === memberId).sort((a, b) => a.position - b.position)); },
    async saveReference(id, memberId, r) {
      const s = store();
      if (r.url && !/^https?:\/\//.test(r.url)) throw new Error("Der Link muss mit http:// oder https:// beginnen.");
      if (id) {
        const x = s.references.find((k) => k.id === id);
        if (!x) throw new Error("Referenz nicht gefunden.");
        Object.assign(x, clone(r));
        return id;
      }
      const nid = `ref-${++s.seq}`;
      s.references.push({ id: nid, memberId, ...clone(r), position: s.references.filter((k) => k.memberId === memberId).length });
      return nid;
    },
    async deleteReference(id) { store().references = store().references.filter((r) => r.id !== id); },
    async interests(memberId) { return [...(store().interests.get(memberId) ?? [])]; },
    async setInterests(memberId, ids) { store().interests.set(memberId, [...ids]); },
    async customerOrgs() { return new Map(store().orgs); },
    async setCustomerOrg(memberId, orgId) {
      if (orgId) store().orgs.set(memberId, orgId);
      else store().orgs.delete(memberId);
    },
    async assignments(memberId) { return clone(fixtureAssignments(memberId)); },
    async suggestions(status) { return clone(store().suggestions.filter((x) => !status || x.status === status)); },
    async decideSuggestion(id, status, payload) {
      const x = store().suggestions.find((k) => k.id === id && k.status === "pending");
      if (!x) throw new Error("Über diesen Vorschlag ist bereits entschieden.");
      Object.assign(x, { status, decidedAt: new Date().toISOString(), ...(payload ? { payload: clone(payload) } : {}) });
    },
    async runs() { return clone(store().runs); },
  };
}
