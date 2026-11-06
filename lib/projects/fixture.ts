import "server-only";

import type { Viewer } from "@/lib/auth/viewer";
import { PERSONAS } from "@/lib/auth/personas";
import { fixtureVenture } from "@/lib/venture/fixture";
import type { StartupPrivate } from "@/lib/venture/types";
import type { ProjectsRepo } from "./store";
import { safeFileName, type Invitation, type Member, type Org, type Project, type ProjectDocument, type ProjectUpdate, type ShortlistEntry } from "./types";

/**
 * Kunden und Projekte im lokalen Testmodus (RADAR_FIXTURES=1). Zustand im Speicher des Server-Prozesses.
 * Bildet die Zugriffsregeln aus Migration 0010 nach: Kunden sehen nur ihre Org, nur Freigegebenes, nichts Internes.
 */
interface Store {
  orgs: Org[];
  members: Map<string, Member[]>;
  invitations: Map<string, Invitation[]>;
  projects: Project[];
  milestones: Map<string, { id: string; title: string; dueDate: string | null; doneAt: string | null; position: number }[]>;
  updates: Map<string, ProjectUpdate[]>;
  shortlist: Map<string, (Omit<ShortlistEntry, "startup" | "priv"> & { startupId: string })[]>;
  documents: Map<string, ProjectDocument[]>;
  catalog: Map<string, ShortlistEntry["startup"] & { priv: StartupPrivate }>;
  seq: number;
}

const g = globalThis as unknown as { __trendradarProjects?: Store };
const B = "[Beispiel] ";
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function init(): Store {
  const persona = (k: string) => PERSONAS.find((p) => p.key === k)!;
  const orgs: Org[] = [
    { id: "a", name: "Kunde A", tier: "basic", seats: 5, accessFrom: day(-300), accessUntil: day(21), isInternal: false, memberCount: 2, openInvites: 0 },
    { id: "p", name: "Kunde P", tier: "premium", seats: 10, accessFrom: day(-30), accessUntil: null, isInternal: false, memberCount: 1, openInvites: 0 },
    { id: "x", name: "Kunde X", tier: "premium", seats: 3, accessFrom: day(-400), accessUntil: day(-1), isInternal: false, memberCount: 1, openInvites: 0 },
  ];
  const m = (k: string, role: Member["role"]): Member => ({ userId: `fixture-${k}`, email: persona(k).email, name: persona(k).label, role });
  const catalog = new Map<string, ShortlistEntry["startup"] & { priv: StartupPrivate }>([
    ["fx-st-1", { id: "fx-st-1", name: `${B}QueueLess`, website: "https://queueless.example", tagline: "Kasse ohne Schlange für Stadien und Arenen.", solution: null, stage: "market", country: "DE", approved: false,
      priv: { contactName: "Vertrieb", contactRole: "Sales", contactEmail: "sales@queueless.example", pricing: "2.000 € im Monat je 10 Stände", pitchDeckUrl: "https://example.org/deck-queueless.pdf", notes: "Intern: Rabatt möglich." } }],
    ["fx-st-2", { id: "fx-st-2", name: `${B}TapFlow`, website: "https://tapflow.example", tagline: "Selbstzapf-Wand mit Kartenzahlung.", solution: null, stage: "pilot", country: "DE", approved: false,
      priv: { contactName: null, contactRole: null, contactEmail: null, pricing: "500 € je Stand und Monat", pitchDeckUrl: null, notes: null } }],
    ["fx-st-3", { id: "fx-st-3", name: `${B}Pre-Order Pro`, website: "https://preorder.example", tagline: "Vorbestellen und am Abholfach abholen.", solution: null, stage: "market", country: "AT", approved: false,
      priv: { contactName: null, contactRole: null, contactEmail: null, pricing: null, pitchDeckUrl: null, notes: null } }],
  ]);
  const project: Project = {
    id: "pr-1", orgId: "a", orgName: "Kunde A", title: `${B}Halbzeit-Gastro schneller`, status: "shortlist", outcome: null, outcomeNote: null,
    request: "In der Halbzeit sind die Schlangen an den Ständen zu lang. Wir suchen eine Lösung für die Rückrunde.",
    goal: "Wartezeit unter 4 Minuten.", venue: "Arena Nord, 40 Stände", timeframe: "Pilot in der Rückrunde", budget: "bis 50.000 €",
    challengeId: "ch-1", leadId: "fixture-redaktion", requestedBy: "fixture-owner", completedAt: null, createdAt: ago(240), updatedAt: ago(5),
  };
  return {
    orgs,
    members: new Map([["a", [m("owner", "owner"), m("member", "member")]], ["p", [m("premium", "member")]], ["x", [m("abgelaufen", "owner")]]]),
    invitations: new Map(),
    projects: [project, ...moreProjects()],
    milestones: new Map([["pr-2", [
      { id: "ms-21", title: "Zwischenauswertung", dueDate: day(-3), doneAt: null, position: 0 },
    ]], ["pr-3", [
      { id: "ms-31", title: "Erstgespräche", dueDate: day(20), doneAt: null, position: 0 },
    ]], ["pr-1", [
      { id: "ms-1", title: "Anforderungen geklärt", dueDate: day(-10), doneAt: ago(200), position: 0 },
      { id: "ms-2", title: "Erstgespräche mit der Shortlist", dueDate: day(10), doneAt: null, position: 1 },
      { id: "ms-3", title: "Pilot an 4 Ständen", dueDate: day(60), doneAt: null, position: 2 },
    ]]]),
    updates: new Map([["pr-1", [
      { id: "up-1", body: "Die Shortlist steht. Zwei Startups mit Kosten, eines noch in Prüfung.", internal: false, authorId: "fixture-redaktion", authorName: "New Spice", createdAt: ago(150) },
      { id: "up-2", body: "Intern: Bei QueueLess Rabatt für Referenzkunden verhandeln.", internal: true, authorId: "fixture-redaktion", authorName: "Redaktion (Demo)", createdAt: ago(4) },
    ]]]),
    shortlist: new Map([["pr-1", [
      { startupId: "fx-st-1", position: 0, rationale: "Bewährt in Kantinen, erste Arenen in den Niederlanden; Kassenanbindung vorhanden.", shared: true, sharePrivate: true, customerStatus: "open", customerNote: null },
      { startupId: "fx-st-2", position: 1, rationale: "Entlastet die Zapfstellen, Jugendschutz noch zu klären.", shared: true, sharePrivate: false, customerStatus: "open", customerNote: null },
      { startupId: "fx-st-3", position: 2, rationale: "Noch in Prüfung.", shared: false, sharePrivate: false, customerStatus: "open", customerNote: null },
    ]]]),
    documents: new Map([["pr-1", [
      { id: "doc-1", name: "Shortlist Halbzeit-Gastro.pdf", path: "pr-1/doc-1-shortlist.pdf", sizeBytes: 482_000, mime: "application/pdf", internal: false, uploadedBy: "fixture-redaktion", uploaderName: "New Spice", createdAt: ago(5) },
      { id: "doc-2", name: "Kalkulation intern.xlsx", path: "pr-1/doc-2-kalkulation.xlsx", sizeBytes: 31_000, mime: null, internal: true, uploadedBy: "fixture-redaktion", uploaderName: "Redaktion (Demo)", createdAt: ago(4) },
    ]]]),
    catalog, seq: 10,
  };
}

/** Weitere Beispiele fürs Cockpit: eine überfällige Frist (Rot), im Plan (Grün), abgeschlossen, zwei offene Anfragen */
function moreProjects(): Project[] {
  const p = (id: string, orgId: string, orgName: string, title: string, status: Project["status"], hoursAgo: number, extra: Partial<Project> = {}): Project => ({
    id, orgId, orgName, title: `${B}${title}`, status, request: "Beispielanfrage für den Testmodus.", goal: "", venue: null, timeframe: null, budget: null,
    outcome: null, outcomeNote: null, challengeId: null, leadId: null, requestedBy: null, completedAt: null,
    createdAt: ago(hoursAgo + 200), updatedAt: ago(hoursAgo), editorSeenAt: null, ...extra,
  });
  return [
    p("pr-2", "a", "Kunde A", "Nachhaltige Fan-Anreise", "pilot", 30, { editorSeenAt: ago(20) }),
    p("pr-3", "p", "Kunde P", "Einlass ohne Stau", "shortlist", 10, { editorSeenAt: ago(5) }),
    p("pr-4", "p", "Kunde P", "Mehrweg-Pfand im Stadion", "completed", 400, { outcome: "success", outcomeNote: "Rücklaufquote 96 %.", completedAt: ago(400) }),
    p("req-1", "p", "Kunde P", "VIP-Lounge: Bestellung am Tisch", "requested", 20, {
      request: "In der Loge sollen Gäste per Tablet bestellen und am Platz bedient werden.", goal: "Mehr Umsatz je Loge, weniger Laufwege für das Personal.",
      venue: "Arena Süd, 24 Logen", timeframe: "ab Saison 2027/28", budget: "offen", requestedBy: "fixture-premium",
    }),
    p("req-2", "a", "Kunde A", "Wegeleitung am Spieltag", "requested", 50, {
      request: "Gäste finden ihren Block und die Stände schlecht, vor allem Auswärtsfans.", goal: "Weniger Fragen an die Ordner, schnellere Wege.",
      venue: "Arena Nord", timeframe: "Rückrunde", budget: "bis 20.000 €", requestedBy: "fixture-owner",
    }),
  ];
}

const store = () => (g.__trendradarProjects ??= init());

export function fixtureProjects(viewer: Viewer): ProjectsRepo {
  const editor = viewer.isEditor;
  const myOrgs = new Set(viewer.orgs.filter((o) => o.active).map((o) => o.id));
  const visible = (p: Project) => editor || myOrgs.has(p.orgId);
  const mustEditor = () => { if (!editor) throw new Error("Dafür fehlen die Rechte."); };
  const find = (id: string) => {
    const p = store().projects.find((x) => x.id === id);
    if (!p || !visible(p)) throw new Error("Projekt nicht gefunden.");
    return p;
  };
  const touch = (p: Project) => { p.updatedAt = new Date().toISOString(); };
  const startup = async (id: string) => {
    const s = store().catalog.get(id);
    if (s) return s;
    const v = await fixtureVenture().startup(id);
    return v ? { id, name: v.startup.name, website: v.startup.website, tagline: v.startup.tagline, solution: v.startup.solution, stage: v.startup.stage, country: v.startup.country, approved: v.startup.approved, priv: v.priv } : null;
  };

  return {
    async orgs() { mustEditor(); return structuredClone(store().orgs.map((o) => ({ ...o, memberCount: store().members.get(o.id)?.length ?? 0, openInvites: (store().invitations.get(o.id) ?? []).filter((i) => !i.acceptedAt).length }))); },
    async org(id) {
      mustEditor();
      const o = store().orgs.find((x) => x.id === id);
      if (!o) return null;
      return structuredClone({ org: { ...o, memberCount: store().members.get(id)?.length ?? 0, openInvites: (store().invitations.get(id) ?? []).length }, members: store().members.get(id) ?? [], invitations: store().invitations.get(id) ?? [] });
    },
    async saveOrg(id, o) {
      mustEditor();
      if (id) {
        const x = store().orgs.find((y) => y.id === id);
        if (!x) throw new Error("Organisation nicht gefunden.");
        Object.assign(x, o);
        return id;
      }
      const nid = `org-${++store().seq}`;
      store().orgs.push({ ...o, id: nid, isInternal: false, memberCount: 0, openInvites: 0 });
      return nid;
    },
    async invite(orgId, email, role) {
      mustEditor();
      const o = store().orgs.find((x) => x.id === orgId)!;
      const list = store().invitations.get(orgId) ?? [];
      if (list.some((i) => !i.acceptedAt && i.email.toLowerCase() === email.toLowerCase())) throw new Error("Für diese Adresse gibt es schon eine offene Einladung.");
      if ((store().members.get(orgId)?.length ?? 0) + list.filter((i) => !i.acceptedAt).length >= o.seats) throw new Error("Dafür fehlen die Rechte – oder es sind keine Sitzplätze mehr frei.");
      const token = `fixture-${++store().seq}-${Math.random().toString(36).slice(2, 10)}`;
      list.unshift({ id: `inv-${store().seq}`, email, role, token, expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(), acceptedAt: null, createdAt: new Date().toISOString() });
      store().invitations.set(orgId, list);
      return token;
    },
    async revokeInvite(id) { mustEditor(); for (const [k, l] of store().invitations) store().invitations.set(k, l.filter((i) => i.id !== id)); },
    async removeMember(orgId, userId) { mustEditor(); store().members.set(orgId, (store().members.get(orgId) ?? []).filter((m) => m.userId !== userId)); },

    async projects() { return structuredClone(store().projects.filter(visible).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); },
    async overview() {
      mustEditor();
      const s = store();
      return structuredClone(s.projects.map((project) => {
        const ups = (s.updates.get(project.id) ?? []).filter((u) => !u.internal);
        const team = ups.filter((u) => u.authorId === "fixture-redaktion" || u.authorId === viewer.id).map((u) => u.createdAt).sort().at(-1) ?? null;
        const cust = ups.filter((u) => u.authorId !== "fixture-redaktion" && u.authorId !== viewer.id).map((u) => u.createdAt).sort().at(-1) ?? null;
        return {
          project,
          milestones: (s.milestones.get(project.id) ?? []).map((m) => ({ title: m.title, dueDate: m.dueDate, doneAt: m.doneAt })),
          lastCustomerAt: cust, lastTeamAt: team,
          shortlist: (() => {
            const mine = s.shortlist.get(project.id) ?? [];
            const sel = mine.filter((e) => e.customerStatus === "selected");
            return { total: mine.length, open: mine.filter((e) => e.shared && e.customerStatus === "open").length, selected: sel.length,
              startupIds: mine.map((e) => e.startupId), selectedIds: sel.map((e) => e.startupId) };
          })(),
        };
      }));
    },
    async markSeen(id) { mustEditor(); const p = find(id); p.editorSeenAt = new Date().toISOString(); },
    async responseWorkdays() { return 3; },
    async project(id) {
      const p = store().projects.find((x) => x.id === id);
      if (!p || !visible(p)) return null;
      const entries = (store().shortlist.get(id) ?? []).filter((e) => editor || e.shared).sort((a, b) => a.position - b.position);
      const shortlist: ShortlistEntry[] = [];
      for (const e of entries) {
        const s = await startup(e.startupId);
        if (!s) continue;
        const { priv, ...info } = s;
        shortlist.push({ ...e, startup: info, priv: editor ? priv : e.sharePrivate ? { ...priv, notes: null } : null });
      }
      return structuredClone({
        project: p,
        milestones: [...(store().milestones.get(id) ?? [])].sort((a, b) => a.position - b.position),
        updates: (store().updates.get(id) ?? []).filter((u) => editor || !u.internal),
        shortlist,
        documents: (store().documents.get(id) ?? []).filter((d) => editor || !d.internal),
      });
    },
    async requestProject(orgId, r, userId) {
      if (!editor && !myOrgs.has(orgId)) throw new Error("Dafür fehlen die Rechte.");
      const id = `pr-${++store().seq}`;
      const now = new Date().toISOString();
      store().projects.push({ ...r, id, orgId, orgName: store().orgs.find((o) => o.id === orgId)?.name ?? null, status: "requested", outcome: null, outcomeNote: null, challengeId: null, leadId: null, requestedBy: userId, completedAt: null, createdAt: now, updatedAt: now });
      return id;
    },
    async saveProject(id, patch) { mustEditor(); const p = find(id); Object.assign(p, patch); touch(p); },
    async addMilestone(projectId, title, dueDate) {
      mustEditor(); find(projectId);
      const l = store().milestones.get(projectId) ?? [];
      l.push({ id: `ms-${++store().seq}`, title, dueDate, doneAt: null, position: l.length });
      store().milestones.set(projectId, l);
    },
    async setMilestoneDone(id, done) {
      mustEditor();
      for (const l of store().milestones.values()) for (const m of l) if (m.id === id) m.doneAt = done ? new Date().toISOString() : null;
    },
    async deleteMilestone(id) { mustEditor(); for (const [k, l] of store().milestones) store().milestones.set(k, l.filter((m) => m.id !== id)); },
    async addUpdate(projectId, body, internal, authorId) {
      const p = find(projectId);
      if (internal && !editor) throw new Error("Dafür fehlen die Rechte.");
      const l = store().updates.get(projectId) ?? [];
      l.unshift({ id: `up-${++store().seq}`, body, internal, authorId, authorName: editor ? "New Spice" : viewer.name, createdAt: new Date().toISOString() });
      store().updates.set(projectId, l);
      touch(p);
    },
    async addToShortlist(projectId, startupId, rationale) {
      mustEditor(); find(projectId);
      const l = store().shortlist.get(projectId) ?? [];
      if (l.some((e) => e.startupId === startupId)) throw new Error("Dieses Startup steht schon auf der Shortlist.");
      l.push({ startupId, position: l.length, rationale, shared: false, sharePrivate: false, customerStatus: "open", customerNote: null });
      store().shortlist.set(projectId, l);
    },
    async updateShortlist(projectId, startupId, patch) {
      mustEditor();
      const e = (store().shortlist.get(projectId) ?? []).find((x) => x.startupId === startupId);
      if (!e) throw new Error("Eintrag nicht gefunden.");
      Object.assign(e, patch);
      if (!e.shared) e.sharePrivate = false;
    },
    async removeFromShortlist(projectId, startupId) { mustEditor(); store().shortlist.set(projectId, (store().shortlist.get(projectId) ?? []).filter((e) => e.startupId !== startupId)); },
    async respond(projectId, startupId, status, note) {
      find(projectId);
      const e = (store().shortlist.get(projectId) ?? []).find((x) => x.startupId === startupId && (editor || x.shared));
      if (!e) throw new Error("Kein Zugriff auf diesen Eintrag.");
      Object.assign(e, { customerStatus: status, customerNote: note?.trim() || null });
    },
    async complete(projectId, outcome, note) {
      mustEditor();
      const p = find(projectId);
      const selected = (store().shortlist.get(projectId) ?? []).filter((e) => e.customerStatus === "selected");
      if (outcome === "success" && !selected.length) throw new Error("Bitte zuerst das umgesetzte Startup in der Shortlist als ausgewählt markieren.");
      Object.assign(p, { status: "completed", outcome, outcomeNote: note?.trim() || null, completedAt: new Date().toISOString() });
      if (outcome === "success") for (const e of selected) { const s = store().catalog.get(e.startupId); if (s) s.approved = true; }
      touch(p);
      return outcome === "success" ? selected.length : 0;
    },
    async createDocument(projectId, file, internal, userId) {
      find(projectId);
      if (internal && !editor) throw new Error("Dafür fehlen die Rechte.");
      const id = `doc-${++store().seq}`;
      const path = `${projectId}/${id}-${safeFileName(file.name)}`;
      const l = store().documents.get(projectId) ?? [];
      l.unshift({ id, name: file.name, path, sizeBytes: file.size, mime: file.mime, internal, uploadedBy: userId, uploaderName: editor ? "New Spice" : viewer.name, createdAt: new Date().toISOString() });
      store().documents.set(projectId, l);
      return { id, path };
    },
    async deleteDocument(id) {
      for (const [k, l] of store().documents) {
        const d = l.find((x) => x.id === id);
        if (d && !editor && d.uploadedBy !== viewer.id) throw new Error("Dafür fehlen die Rechte.");
        store().documents.set(k, l.filter((x) => x.id !== id));
      }
    },
    async documentUrl() { return null; }, // Testmodus: keine Dateien im Speicher
    async startupOptions() {
      mustEditor();
      const fromVenture = (await fixtureVenture().startups()).filter((s) => s.status === "qualified").map((s) => ({ id: s.id, name: s.name, tagline: s.tagline }));
      return [...[...store().catalog.values()].map((s) => ({ id: s.id, name: s.name, tagline: s.tagline })), ...fromVenture];
    },
  };
}

/** Testmodus: Projekte, denen ein Mitglied zugewiesen ist (für die Netzwerk-Datenbank, nur Redaktion) */
export function fixtureAssignments(startupId: string) {
  const s = store();
  return s.projects.flatMap((p) => (s.shortlist.get(p.id) ?? []).filter((e) => e.startupId === startupId).map((e) => ({
    projectId: p.id, title: p.title, orgName: p.orgName, status: p.status, role: "shortlist" as const, shared: e.shared, customerStatus: e.customerStatus,
  })));
}
