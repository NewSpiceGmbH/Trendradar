import "server-only";

import { fixtureNetwork } from "@/lib/network/fixture";
import { fixtureAddOrg } from "@/lib/projects/fixture";
import { fixtureStartupStore } from "@/lib/venture/fixture";
import type { AcceptResult, ApplicationsRepo } from "./store";
import { buildPrecheck } from "./precheck";
import { kindOf, type Application, type ChangeRequest } from "./types";

/**
 * Eingang im lokalen Testmodus (RADAR_FIXTURES=1). Zustand im Speicher des Server-Prozesses; Regeln wie in Migration 0015
 * (annehmen legt Eintrag und Organisation an, Solution Provider fragen nur für ihr eigenes Profil an).
 */
interface Store { applications: Application[]; changes: ChangeRequest[]; seq: number }
const g = globalThis as unknown as { __trendradarApplications?: Store };
const B = "[Beispiel] ";

function init(): Store {
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const day = (n: number) => new Date(now + n * 86_400_000).toISOString().slice(0, 10);
  const app = (id: string, extra: Partial<Application> & Pick<Application, "partnerType" | "orgName" | "email">): Application => ({
    id, contactName: null, contactRole: null, website: null, founded: null, details: {}, offer: null, offerCategoryIds: [], maturity: null,
    referencesText: null, pitchDeckPath: null, message: null, source: "form", recommendedBy: null, status: "new", holdReason: null, holdUntil: null,
    decisionNote: null, decidedAt: null, memberId: null, orgId: null, precheck: null, emailConfirmedAt: ago(1), createdAt: ago(2), ...extra,
  });
  return {
    applications: [
      app("ap-1", { partnerType: "solution_provider", orgName: `${B}SeatServe GmbH`, email: "team@seatserve.example", website: "https://seatserve.example",
        contactName: "Gründer", contactRole: "Geschäftsführung", founded: new Date().getFullYear() - 2, maturity: "pilot", createdAt: ago(3),
        offer: "Bestellung am Platz per QR-Code, Lieferung durch Runner", offerCategoryIds: ["cat-bestell"], referencesText: "Pilot in einer Handball-Arena (2026)",
        message: "Wir suchen Vereine für weitere Piloten.", pitchDeckPath: "beispiel/seatserve.pdf",
        precheck: buildPrecheck({ email: "team@seatserve.example", website: "https://seatserve.example", reachable: true, duplicates: [] }) }),
      app("ap-2", { partnerType: "club", orgName: `${B}SV Musterhausen 1898`, email: "info@gmx.de", contactName: "Vorstand", details: { league: "Fußball, Regionalliga", venue: "Stadion, 8.000" },
        website: "https://sv-muster.example", message: "Interesse am Radar und an Projekten zur Stadiongastronomie.", createdAt: ago(20),
        precheck: buildPrecheck({ email: "info@gmx.de", website: "https://sv-muster.example", reachable: false, duplicates: [] }) }),
      app("ap-3", { partnerType: "multiplier", orgName: `${B}Agentur Nord`, email: "kontakt@agentur-nord.example", status: "on_hold", holdReason: "internal",
        holdUntil: day(-1), decidedAt: ago(200), createdAt: ago(240), details: { network: "Event-Agenturen", reach: "40 Agenturen" } }),
      app("ap-4", { partnerType: "operator", orgName: `${B}Arena Süd`, email: "betrieb@arena-sued.example", source: "partner", recommendedBy: "fixture-partner",
        contactName: "Betriebsleitung", message: "Empfohlen vom Verband: sucht Lösungen für den Einlass.", createdAt: ago(6), emailConfirmedAt: null }),
      app("ap-5", { partnerType: "investor", orgName: `${B}Noch unbestätigt`, email: "x@unbestaetigt.example", status: "unconfirmed", emailConfirmedAt: null, createdAt: ago(1) }),
    ],
    changes: [
      { id: "cr-1", memberId: "fx-st-2", memberName: `${B}TapFlow`, field: "tagline", oldValue: "Selbstzapfen ohne Warteschlange: Gäste zapfen selbst, bezahlt wird per Karte oder App.",
        newValue: "Selbstzapfen ohne Warteschlange – jetzt auch mit Pfandrückgabe.", comment: "Neue Funktion seit Oktober", status: "open", decisionNote: null, decidedAt: null, createdAt: ago(5) },
    ],
    seq: 1,
  };
}

const store = () => (g.__trendradarApplications ??= init());
const clone = <T>(x: T) => structuredClone(x);

export function fixtureApplications(): ApplicationsRepo {
  const find = (id: string) => {
    const a = store().applications.find((x) => x.id === id);
    if (!a) throw new Error("Bewerbung nicht gefunden.");
    return a;
  };
  const open = (a: Application) => {
    if (a.status !== "new" && a.status !== "on_hold") throw new Error("Über diese Bewerbung ist bereits entschieden.");
  };
  return {
    async applications() { return clone([...store().applications].sort((a, b) => b.createdAt.localeCompare(a.createdAt))); },
    async application(id) { return clone(store().applications.find((x) => x.id === id) ?? null); },
    async hold(id, reason, until) {
      const a = find(id); open(a);
      Object.assign(a, { status: "on_hold", holdReason: reason, holdUntil: until, decidedAt: new Date().toISOString() });
    },
    async reject(id, note) {
      const a = find(id); open(a);
      Object.assign(a, { status: "rejected", decisionNote: note, decidedAt: new Date().toISOString(), holdReason: null, holdUntil: null });
    },
    async accept(id, o): Promise<AcceptResult> {
      const a = find(id); open(a);
      const net = fixtureNetwork();
      const host = a.website ? new URL(a.website).hostname.replace(/^www\./, "") : null;
      const existing = host ? fixtureStartupStore().startups.find((s) => s.domain === host) : undefined;
      const memberId = existing?.id ?? await net.createMember({
        name: a.orgName, website: a.website, partnerTypes: [a.partnerType], founded: a.founded,
        isStartup: a.partnerType === "solution_provider" && a.founded != null && new Date().getFullYear() - a.founded < 5, status: "qualified",
      }, "fixture-redaktion");
      const m = fixtureStartupStore().startups.find((s) => s.id === memberId)!;
      Object.assign(m, { source: "application", details: { ...a.details }, stage: a.maturity, solution: a.offer, referenceCustomers: a.referencesText });
      if (a.offer) await net.saveOffer(null, memberId, { title: a.offer.slice(0, 120), description: a.offer, categoryIds: a.offerCategoryIds });
      const orgId = `org-${++store().seq}`;
      const today = new Date();
      const until = o.months == null ? null : new Date(today.getFullYear(), today.getMonth() + o.months, today.getDate()).toISOString().slice(0, 10);
      fixtureAddOrg({ id: orgId, name: o.orgName, tier: o.tier, seats: o.seats, accessFrom: today.toISOString().slice(0, 10), accessUntil: until, isInternal: false }, o.invite);
      const token = o.invite ? `beispiel-${id}-${store().seq}` : null;
      Object.assign(a, { status: "accepted", memberId, orgId, decidedAt: new Date().toISOString(), holdReason: null, holdUntil: null });
      return { memberId, orgId, token, kind: kindOf(a.partnerType) };
    },
    async pitchDeckUrl() { return null; },
    async changeRequests(status) { return clone(store().changes.filter((c) => !status || c.status === status)); },
    async decideChange(id, status, value, note) {
      const c = store().changes.find((x) => x.id === id);
      if (!c) throw new Error("Anfrage nicht gefunden.");
      if (c.status !== "open") throw new Error("Über diese Anfrage ist bereits entschieden.");
      const col = ({ name: "name", website: "website", tagline: "tagline", solution: "solution" } as const)[c.field as "name"];
      if (status !== "rejected" && col) {
        const m = fixtureStartupStore().startups.find((s) => s.id === c.memberId);
        if (m) Object.assign(m, { [col]: (value ?? c.newValue).trim() || null, updatedAt: new Date().toISOString() });
      }
      Object.assign(c, { status, decisionNote: note, decidedAt: new Date().toISOString(), ...(status === "adjusted" && value ? { newValue: value } : {}) });
    },
    async recommend(r, userId) {
      const id = `ap-${++store().seq + 100}`;
      store().applications.unshift({
        id, ...r, contactRole: null, founded: null, details: {}, offer: null, offerCategoryIds: [], maturity: null, referencesText: null, pitchDeckPath: null,
        source: "partner", recommendedBy: userId, status: "new", holdReason: null, holdUntil: null, decisionNote: null, decidedAt: null, memberId: null, orgId: null,
        precheck: null, emailConfirmedAt: null, createdAt: new Date().toISOString(),
      });
      return id;
    },
    async myRecommendations(userId) { return clone(store().applications.filter((a) => a.recommendedBy === userId)); },
    async requestChange(memberId, field, oldValue, newValue, comment) {
      const m = fixtureStartupStore().startups.find((s) => s.id === memberId);
      store().changes.unshift({
        id: `cr-${++store().seq}`, memberId, memberName: m?.name ?? null, field, oldValue, newValue, comment, status: "open", decisionNote: null, decidedAt: null,
        createdAt: new Date().toISOString(),
      });
    },
  };
}

/** Testmodus: Bewerbung aus dem Formular speichern (ohne Mailversand direkt „neu“) */
export function fixtureSubmit(a: Omit<Application, "id" | "status" | "createdAt" | "emailConfirmedAt" | "source" | "recommendedBy" | "holdReason" | "holdUntil" | "decisionNote" | "decidedAt" | "memberId" | "orgId">) {
  const id = `ap-${++store().seq + 200}`;
  store().applications.unshift({
    ...clone(a), id, status: "new", source: "form", recommendedBy: null, holdReason: null, holdUntil: null, decisionNote: null, decidedAt: null,
    memberId: null, orgId: null, emailConfirmedAt: null, createdAt: new Date().toISOString(),
  });
  return id;
}
