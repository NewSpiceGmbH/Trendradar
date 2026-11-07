import type { Precheck } from "./types";

/**
 * Vorprüfung einer Bewerbung: markiert, entscheidet nicht. Reine Logik hier; die Prüfung der Website und die Suche nach
 * Dubletten liefern die Aufrufer (Server) als Eingaben.
 */
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "gmx.de", "gmx.net", "web.de", "t-online.de", "outlook.com", "outlook.de", "hotmail.com", "hotmail.de",
  "yahoo.com", "yahoo.de", "icloud.com", "me.com", "posteo.de", "mailbox.org", "freenet.de", "aol.com", "proton.me", "protonmail.com",
]);

export const hostOf = (url: string | null | undefined) => {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Registrierbare Domain grob bestimmen (letzte zwei Teile; bei co.uk, com.au usw. drei) */
export function baseDomain(host: string): string {
  const parts = host.split(".");
  const n = /^(co|com|org|net|ac|gv)\.[a-z]{2}$/.test(parts.slice(-2).join(".")) ? 3 : 2;
  return parts.slice(-n).join(".");
}

export function emailCheck(email: string, website: string | null | undefined): Pick<Precheck, "emailDomainMatch" | "freemail"> {
  const mailHost = email.split("@")[1]?.toLowerCase() ?? "";
  const freemail = FREEMAIL.has(mailHost);
  const host = hostOf(website);
  if (!host || freemail) return { emailDomainMatch: null, freemail };
  return { emailDomainMatch: baseDomain(mailHost) === baseDomain(host), freemail };
}

/** Name vergleichbar machen (Rechtsform, Groß/Klein, Sonderzeichen weg) */
export function normName(name: string): string {
  return name.toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(gmbh|ag|ug|e\.?\s?v\.?|ev|kg|ohg|se|ltd|inc|llc|bv|sas|sarl|co)\b/g, " ")
    .replace(/\[beispiel\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function findDuplicates(
  a: { orgName: string; website: string | null | undefined; id?: string },
  pool: { kind: Precheck["duplicates"][number]["kind"]; id: string; name: string; website?: string | null; domain?: string | null }[],
): Precheck["duplicates"] {
  const host = hostOf(a.website);
  const name = normName(a.orgName);
  return pool.filter((p) => p.id !== a.id && (
    (host && (p.domain === host || hostOf(p.website) === host)) || (name.length >= 3 && normName(p.name) === name)
  )).map(({ kind, id, name: n }) => ({ kind, id, name: n }));
}

export function buildPrecheck(input: {
  email: string; website: string | null | undefined; reachable: boolean | null; duplicates: Precheck["duplicates"]; now?: Date;
}): Precheck {
  return {
    website: input.website ? (input.reachable ? "ok" : "unreachable") : "none",
    ...emailCheck(input.email, input.website),
    duplicates: input.duplicates,
    checkedAt: (input.now ?? new Date()).toISOString(),
  };
}

/** Ampel der Vorprüfung: grün, wenn nichts auffällt; sonst gelb mit Gründen (entscheidet nicht) */
export function precheckFlags(p: Precheck): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  if (p.website === "unreachable") notes.push("Website nicht erreichbar");
  if (p.website === "none") notes.push("keine Website angegeben");
  if (p.emailDomainMatch === false) notes.push("E-Mail-Domain passt nicht zur Website");
  if (p.freemail) notes.push("E-Mail bei einem Freemail-Anbieter");
  if (p.duplicates.length) notes.push(`mögliche Dublette: ${p.duplicates.map((d) => d.name).join(", ")}`);
  return { ok: notes.length === 0, notes };
}
