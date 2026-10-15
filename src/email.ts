// Best-effort Admin-Benachrichtigung bei neuen Listing-Einreichungen über den MCP-/Agent-Weg.
// Der Web-Submit (Next-App) mailt bereits selbst; dieser Pfad schließt die Lücke, damit AUCH
// von Agenten eingereichte Listings in der Freigabe-Queue gemeldet werden. Fehlt der Resend-Key
// oder failt die API, wird still übersprungen (nie den Submit blockieren).

import type { Env } from "./types";

const RESEND_API = "https://api.resend.com/emails";
const SITE = "https://tulimoa.com";
const ADMIN_QUEUE_URL = "https://admin.tulimoa.com/queue";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Gemeinsames Mail-Design ─────────────────────────────────────────────────
// Spiegel von Tulimoa/src/lib/email-templates.ts (renderShell + renderMessage):
// 560-px-Karte, Icon + Wortmarke, schwarzer Button, Footer mit Socials, Links
// und Anschrift. Jede Tulimoa-Mail sieht so aus. Änderungen dort hier nachziehen.

const SOCIAL = {
  instagram: "https://www.instagram.com/tulimoa",
  x: "https://x.com/gettulimoa",
  linkedin: "https://linkedin.com/company/tulimoa",
};
const ADDRESS_LINE = "Tulimoa · Gurlittstr. 6 · 27474 Cuxhaven · Deutschland";

function footer(): string {
  const sep = `<span style="color:#d4d4d8;">&nbsp;·&nbsp;</span>`;
  const socialLink = (href: string, label: string) =>
    `<a href="${href}" style="color:#52525b;text-decoration:none;font-weight:500;">${label}</a>`;
  const metaLink = (href: string, label: string) =>
    `<a href="${href}" style="color:#a1a1aa;text-decoration:none;">${label}</a>`;
  return `<tr><td style="padding:22px 36px 26px;border-top:1px solid #f4f4f5;background:#fafaf9;">
        <p style="margin:0 0 12px;font-size:13px;text-align:center;line-height:1.6;">
          ${socialLink(SOCIAL.instagram, "Instagram")}${sep}${socialLink(SOCIAL.x, "X")}${sep}${socialLink(SOCIAL.linkedin, "LinkedIn")}
        </p>
        <p style="margin:0 0 10px;font-size:12px;text-align:center;color:#a1a1aa;line-height:1.6;">
          ${metaLink(`${SITE}/de`, "tulimoa.com")}${sep}${metaLink(`${SITE}/de/help`, "Hilfe")}${sep}${metaLink(`${SITE}/de/privacy`, "Datenschutz")}
        </p>
        <p style="margin:0 0 6px;font-size:11px;text-align:center;color:#a1a1aa;line-height:1.6;">${ADDRESS_LINE}</p>
        <p style="margin:0;font-size:11px;text-align:center;color:#a1a1aa;line-height:1.6;">Fragen? Antworte einfach auf diese Mail.</p>
      </td></tr>`;
}

function shell(bodyInner: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Tulimoa</title>
</head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#27272a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;overflow:hidden;">
      <tr><td style="padding:28px 36px 20px;border-bottom:1px solid #f4f4f5;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:12px;">
            <img src="${SITE}/apple-icon.png" width="30" height="30" alt="Tulimoa" style="display:block;width:30px;height:30px;border-radius:7px;background:#9c0;" />
          </td>
          <td style="vertical-align:middle;font-size:18px;font-weight:600;color:#0a0a0a;letter-spacing:-0.01em;">Tulimoa</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px 36px 28px;">${bodyInner}</td></tr>
      ${footer()}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr>
    <td style="border-radius:9px;background:#0a0a0a;">
      <a href="${href}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:500;color:#fafaf9;text-decoration:none;border-radius:9px;letter-spacing:0.01em;">${label}</a>
    </td>
  </tr></table>`;
}

const para = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3f3f46;">${s}</p>`;
const strong = (s: string) => `<strong style="color:#0a0a0a;">${s}</strong>`;

export async function sendSubmissionNotice(
  env: Env,
  listing: { id: string; slug: string; name: string; url: string; submitterEmail: string | null },
): Promise<void> {
  const key = env.RESEND_API_KEY;
  if (!key) return;
  const to = env.ADMIN_NOTIFY_EMAIL ?? "hello@tulimoa.com";
  const name = esc(listing.name);
  const who = esc(listing.submitterEmail ?? "unbekannt");
  const body = `
    <h1 style="margin:0 0 18px;font-size:22px;font-weight:600;color:#0a0a0a;letter-spacing:-0.01em;line-height:1.3;">Neue Einreichung (via Agent/MCP)</h1>
    ${para(`${strong(name)} · <a href="${esc(listing.url)}" style="color:#3f3f46;text-decoration:underline;word-break:break-all;">${esc(listing.url)}</a>`)}
    ${para(`Eingereicht von: ${strong(who)}`)}
    ${button(ADMIN_QUEUE_URL, "In der Queue prüfen →")}`;
  const html = shell(body);
  try {
    await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL ?? "Tulimoa <hello@tulimoa.com>",
        to,
        subject: `[Tulimoa] Neue Einreichung (MCP): ${listing.name}`,
        html,
      }),
    });
  } catch {
    // best-effort
  }
}
