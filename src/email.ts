// Best-effort Admin-Benachrichtigung bei neuen Listing-Einreichungen über den MCP-/Agent-Weg.
// Der Web-Submit (Next-App) mailt bereits selbst; dieser Pfad schließt die Lücke, damit AUCH
// von Agenten eingereichte Listings in der Freigabe-Queue gemeldet werden. Fehlt der Resend-Key
// oder failt die API, wird still übersprungen (nie den Submit blockieren).

import type { Env } from "./types";

const RESEND_API = "https://api.resend.com/emails";
const ADMIN_QUEUE_URL = "https://admin.tulimoa.com/queue";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendSubmissionNotice(
  env: Env,
  listing: { id: string; slug: string; name: string; url: string; submitterEmail: string | null },
): Promise<void> {
  const key = env.RESEND_API_KEY;
  if (!key) return;
  const to = env.ADMIN_NOTIFY_EMAIL ?? "hello@tulimoa.com";
  const name = esc(listing.name);
  const who = esc(listing.submitterEmail ?? "unbekannt");
  const html =
    `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#1a1a19">` +
    `<h2 style="font-size:18px;margin:0 0 12px">Neue Einreichung (via Agent/MCP)</h2>` +
    `<p style="font-size:14px;line-height:1.6;color:#33332f;margin:0 0 8px"><strong>${name}</strong> — ${esc(listing.url)}</p>` +
    `<p style="font-size:13px;line-height:1.6;color:#57534e;margin:0 0 16px">Eingereicht von: ${who}</p>` +
    `<a href="${ADMIN_QUEUE_URL}" style="display:inline-block;background:#84cc16;color:#1a2a06;font-weight:600;font-size:14px;text-decoration:none;padding:9px 16px;border-radius:9px">In der Queue prüfen</a>` +
    `</div>`;
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
