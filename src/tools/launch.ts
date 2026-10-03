// Launch-Modell des Verzeichnisses (seit 2026-10-03), Port aus der Hauptapp:
// lib/listings/launch-fields.ts (Werte = DB-Checks), lib/listings/badge-snippet.ts,
// lib/admin/review-signals.ts (listingSiteKey). Bei Änderung dort hier nachziehen.
//
// Ein Eintrag geht auf einem von zwei Wegen live: „badge“ (kostenlos, Tulimoa-Badge
// auf der Website, Prüfung innerhalb von 7 Tagen) oder „launch“ (5 $ einmalig, kein
// Badge, wird zuerst geprüft, bei Ablehnung automatisch erstattet). Die Hauptapp
// verlangt die Regel bei der Freigabe nur für Einträge mit visibility_choice.

import type { makeAdmin } from "../supabase";

export const AI_USAGE_MIN = 40;
export const AI_USAGE_MAX = 600;
export const LAUNCH_PRICE_USD = 5;
export const DATA_REGIONS = ["eu", "eu-option", "non-eu", "self-hosted"] as const;
export const AGENT_INTERFACES = ["api", "cli", "sdk", "webhooks"] as const;
export const MODEL_SOURCES = ["own", "open-weight", "provider", "mixed", "none"] as const;
export const TRAINS_OPTIONS = ["no", "opt-out", "yes"] as const;
export const CERTIFICATIONS = ["soc2", "iso27001", "hipaa"] as const;
export const MCP_AUTH = ["oauth", "api"] as const;
export const MAX_FOUNDER_HANDLES = 4;

export const AI_USAGE_HINT =
  `Required, ${AI_USAGE_MIN} to ${AI_USAGE_MAX} characters, ideally in English: how the software uses AI, ` +
  "or what agents can do with it. Be concrete, not salesy. Submissions without a clear AI or agent angle are rejected.";

export const DATA_REGION_HINT =
  "Where customer data is hosted: eu (in the EU by default), eu-option (an EU region can be selected), non-eu, " +
  "self-hosted (runs at the customer). Listings with EU hosting also appear on tulimoa.com/mcp-eu.";

type Admin = ReturnType<typeof makeAdmin>;

/** Whitespace wie in der Hauptapp zusammenziehen, dann auf die DB-Länge kürzen. */
export function cleanAiUsage(raw: string): string {
  return raw.trim().replace(/[ \t]+/g, " ").slice(0, AI_USAGE_MAX);
}

/** X-Handle aus „@name“, „name“ oder Profil-URL; "" = leer, null = ungültig. */
export function normalizeXHandle(raw: string): string | null {
  const h = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  if (!h) return "";
  return /^[A-Za-z0-9_]{1,15}$/.test(h) ? h : null;
}

/** Firma + Founder normalisieren, Duplikate raus. Fehler = ungültiges Handle. */
export function normalizeHandles(
  company: string | undefined,
  founders: string[] | undefined,
): { ok: true; company: string | null; founders: string[] } | { ok: false; error: string } {
  const c = normalizeXHandle(company ?? "");
  if (c === null) return { ok: false, error: `Invalid X handle "${company}". Use 1 to 15 letters, numbers or underscores.` };
  const list: string[] = [];
  for (const raw of founders ?? []) {
    const h = normalizeXHandle(raw);
    if (h === null) return { ok: false, error: `Invalid X handle "${raw}". Use 1 to 15 letters, numbers or underscores.` };
    if (h && h.toLowerCase() !== (c ?? "").toLowerCase() && !list.some((f) => f.toLowerCase() === h.toLowerCase())) {
      list.push(h);
    }
  }
  return { ok: true, company: c || null, founders: list.slice(0, MAX_FOUNDER_HANDLES) };
}

export function badgeSnippet(slug: string, variant: "light" | "dark"): string {
  const href = `https://tulimoa.com/discover/${slug}`;
  return `<a href="${href}" target="_blank" rel="noopener" data-tulimoa-badge="${variant}">
  <img src="https://tulimoa.com/badge/${variant}.svg" alt="Listed on Tulimoa" width="150" height="41" style="max-width:100%;height:auto" />
</a>`;
}

/** Bezahl-Einstieg der Hauptapp: prüft Login + Besitz und leitet zum Polar-Checkout. */
export function launchCheckoutLink(listingId: string): string {
  return `https://tulimoa.com/api/billing/launch?listing=${encodeURIComponent(listingId)}`;
}

/** Launch-Seite im Dashboard: Status, Badge-Prüfung, Bezahlen. */
export function manageLink(slug: string): string {
  return `https://dashboard.tulimoa.com/launch/${encodeURIComponent(slug)}`;
}

// ── Duplikat-Check (gleiche Logik wie das Web-Formular) ──────────────────────

const SHARED_HOSTS = new Set([
  "github.com", "gitlab.com", "huggingface.co", "npmjs.com", "pypi.org",
  "chromewebstore.google.com", "chrome.google.com", "apps.apple.com", "play.google.com",
  "marketplace.visualstudio.com", "producthunt.com", "linktr.ee", "notion.site",
]);

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Domain, bei geteilten Hosts (GitHub & Co.) inklusive der ersten zwei Pfadteile. */
export function siteKey(url: string | null | undefined): string | null {
  const host = hostOf(url);
  if (!host || !url) return null;
  if (!SHARED_HOSTS.has(host)) return host;
  try {
    const t = url.trim();
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    const path = u.pathname.split("/").filter(Boolean).slice(0, 2).join("/").toLowerCase();
    return `${host}/${path}`;
  } catch {
    return host;
  }
}

/** Gleiche Website schon live oder in der Queue? "own" = vom selben Konto, "other" = jemand anderes. */
export async function findListedSite(
  admin: Admin,
  url: string,
  userId: string,
): Promise<{ state: "own" | "other"; slug: string } | null> {
  const key = siteKey(url);
  if (!key) return null;
  const { data } = await admin
    .from("listings")
    .select("slug, url, owner_id, submitted_by")
    .in("status", ["pending", "approved"])
    .range(0, 9999);
  const hits = (data ?? []).filter((row) => siteKey(row.url) === key);
  if (hits.length === 0) return null;
  const own = hits.find((row) => row.owner_id === userId || row.submitted_by === userId);
  return own ? { state: "own", slug: own.slug } : { state: "other", slug: hits[0].slug };
}
