import type { AdminClient } from "../supabase";

// Regeln rund um Pruefung und Kontingent, Port aus der Hauptapp. Bei Aenderungen dort hier nachziehen:
//   lib/listings/limit.ts            (2 aktive Eintraege, Ausnahmen)
//   lib/admin/reject-reasons.ts      (RESUBMITTABLE)
//   submit/[slug]/edit/actions.ts    (canResubmit, TRACKED_FIELDS, diffListing)
//   lib/listings/launch.ts           (publishIfEligible) + launch-rules.ts (launchEligible)

// profiles-Spalten (is_curator, is_agency, language) fehlen in den lokalen database.types -> loser Client.
type Loose = { from: (t: string) => any };
const loose = (admin: AdminClient) => admin as unknown as Loose;

export const LISTING_LIMIT = 2;
const CURATOR_EMAIL = "directory@tulimoa.com";

export type SubmitterProfile = {
  email: string | null;
  name: string | null;
  language: "de" | "en";
  isAdmin: boolean;
  isCurator: boolean;
  isAgency: boolean;
};

export async function loadProfile(admin: AdminClient, userId: string): Promise<SubmitterProfile> {
  const { data } = await loose(admin)
    .from("profiles")
    .select("email, name, language, is_admin, is_curator, is_agency")
    .eq("id", userId)
    .maybeSingle();
  const p = (data ?? {}) as Record<string, unknown>;
  return {
    email: typeof p.email === "string" ? p.email : null,
    name: typeof p.name === "string" ? p.name : null,
    language: p.language === "de" ? "de" : "en",
    isAdmin: p.is_admin === true,
    isCurator: p.is_curator === true,
    isAgency: p.is_agency === true,
  };
}

/** Admins, Kuratoren, Agenturen und der Kurator-Platzhalter: kein Limit, kein Badge-Zwang beim Einreichen. */
export function isStaffOrAgency(p: SubmitterProfile): boolean {
  return p.isAdmin || p.isCurator || p.isAgency || (p.email ?? "").toLowerCase() === CURATOR_EMAIL;
}

async function activeListingCount(admin: AdminClient, userId: string): Promise<number> {
  const { count } = await admin
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .in("status", ["pending", "approved"]);
  return count ?? 0;
}

/** Kontingent wie getListingQuota: reached = kein weiteres aktives Listing erlaubt. */
export async function quotaReached(admin: AdminClient, userId: string, profile: SubmitterProfile): Promise<boolean> {
  if (isStaffOrAgency(profile)) return false;
  return (await activeListingCount(admin, userId)) >= LISTING_LIMIT;
}

// Nach diesen Ablehnungsgruenden darf ueberarbeitet und neu eingereicht werden.
const RESUBMITTABLE = new Set([
  "not_relevant",
  "ai_usage_unclear",
  "unreachable",
  "low_quality",
  "misleading",
  "no_own_site",
  "mobile_app",
  "other",
]);
const KNOWN_REASONS = new Set([...RESUBMITTABLE, "spam", "duplicate", "not_product", "listing_limit"]);

/** Darf ein abgelehntes Listing nach dem Bearbeiten zurueck in die Queue? */
export async function canResubmit(admin: AdminClient, listingId: string, userId: string, profile: SubmitterProfile): Promise<boolean> {
  try {
    const { data } = await loose(admin)
      .from("audit_log")
      .select("metadata")
      .eq("target_type", "listing")
      .eq("target_id", listingId)
      .eq("action", "rejected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const meta = ((data as { metadata?: unknown } | null)?.metadata ?? {}) as { reasons?: unknown };
    const reasons = Array.isArray(meta.reasons) ? meta.reasons.map(String) : [];
    if (!reasons.every((r) => KNOWN_REASONS.has(r) && RESUBMITTABLE.has(r))) return false;
    return !(await quotaReached(admin, userId, profile));
  } catch (err) {
    console.error("[canResubmit] failed:", err);
    return false;
  }
}

// ── Aenderungsprotokoll (Admin-Queue „Bearbeitungen“) ───────────────────────

export const TRACKED_FIELDS = [
  "name", "url", "short_description", "country", "mcp", "category", "eu_hosted",
  "mcp_server_url", "mcp_auth", "pricing_model", "pricing_detail",
  "founded_year", "team_size", "demo_url", "docs_url",
  "open_source", "notable_customers",
  "data_region", "hosting_provider", "gdpr_dpa", "mcp_docs_url", "x_handle", "launch_hook",
  "ai_usage", "agent_interfaces", "model_source", "trains_on_customer_data", "certifications",
  "founder_x_handles",
  "content_blocks", "badge_verified",
  "logo_url", "hero_url", "gallery_urls", "gallery_captions",
] as const;

function normalizeForCompare(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function diffListing(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const field of TRACKED_FIELDS) {
    if (!(field in after)) continue;
    const oldVal = before[field] ?? null;
    const newVal = after[field] ?? null;
    if (normalizeForCompare(oldVal) !== normalizeForCompare(newVal)) changes[field] = { old: oldVal, new: newVal };
  }
  return changes;
}

export async function insertAudit(
  admin: AdminClient,
  row: { actorId: string; action: string; listingId: string; metadata: Record<string, unknown> },
): Promise<void> {
  const { error } = await loose(admin).from("audit_log").insert({
    actor_id: row.actorId,
    action: row.action,
    target_type: "listing",
    target_id: row.listingId,
    metadata: JSON.parse(JSON.stringify(row.metadata)),
  });
  if (error) console.error(`[audit] ${row.action} failed:`, error.message ?? error);
}

/**
 * Launch-Paket: wartet ein freigegebenes Listing auf Badge oder Zahlung und ist jetzt eins davon da,
 * geht es live (publishIfEligible der Hauptapp, ohne Cache-Revalidierung und IndexNow-Ping).
 */
export async function publishIfEligible(admin: AdminClient, listingId: string): Promise<boolean> {
  const { data: l } = await admin
    .from("listings")
    .select("id, status, published_at, listing_fee_required, listing_fee_paid_at, badge_verified")
    .eq("id", listingId)
    .maybeSingle();
  if (!l || l.status !== "approved" || l.published_at || !l.listing_fee_required) return false;
  if (!(l.badge_verified || l.listing_fee_paid_at)) return false;
  const { data: rows } = await admin
    .from("listings")
    .update({ published_at: new Date().toISOString(), ...(l.badge_verified ? { badge_missing_since: null } : {}) })
    .eq("id", listingId)
    .is("published_at", null)
    .select("id");
  return !!rows && rows.length > 0;
}
