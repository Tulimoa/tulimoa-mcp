// Best-effort Mails rund um Einreichungen ueber den MCP-/Agent-Weg (Port der Web-Mails):
//   sendSubmissionNotice     Admin: neue Einreichung (Web: submit/new/actions.ts)
//   sendSubmitterConfirmation Einreicher: „In Pruefung“ (Web: listingSubmittedSubject/-Html)
//   sendResubmissionNotice   Admin: abgelehntes Listing bearbeitet, wieder in der Queue
// Fehlt der Resend-Key oder failt die API, wird still uebersprungen (nie den Submit blockieren).

import type { Env } from "./types";

const RESEND_API = "https://api.resend.com/emails";
const SITE = "https://tulimoa.com";
const ADMIN_QUEUE_URL = "https://admin.tulimoa.com/queue";

type Lang = "de" | "en";

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

function footer(lang: Lang): string {
  const de = lang === "de";
  const sep = `<span style="color:#d4d4d8;">&nbsp;·&nbsp;</span>`;
  const socialLink = (href: string, label: string) =>
    `<a href="${href}" style="color:#52525b;text-decoration:none;font-weight:500;">${label}</a>`;
  const metaLink = (href: string, label: string) =>
    `<a href="${href}" style="color:#a1a1aa;text-decoration:none;">${label}</a>`;
  const home = de ? `${SITE}/de` : SITE;
  const help = de ? `${SITE}/de/help` : `${SITE}/help`;
  const privacy = de ? `${SITE}/de/privacy` : `${SITE}/privacy`;
  return `<tr><td style="padding:22px 36px 26px;border-top:1px solid #f4f4f5;background:#fafaf9;">
        <p style="margin:0 0 12px;font-size:13px;text-align:center;line-height:1.6;">
          ${socialLink(SOCIAL.instagram, "Instagram")}${sep}${socialLink(SOCIAL.x, "X")}${sep}${socialLink(SOCIAL.linkedin, "LinkedIn")}
        </p>
        <p style="margin:0 0 10px;font-size:12px;text-align:center;color:#a1a1aa;line-height:1.6;">
          ${metaLink(home, "tulimoa.com")}${sep}${metaLink(help, de ? "Hilfe" : "Help")}${sep}${metaLink(privacy, de ? "Datenschutz" : "Privacy")}
        </p>
        <p style="margin:0 0 6px;font-size:11px;text-align:center;color:#a1a1aa;line-height:1.6;">${ADDRESS_LINE}</p>
        <p style="margin:0;font-size:11px;text-align:center;color:#a1a1aa;line-height:1.6;">${de ? "Fragen? Antworte einfach auf diese Mail." : "Questions? Just reply to this email."}</p>
      </td></tr>`;
}

function shell(bodyInner: string, lang: Lang = "de"): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
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
      ${footer(lang)}
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
const heading = (s: string) =>
  `<h1 style="margin:0 0 18px;font-size:22px;font-weight:600;color:#0a0a0a;letter-spacing:-0.01em;line-height:1.3;">${s}</h1>`;

async function send(env: Env, mail: { to: string; subject: string; html: string }): Promise<void> {
  const key = env.RESEND_API_KEY;
  if (!key) return;
  try {
    await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.RESEND_FROM_EMAIL ?? "Tulimoa <hello@tulimoa.com>", ...mail }),
    });
  } catch {
    // best-effort
  }
}

export async function sendSubmissionNotice(
  env: Env,
  listing: { id: string; slug: string; name: string; url: string; submitterEmail: string | null; visibility: string; testRequested: boolean },
): Promise<void> {
  const name = esc(listing.name);
  const who = esc(listing.submitterEmail ?? "unbekannt");
  const way = listing.visibility === "launch" ? "Launch-Paket (5 $)" : "kostenlos mit Badge";
  const body = `
    ${heading("Neue Einreichung über MCP")}
    ${para(`${strong(name)} · <a href="${esc(listing.url)}" style="color:#3f3f46;text-decoration:underline;word-break:break-all;">${esc(listing.url)}</a>`)}
    ${para(`Eingereicht von: ${strong(who)}<br>Weg: ${way}${listing.testRequested ? "<br>Testwunsch: ja" : ""}`)}
    ${button(ADMIN_QUEUE_URL, "In der Queue prüfen →")}`;
  await send(env, {
    to: env.ADMIN_NOTIFY_EMAIL ?? "hello@tulimoa.com",
    subject: `[Tulimoa] Neue Einreichung (MCP): ${listing.name}`,
    html: shell(body, "de"),
  });
}

/** Eingangsbestaetigung wie im Web (listingSubmittedSubject + renderListingSubmittedHtml), Sprache aus dem Profil. */
export async function sendSubmitterConfirmation(env: Env, to: string, listingName: string, lang: Lang): Promise<void> {
  const name = strong(esc(listingName));
  const body =
    lang === "de"
      ? `${heading("Danke, wir schauen es uns an")}
    ${para("Hey,")}
    ${para(`deine Einreichung ${name} ist bei uns eingegangen und liegt jetzt in der Prüfung.`)}
    ${para("Sobald wir entschieden haben, bekommst du eine Mail. In der Regel dauert das ein bis zwei Werktage.")}`
      : `${heading("Thanks, we're on it")}
    ${para("Hi,")}
    ${para(`your submission ${name} reached us and is now under review.`)}
    ${para("We'll email you as soon as we've decided. This usually takes one to two business days.")}`;
  await send(env, {
    to,
    subject: lang === "de" ? `In Prüfung: ${listingName}` : `Under review: ${listingName}`,
    html: shell(body, lang),
  });
}

/** Admin-Hinweis wie recordResubmission in submit/[slug]/edit/actions.ts. */
export async function sendResubmissionNotice(
  env: Env,
  listing: { name: string; url: string; submitterEmail: string | null },
): Promise<void> {
  const body = `
    ${heading("Erneut eingereicht über MCP")}
    ${para("Ein abgelehntes Listing wurde bearbeitet und liegt wieder in der Queue.")}
    ${para(`${strong(esc(listing.name))} · ${esc(listing.url)}<br>Von: ${strong(esc(listing.submitterEmail ?? "unbekannt"))}`)}
    ${button(ADMIN_QUEUE_URL, "In der Queue prüfen →")}`;
  await send(env, {
    to: env.ADMIN_NOTIFY_EMAIL ?? "hello@tulimoa.com",
    subject: `[Tulimoa] Resubmitted listing (MCP): ${listing.name}`,
    html: shell(body, "de"),
  });
}
