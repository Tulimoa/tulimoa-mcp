// Tulimoa-Badge-Erkennung fuer submit_listing/edit_listing. Port 1:1 aus der Hauptapp
// (Tulimoa/src/lib/badge-detect.ts). Bei Aenderungen der Marker oder Mindestbreite dort hier nachziehen.
//
// Seit 2026-10-15 muss der Badge auf dem kostenlosen Weg VOR dem Absenden auf der Website sein
// (Web: submit/new/actions.ts, Fehler badge_required / badge_unreachable). Ausgenommen sind Admins,
// Kuratoren und Agenturen.

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 5_000_000;
const MIN_BADGE_WIDTH = 100;

const BADGE_PATTERNS: RegExp[] = [
  /tulimoa\.com\/badge\/(light|dark)\.svg/i,
  /data-tulimoa-badge\s*=\s*["'](?:light|dark)["']/i,
];

function badgeTooSmall(html: string): boolean {
  const imgTags = html.match(/<img\b[^>]*tulimoa\.com\/badge\/(?:light|dark)\.svg[^>]*>/gi) ?? [];
  if (imgTags.length === 0) return false;
  for (const tag of imgTags) {
    const hidden = /display\s*:\s*none/i.test(tag) || /\bwidth\s*=\s*["']?0\b/i.test(tag);
    if (hidden) continue;
    const w = tag.match(/\bwidth\s*=\s*["']?(\d+)/i);
    const widthVal = w ? Number(w[1]) : null;
    if (widthVal === null || widthVal >= MIN_BADGE_WIDTH) return false;
  }
  return true;
}

export type BadgeResult = { present: boolean; reason?: "not_found" | "too_small"; error?: string };

export function detectTulimoaBadge(html: string): BadgeResult {
  const found = BADGE_PATTERNS.some((p) => p.test(html));
  if (!found) return { present: false, reason: "not_found" };
  if (badgeTooSmall(html)) return { present: false, reason: "too_small" };
  return { present: true };
}

/** Holt die Website und prueft den Badge. error gesetzt = nicht erreichbar (nicht als „fehlt“ werten). */
export async function fetchAndDetectBadge(urlRaw: string): Promise<BadgeResult> {
  let url: URL;
  try {
    url = new URL(urlRaw);
  } catch {
    return { present: false, error: "invalid_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { present: false, error: "invalid_protocol" };

  let html = "";
  try {
    const res = await fetch(url.toString(), {
      headers: { "user-agent": "Tulimoa-Verifier/1.0 (+https://tulimoa.com)", accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return { present: false, error: `http_${res.status}` };
    const reader = res.body?.getReader();
    if (!reader) return { present: false, error: "no_body" };
    const decoder = new TextDecoder();
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        break;
      }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
  } catch (err) {
    const msg = err instanceof Error ? `${err.name} ${err.message}` : "";
    return { present: false, error: /abort|timeout/i.test(msg) ? "timeout" : "fetch_failed" };
  }
  return detectTulimoaBadge(html);
}
