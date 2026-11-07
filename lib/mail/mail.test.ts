import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mailConfigured, parseSender, sendMail } from "./send";
import { confirmApplicationMail, invitationMail, rejectionMail } from "./templates";

describe("Absender", () => {
  it("liest „Name <adresse>“ und reine Adressen", () => {
    expect(parseSender("New Spice Trendradar <trendradar@mail.newspice.de>")).toEqual({ name: "New Spice Trendradar", email: "trendradar@mail.newspice.de" });
    expect(parseSender("trendradar@mail.newspice.de")).toEqual({ email: "trendradar@mail.newspice.de" });
    expect(parseSender("kein absender")).toBeNull();
    expect(parseSender(undefined)).toBeNull();
  });
  it("aktiv nur mit Schlüssel und Absender", () => {
    expect(mailConfigured({})).toBe(false);
    expect(mailConfigured({ BREVO_API_KEY: "x" })).toBe(false);
    expect(mailConfigured({ BREVO_API_KEY: "x", MAIL_FROM: "a@b.de" })).toBe(true);
  });
});

describe("Versand über Brevo", () => {
  it("ohne Konfiguration wird nichts gesendet", async () => {
    const f = vi.fn();
    expect(await sendMail({ to: "x@y.de", subject: "S", text: "T" }, {}, f)).toEqual({ sent: false, reason: "not_configured" });
    expect(f).not.toHaveBeenCalled();
  });
  it("schickt Absender, Empfänger, Betreff, Text und Antwortadresse", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ messageId: "m1" }), { status: 201 }));
    const r = await sendMail({ to: "x@y.de", subject: "S", text: "T", html: "<p>T</p>" },
      { BREVO_API_KEY: "key", MAIL_FROM: "NS <a@b.de>", MAIL_REPLY_TO: "team@b.de" }, f as unknown as typeof fetch);
    expect(r).toEqual({ sent: true, id: "m1" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      sender: { name: "NS", email: "a@b.de" }, to: [{ email: "x@y.de" }], subject: "S", textContent: "T", htmlContent: "<p>T</p>", replyTo: { email: "team@b.de" },
    });
  });
  it("meldet Fehler ohne zu werfen", async () => {
    const f = vi.fn(async () => new Response("bad key", { status: 401 }));
    const r = await sendMail({ to: "x@y.de", subject: "S", text: "T" }, { BREVO_API_KEY: "k", MAIL_FROM: "a@b.de" }, f as unknown as typeof fetch);
    expect(r).toMatchObject({ sent: false, reason: "failed" });
  });
});

describe("Texte", () => {
  it("Bestätigung enthält den Link, HTML ist maskiert", () => {
    const m = confirmApplicationMail("<Anna>", "https://x.de/bewerben/bestaetigen/abc");
    expect(m.text).toContain("https://x.de/bewerben/bestaetigen/abc");
    expect(m.html).toContain("&lt;Anna&gt;");
    expect(m.html).not.toContain("<Anna>");
  });
  it("Absage übernimmt den Text der Redaktion, Einladung nennt den Gratismonat", () => {
    expect(rejectionMail("", "Leider nein.").text).toContain("Leider nein.");
    expect(invitationMail("A", "TapFlow", "https://x.de/invite/t", true).text).toContain("erste Monat ist kostenlos");
  });
});
