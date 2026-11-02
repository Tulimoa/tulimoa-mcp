import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { makeAdmin } from "../supabase";
import { hasWrite } from "../auth";
import { sendResubmissionNotice } from "../email";
import { anyProfanity } from "../moderation";
import type { Env, McpUser } from "../types";
import { CATEGORY_IDS, COUNTRY_CODES, PRICING_MODELS } from "../constants";
import { LOGO_URL_HINT, MAX_CAPTION, importGallery, importLogo, removeGallery, removeLogo } from "./logo";
import { fetchAndDetectBadge } from "./badge";
import { blockTexts, detailsShape, httpUrl, normalizeContentBlocks } from "./fields";
import { canResubmit, diffListing, insertAudit, loadProfile, publishIfEligible } from "./review";
import {
  AGENT_INTERFACES,
  AI_USAGE_HINT,
  AI_USAGE_MAX,
  AI_USAGE_MIN,
  CERTIFICATIONS,
  DATA_REGIONS,
  DATA_REGION_HINT,
  MAX_FOUNDER_HANDLES,
  MCP_AUTH,
  MODEL_SOURCES,
  TRAINS_OPTIONS,
  cleanAiUsage,
  normalizeHandles,
} from "./launch";

// Regeln 1:1 wie der Web-Editor (Tulimoa/src/app/(landing)/submit/[slug]/edit/actions.ts):
//   - Aenderungen an einem freigegebenen Listing sind sofort live; der Admin sieht sie in der Queue
//     unter „Bearbeitungen“ (audit_log listing_edited mit Feld-Diff).
//   - Zurueck in die Pruefung (pending) nur, wenn bei einem freigegebenen Listing der MCP-Endpoint
//     wechselt (Cross-Tenant-Schutz) oder ein abgelehntes Listing bearbeitet wird und der
//     Ablehnungsgrund + das Kontingent das erlauben (Neu-Einreichung).
//   - Badge wird bei jedem Speichern neu geprueft; bei Netzwerkfehler bleibt der alte Stand.
// Teil-Updates: nur uebergebene Felder aendern sich.

function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

const inputSchema = z.object({
  slug: z.string().min(1).describe("Slug of YOUR listing to edit (from submit_listing or get_listing)."),
  name: z.string().min(1).max(60).optional(),
  url: httpUrl().optional().describe("The product's own website (http or https)."),
  short_description: z.string().min(1).max(300).optional(),
  country: z.enum(COUNTRY_CODES).optional().describe("ISO-3166-1 alpha-2 code of the company's HQ."),
  category: z.enum(CATEGORY_IDS).optional(),
  mcp: z.boolean().optional(),
  pricing_model: z.enum(PRICING_MODELS).optional(),
  logo_url: httpUrl().optional().describe(`New logo. ${LOGO_URL_HINT} Required if the listing has no logo yet.`),
  ai_usage: z.string().min(AI_USAGE_MIN).max(AI_USAGE_MAX).optional().describe(AI_USAGE_HINT.replace("Required, ", "")),
  pricing_detail: z.string().max(400).optional(),
  mcp_server_url: httpUrl().optional().describe("MCP endpoint. Changing it on a live listing sends it back into review."),
  mcp_docs_url: httpUrl().optional(),
  mcp_auth: z.array(z.enum(MCP_AUTH)).max(2).optional(),
  data_region: z.enum(DATA_REGIONS).optional().describe(DATA_REGION_HINT),
  hosting_provider: z.string().max(60).optional(),
  gdpr_dpa: z.boolean().optional(),
  agent_interfaces: z.array(z.enum(AGENT_INTERFACES)).max(4).optional(),
  model_source: z.enum(MODEL_SOURCES).optional(),
  trains_on_customer_data: z.enum(TRAINS_OPTIONS).optional(),
  certifications: z.array(z.enum(CERTIFICATIONS)).max(3).optional(),
  launch_hook: z.string().max(140).optional(),
  x_handle: z.string().max(40).optional(),
  founder_x_handles: z.array(z.string().max(40)).max(MAX_FOUNDER_HANDLES).optional(),
  ...detailsShape,
});

type Args = z.infer<typeof inputSchema>;
type Row = Record<string, unknown> & {
  id: string;
  slug: string;
  status: string;
  url: string;
  name: string;
  mcp: boolean;
  mcp_server_url: string | null;
  logo_url: string | null;
  gallery_urls: string[] | null;
  badge_verified: boolean;
};

export function registerEditListing(server: McpServer, env: Env, ctx: ExecutionContext, user: McpUser | null) {
  server.registerTool(
    "edit_listing",
    {
      title: "Edit one of your own Tulimoa listings",
      description:
        "Update fields of a listing you own (by slug), with the same fields and rules as the web editor. Only the fields you " +
        "pass change. Changes to a live listing show right away and are checked by the team afterwards. A changed MCP " +
        "endpoint on a live listing sends it back into review. Editing a rejected listing resubmits it for review when the " +
        "rejection reason allows it (not after spam, duplicate, not a product or the listing limit). The Tulimoa badge is " +
        "re-checked on every edit. Every listing needs a logo: pass logo_url to replace it (required if it has none). " +
        "gallery_urls and content_blocks replace the whole list. Requires a write-scoped Tulimoa login.",
      inputSchema,
      outputSchema: z.object({
        id: z.string().describe("Listing id."),
        slug: z.string(),
        status: z.string().describe("Status after the edit: approved (live), pending (in review) or rejected."),
        badge_verified: z.boolean(),
        back_in_review: z.boolean().describe("true = the edit sent the listing (back) into review."),
      }),
    },
    async (raw) => {
      if (!user) return fail("Authentication required to edit a listing.");
      if (!hasWrite(user)) return fail("This token is read-only. A write-scoped token is required to edit a listing.");

      const a = raw as Args;
      const slug = String(a.slug ?? "");
      if (!slug) return fail("`slug` is required.");

      const admin = makeAdmin(env);
      const { data: currentRaw, error: readErr } = await admin
        .from("listings")
        .select("*")
        .eq("slug", slug)
        .eq("owner_id", user.userId) // Isolation: nur eigene Zeile
        .maybeSingle();
      if (readErr) return fail(`Edit failed: ${readErr.message}`);
      if (!currentRaw) return fail("No listing with that slug is owned by you.");
      const current = currentRaw as unknown as Row;

      // ── Patch aus den uebergebenen Feldern ──────────────────────────────
      const patch: Record<string, unknown> = {};
      if (a.name !== undefined) patch.name = a.name;
      if (a.url !== undefined) patch.url = a.url;
      if (a.short_description !== undefined) patch.short_description = a.short_description;
      if (a.country !== undefined) patch.country = a.country;
      if (a.category !== undefined) patch.category = a.category;
      if (a.pricing_model !== undefined) patch.pricing_model = a.pricing_model;
      if (a.pricing_detail !== undefined) patch.pricing_detail = a.pricing_detail.trim() || null;
      if (a.ai_usage !== undefined) {
        const ai = cleanAiUsage(a.ai_usage);
        if (ai.length < AI_USAGE_MIN) return fail(`ai_usage is too short: at least ${AI_USAGE_MIN} characters.`);
        patch.ai_usage = ai;
      }

      // MCP-Felder wie im Formular: ohne MCP-Server keine Endpoint-/Doku-/Auth-Angaben.
      const nextMcp = a.mcp ?? current.mcp;
      if (a.mcp !== undefined) patch.mcp = a.mcp;
      if (!nextMcp) {
        if (a.mcp === false) {
          patch.mcp_server_url = null;
          patch.mcp_docs_url = null;
          patch.mcp_auth = [];
        }
      } else {
        if (a.mcp_server_url !== undefined) patch.mcp_server_url = a.mcp_server_url;
        if (a.mcp_docs_url !== undefined) patch.mcp_docs_url = a.mcp_docs_url;
        if (a.mcp_auth !== undefined) patch.mcp_auth = a.mcp_auth;
      }

      if (a.data_region !== undefined) patch.data_region = a.data_region;
      if (a.hosting_provider !== undefined) patch.hosting_provider = a.hosting_provider.trim() || null;
      if (a.gdpr_dpa !== undefined) patch.gdpr_dpa = a.gdpr_dpa;
      if (a.agent_interfaces !== undefined) patch.agent_interfaces = a.agent_interfaces;
      if (a.model_source !== undefined) patch.model_source = a.model_source;
      if (a.trains_on_customer_data !== undefined) patch.trains_on_customer_data = a.trains_on_customer_data;
      if (a.certifications !== undefined) patch.certifications = a.certifications;
      if (a.launch_hook !== undefined) patch.launch_hook = a.launch_hook.replace(/\s+/g, " ").trim().slice(0, 140) || null;
      if (a.x_handle !== undefined || a.founder_x_handles !== undefined) {
        const h = normalizeHandles(a.x_handle, a.founder_x_handles);
        if (!h.ok) return fail(h.error);
        if (a.x_handle !== undefined) patch.x_handle = h.company;
        if (a.founder_x_handles !== undefined) patch.founder_x_handles = h.founders;
      }
      if (a.founded_year !== undefined) patch.founded_year = a.founded_year;
      if (a.team_size !== undefined) patch.team_size = a.team_size;
      if (a.demo_url !== undefined) patch.demo_url = a.demo_url;
      if (a.docs_url !== undefined) patch.docs_url = a.docs_url;
      if (a.open_source !== undefined) patch.open_source = a.open_source;
      if (a.notable_customers !== undefined) patch.notable_customers = a.notable_customers.trim().slice(0, 200) || null;
      let contentBlocks: ReturnType<typeof normalizeContentBlocks> = null;
      if (a.content_blocks !== undefined) {
        contentBlocks = normalizeContentBlocks(a.content_blocks);
        patch.content_blocks = contentBlocks;
      }

      const hasImages = a.logo_url !== undefined || a.gallery_urls !== undefined || a.gallery_captions !== undefined;
      if (Object.keys(patch).length === 0 && !hasImages) return fail("Nothing to update: provide at least one field.");

      // Sperrwoerter wie im Web-Editor.
      if (
        anyProfanity([
          a.name,
          a.short_description,
          patch.pricing_detail as string | null | undefined,
          patch.notable_customers as string | null | undefined,
          patch.launch_hook as string | null | undefined,
          patch.hosting_provider as string | null | undefined,
          patch.ai_usage as string | null | undefined,
          ...blockTexts(contentBlocks),
        ])
      ) {
        return fail("The edit contains words we don't allow. Please rephrase it.");
      }

      // Logo-Pflicht wie im Web-Editor (logo_required).
      if (a.logo_url === undefined && !current.logo_url) {
        return fail("This listing has no logo yet. Pass logo_url with this edit; every listing needs a logo.");
      }

      // ── Badge neu pruefen (Netzwerkfehler: alten Stand behalten) ─────────
      const nextUrl = (patch.url as string | undefined) ?? current.url;
      const badge = await fetchAndDetectBadge(nextUrl);
      const badgeVerified = badge.present ? true : badge.error ? current.badge_verified === true : false;
      patch.badge_verified = badgeVerified;
      patch.badge_verified_at = badgeVerified ? new Date().toISOString() : null;
      if (badgeVerified) patch.badge_missing_since = null;

      // ── Bilder ──────────────────────────────────────────────────────────
      let newLogoPath: string | null = null;
      let newGalleryPaths: string[] = [];
      if (a.logo_url !== undefined) {
        const logo = await importLogo(env, admin, user.userId, a.logo_url);
        if (!logo.ok) return fail(logo.error);
        patch.logo_url = logo.url;
        newLogoPath = logo.path;
      }
      if (a.gallery_urls !== undefined) {
        const gallery = await importGallery(env, admin, user.userId, a.gallery_urls, a.gallery_captions);
        if (!gallery.ok) {
          await removeLogo(admin, newLogoPath);
          return fail(gallery.error);
        }
        patch.gallery_urls = gallery.urls.length > 0 ? gallery.urls : null;
        patch.gallery_captions = gallery.captions.some((c) => c) ? gallery.captions : null;
        patch.hero_url = gallery.urls[0] ?? null;
        newGalleryPaths = gallery.paths;
      } else if (a.gallery_captions !== undefined) {
        const urls = current.gallery_urls ?? [];
        const captions = urls.map((_, i) => (a.gallery_captions?.[i] ?? "").trim().slice(0, MAX_CAPTION));
        patch.gallery_captions = captions.some((c) => c) ? captions : null;
      }

      // Inhaltsbloecke ersetzen die Alt-Felder (wie im Web-Editor), aber nur wenn Bloecke mitkommen.
      const legacyReset =
        a.content_blocks !== undefined
          ? { long_description: null, ideal_for: null, not_for: null, use_cases: null, integrations: null, features: null }
          : {};

      // ── Zurueck in die Pruefung? ────────────────────────────────────────
      const prevEndpoint = current.mcp_server_url ?? null;
      const nextEndpoint = nextMcp ? ((patch.mcp_server_url as string | null | undefined) ?? prevEndpoint) : null;
      const endpointChanged = (nextMcp || current.mcp) && nextEndpoint !== prevEndpoint;
      const profile = current.status === "rejected" ? await loadProfile(admin, user.userId) : null;
      const resubmit = current.status === "rejected" && profile !== null && (await canResubmit(admin, current.id, user.userId, profile));
      const backInReview = (current.status === "approved" && endpointChanged) || resubmit;
      const reset = backInReview ? { status: "pending", published_at: null } : {};

      const { data, error } = await admin
        .from("listings")
        .update({ ...patch, ...legacyReset, ...reset, updated_at: new Date().toISOString() })
        .eq("id", current.id)
        .eq("owner_id", user.userId)
        .select("id,slug,status")
        .maybeSingle();

      if (error || !data) {
        await removeLogo(admin, newLogoPath);
        await removeGallery(admin, newGalleryPaths);
        return fail(error ? `Edit failed: ${error.message}` : "No listing with that slug is owned by you.");
      }

      // Aenderungsprotokoll fuer die Admin-Queue („Bearbeitungen“), wie im Web-Editor.
      const changes = diffListing(current, patch);
      if (Object.keys(changes).length > 0) {
        ctx.waitUntil(insertAudit(admin, { actorId: user.userId, action: "listing_edited", listingId: current.id, metadata: { changes, via: "mcp" } }));
      }

      // Launch-Paket: wartete das freigegebene Listing auf den Badge, geht es jetzt live.
      if (badgeVerified && !backInReview) {
        ctx.waitUntil(publishIfEligible(admin, current.id).then(() => undefined, () => undefined));
      }

      if (resubmit) {
        ctx.waitUntil(
          (async () => {
            await insertAudit(admin, { actorId: user.userId, action: "listing_resubmitted", listingId: current.id, metadata: { via: "mcp" } });
            await sendResubmissionNotice(env, {
              name: (patch.name as string | undefined) ?? current.name,
              url: nextUrl,
              submitterEmail: profile?.email ?? null,
            });
          })(),
        );
      }

      const status = data.status;
      const text = resubmit
        ? `Listing "${data.slug}" updated and resubmitted: it is back in review (status: pending). We email the result.`
        : backInReview
          ? `Listing "${data.slug}" updated. The MCP endpoint changed, so it went back into review (status: pending) and is offline until re-approved.`
          : status === "rejected"
            ? `Listing "${data.slug}" updated. It stays rejected: the rejection reason or the listing limit does not allow a resubmission. Questions: hello@tulimoa.com.`
            : status === "approved"
              ? `Listing "${data.slug}" updated. The changes are live; the team checks edits afterwards.`
              : `Listing "${data.slug}" updated. It is still in review (status: pending).`;
      return {
        content: [{ type: "text" as const, text: `${text}${badgeVerified ? " Tulimoa badge found." : ""}` }],
        structuredContent: { id: data.id, slug: data.slug, status, badge_verified: badgeVerified, back_in_review: backInReview },
      };
    },
  );
}
