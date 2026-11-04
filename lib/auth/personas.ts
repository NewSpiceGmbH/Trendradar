// Demo-Zugänge für Vorschau-Umgebungen. Die Konten legt Migration 0005_demo_accounts.sql an – vor dem Livegang
// entfernen. Aktiv nur mit DEMO_LOGIN=1 und nie in Vercel-Produktion.

export type PersonaKey = "redaktion" | "owner" | "member" | "premium" | "abgelaufen";

export interface Persona {
  key: PersonaKey;
  label: string;
  description: string;
  email: string;
}

export const PERSONAS: Persona[] = [
  { key: "redaktion", label: "Redaktion", description: "New Spice, Admin – sieht alles inkl. Entwürfe", email: "redaktion@demo.newspice.de" },
  { key: "owner", label: "Kunde A · Owner", description: "Basic, verwaltet das Team", email: "owner@kunde-a.demo" },
  { key: "member", label: "Kunde A · Member", description: "Basic, liest den Radar", email: "member@kunde-a.demo" },
  { key: "premium", label: "Kunde P · Premium", description: "Premium-Inhalte freigeschaltet", email: "premium@kunde-p.demo" },
  { key: "abgelaufen", label: "Kunde X · abgelaufen", description: "Laufzeit vorbei – sieht nichts mehr", email: "ablauf@kunde-x.demo" },
];

export const isFixtureMode = () => process.env.RADAR_FIXTURES === "1" && process.env.VERCEL !== "1";
const truthy = (v: string | undefined) => ["1", "true", "yes", "ja"].includes((v ?? "").trim().toLowerCase());
export const isDemoLogin = () => (truthy(process.env.DEMO_LOGIN) && process.env.VERCEL_ENV !== "production") || isFixtureMode();

/** Für den Hinweis in Vorschauen, wenn die Demo-Zugänge nicht aktiv sind */
export const demoLoginDiagnosis = () =>
  process.env.VERCEL_ENV === "preview"
    ? `Demo-Zugänge sind in dieser Vorschau aus: DEMO_LOGIN ist ${
        process.env.DEMO_LOGIN === undefined ? "nicht gesetzt" : `„${process.env.DEMO_LOGIN}“ statt „1“`
      }. In Vercel unter Settings → Environment Variables für „Preview“ DEMO_LOGIN = 1 setzen und die Seite neu laden.`
    : null;
