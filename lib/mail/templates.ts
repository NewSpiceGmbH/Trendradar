/** Texte der Systemmails (Deutsch, Sie-Form). Reiner Text plus einfaches HTML – ohne externe Bilder oder Tracking. */

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(subject: string, paragraphs: string[], link?: { href: string; label: string }): MailContent {
  const text = [...paragraphs, ...(link ? [`${link.label}: ${link.href}`] : []), "", "New Spice · Trendradar"].join("\n\n");
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1d;max-width:560px">`,
    ...paragraphs.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`),
    link ? `<p><a href="${esc(link.href)}" style="display:inline-block;background:#1d1d1d;color:#fcf4e6;padding:10px 18px;border-radius:40px;text-decoration:none;font-weight:bold">${esc(link.label)}</a></p>` : "",
    `<p style="color:#6b6b6b;font-size:13px">New Spice · Trendradar</p></div>`,
  ].join("");
  return { subject, text, html };
}

export function confirmApplicationMail(name: string, link: string): MailContent {
  return render("Bitte bestätigen Sie Ihre Bewerbung", [
    `Guten Tag${name ? ` ${name}` : ""},`,
    "vielen Dank für Ihre Bewerbung beim New Spice Trendradar. Bitte bestätigen Sie Ihre E-Mail-Adresse, damit wir Ihre Angaben prüfen können.",
    "Wenn Sie sich nicht beworben haben, ignorieren Sie diese Nachricht einfach – ohne Bestätigung wird die Bewerbung nicht bearbeitet.",
  ], { href: link, label: "E-Mail-Adresse bestätigen" });
}

export function applicationReceivedMail(name: string): MailContent {
  return render("Ihre Bewerbung ist eingegangen", [
    `Guten Tag${name ? ` ${name}` : ""},`,
    "danke! Ihre Bewerbung ist bei uns eingegangen. Wir melden uns innerhalb von 5 Werktagen.",
  ]);
}

/** Vorlage für die Absage; die Redaktion kann den Text vor dem Senden ändern */
export const REJECTION_TEMPLATE = `vielen Dank für Ihr Interesse am New Spice Trendradar und die Zeit, die Sie sich für Ihre Bewerbung genommen haben.

Nach sorgfältiger Prüfung können wir Ihnen derzeit leider keinen Zugang anbieten. Das ist keine Bewertung Ihres Angebots – unser Netzwerk ist bewusst klein und auf die aktuellen Projekte unserer Kunden zugeschnitten.

Gern können Sie sich zu einem späteren Zeitpunkt erneut bewerben.`;

export function rejectionMail(name: string, body: string): MailContent {
  return render("Ihre Bewerbung beim New Spice Trendradar", [`Guten Tag${name ? ` ${name}` : ""},`, body.trim(), "Freundliche Grüße\nIhr Team von New Spice"]);
}

export function invitationMail(name: string, orgName: string, link: string, freeMonth: boolean): MailContent {
  return render(`Ihr Zugang zum New Spice Trendradar`, [
    `Guten Tag${name ? ` ${name}` : ""},`,
    `willkommen im Netzwerk von New Spice! Wir haben für ${orgName} einen Zugang eingerichtet.${freeMonth ? " Der erste Monat ist kostenlos." : ""}`,
    "Über den Link melden Sie sich an. Der Link gilt 14 Tage und nur für diese E-Mail-Adresse.",
  ], { href: link, label: "Zugang annehmen" });
}
