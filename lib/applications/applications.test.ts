import { describe, expect, it } from "vitest";
import { applicationSchema, checkPdf, cleanDetails, fromFormData } from "./form";
import { baseDomain, buildPrecheck, emailCheck, findDuplicates, normName, precheckFlags } from "./precheck";
import { acceptDefaults, kindOf } from "./types";

const base = { partnerType: "club", orgName: "FC Beispiel", contactName: "Anna", email: "anna@fcb.de", website: "fcb.de", privacy: true };

describe("Formular", () => {
  it("ergänzt https:// und verlangt Datenschutz", () => {
    const r = applicationSchema.parse(base);
    expect(r.website).toBe("https://fcb.de");
    expect(applicationSchema.safeParse({ ...base, privacy: undefined }).success).toBe(false);
  });
  it("Solution Provider: Gründungsjahr und Angebot Pflicht", () => {
    const r = applicationSchema.safeParse({ ...base, partnerType: "solution_provider" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual(["founded", "offer"]);
    expect(applicationSchema.safeParse({ ...base, partnerType: "solution_provider", founded: "2023", offer: "Zapfwand" }).success).toBe(true);
  });
  it("lehnt ungültige Adressen und Typen ab", () => {
    expect(applicationSchema.safeParse({ ...base, email: "keine" }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...base, partnerType: "startup" }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...base, website: "kein web" }).success).toBe(false);
  });
  it("übernimmt nur Felder des gewählten Typs", () => {
    expect(cleanDetails("club", { league: " 3. Liga ", focus: "x", venue: "" })).toEqual({ league: "3. Liga" });
  });
  it("liest FormData inkl. Details und Kategorien", () => {
    const fd = new FormData();
    fd.set("partnerType", "solution_provider"); fd.set("orgName", "TapFlow"); fd.set("email", " Anna@TapFlow.de ");
    fd.set("details.league", "x"); fd.append("offerCategoryIds", "cat-1"); fd.append("offerCategoryIds", "cat-2"); fd.set("privacy", "on");
    const v = fromFormData(fd);
    expect(v).toMatchObject({ partnerType: "solution_provider", email: "anna@tapflow.de", details: { league: "x" }, offerCategoryIds: ["cat-1", "cat-2"], privacy: true });
  });
  it("Pitchdeck: nur echte PDFs bis 15 MB", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(checkPdf("deck.pdf", 1000, pdf)).toBeNull();
    expect(checkPdf("deck.exe", 1000, pdf)).toMatch(/PDF/);
    expect(checkPdf("deck.pdf", 1000, new Uint8Array([1, 2, 3, 4]))).toMatch(/kein gültiges PDF/);
    expect(checkPdf("deck.pdf", 16 * 1024 * 1024, pdf)).toMatch(/15 MB/);
  });
});

describe("Vorprüfung", () => {
  it("E-Mail-Domain passt zur Website, auch mit Subdomain", () => {
    expect(emailCheck("a@mail.tapflow.de", "https://www.tapflow.de/de")).toEqual({ emailDomainMatch: true, freemail: false });
    expect(emailCheck("a@andere.de", "https://tapflow.de")).toEqual({ emailDomainMatch: false, freemail: false });
    expect(emailCheck("a@gmail.com", "https://tapflow.de")).toEqual({ emailDomainMatch: null, freemail: true });
    expect(baseDomain("shop.example.co.uk")).toBe("example.co.uk");
  });
  it("findet Dubletten über Domain oder Namen ohne Rechtsform", () => {
    expect(normName("TapFlow GmbH")).toBe("tapflow");
    expect(normName("FC Beispiel e.V.")).toBe("fc beispiel");
    const d = findDuplicates({ orgName: "TapFlow GmbH", website: "https://www.tapflow.de" }, [
      { kind: "member", id: "1", name: "[Beispiel] TapFlow", domain: null },
      { kind: "org", id: "2", name: "Andere", website: "https://tapflow.de/x" },
      { kind: "member", id: "3", name: "Fremd", domain: "fremd.de" },
    ]);
    expect(d.map((x) => x.id)).toEqual(["1", "2"]);
  });
  it("Ampel: grün ohne Auffälligkeiten, sonst Gründe", () => {
    expect(precheckFlags(buildPrecheck({ email: "a@tapflow.de", website: "https://tapflow.de", reachable: true, duplicates: [] }))).toEqual({ ok: true, notes: [] });
    const f = precheckFlags(buildPrecheck({ email: "a@gmx.de", website: "https://tapflow.de", reachable: false, duplicates: [{ kind: "member", id: "1", name: "TapFlow" }] }));
    expect(f.ok).toBe(false);
    expect(f.notes).toEqual(["Website nicht erreichbar", "E-Mail bei einem Freemail-Anbieter", "mögliche Dublette: TapFlow"]);
  });
});

describe("Annehmen", () => {
  it("Vorbelegung je Partner-Typ", () => {
    expect(acceptDefaults({ partnerType: "club", orgName: "FC" })).toEqual({ orgName: "FC", tier: "basic", seats: 5, months: 12, invite: true });
    expect(acceptDefaults({ partnerType: "investor", orgName: "V" })).toMatchObject({ seats: 3, months: 1 });
    expect(kindOf("multiplier")).toBe("partner");
    expect(kindOf("solution_provider")).toBe("provider");
    expect(kindOf("caterer")).toBe("customer");
  });
});

import { holdSignal } from "./hold";
describe("Wiedervorlage im Cockpit", () => {
  const now = new Date("2026-11-04T10:00:00Z"); // Mittwoch
  it("rot ab dem Fälligkeitstag, gelb innerhalb der Schwelle, sonst grün", () => {
    expect(holdSignal("2026-11-04", now)).toMatchObject({ level: "red", reason: "Wiedervorlage heute", blink: true });
    expect(holdSignal("2026-11-02", now).level).toBe("red");
    expect(holdSignal("2026-11-06", now)).toMatchObject({ level: "yellow", blink: false });
    expect(holdSignal("2026-11-20", now).level).toBe("green");
  });
});
