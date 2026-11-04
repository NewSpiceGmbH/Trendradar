// Demo-Zugänge für Vorschau-Umgebungen. Die Konten legt supabase/seed-demo.sql an – nur in lokalen
// Instanzen und Supabase-Preview-Branches, nie in Produktion. Aktiv nur mit DEMO_LOGIN=1.

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
export const isDemoLogin = () => process.env.DEMO_LOGIN === "1" || isFixtureMode();
