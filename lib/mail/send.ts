import "server-only";

/**
 * Mailversand über Brevo (Server in der EU). Aktiv, sobald BREVO_API_KEY und MAIL_FROM gesetzt sind; sonst wird nichts
 * verschickt und die Aufrufer zeigen Texte und Links zum Kopieren. Der Anbieter steckt nur hier – ein Wechsel (z. B. SMTP)
 * betrifft nur diese Datei.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export type MailResult = { sent: true; id: string | null } | { sent: false; reason: "not_configured" | "failed"; error?: string };

/** "Name <adresse@domain>" oder nur die Adresse */
export function parseSender(raw: string | undefined): { name?: string; email: string } | null {
  const v = raw?.trim();
  if (!v) return null;
  const m = /^(.*)<([^<>\s]+@[^<>\s]+)>$/.exec(v);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, "") || undefined, email: m[2] };
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? { email: v } : null;
}

export const mailConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean(env.BREVO_API_KEY?.trim() && parseSender(env.MAIL_FROM));

export async function sendMail(mail: Mail, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<MailResult> {
  const sender = parseSender(env.MAIL_FROM);
  const key = env.BREVO_API_KEY?.trim();
  if (!key || !sender) return { sent: false, reason: "not_configured" };
  const replyTo = parseSender(mail.replyTo ?? env.MAIL_REPLY_TO);
  try {
    const res = await fetcher("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text,
        ...(mail.html ? { htmlContent: mail.html } : {}),
        ...(replyTo ? { replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { sent: false, reason: "failed", error: `Brevo ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const body = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { sent: true, id: body.messageId ?? null };
  } catch (e) {
    return { sent: false, reason: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
