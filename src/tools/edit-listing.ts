import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { makeAdmin } from "../supabase";
import { hasWrite } from "../auth";
import type { Env, McpUser } from "../types";
import { CATEGORY_IDS, PRICING_MODELS } from "../constants";
import { LOGO_URL_HINT, importLogo, removeLogo } from "./logo";
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

function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

const inputSchema = z.object({
  slug: z.string().min(1).describe("Slug of YOUR listing to edit (from submit_listing)."),
  name: z.string().min(1).max(60).optional(),
  url: z.string().url().optional(),
  short_description: z.string().min(1).max(300).optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  mcp: z.boolean().optional(),
  pricing_model: z.enum(PRICING_MODELS).optional(),
  tags: z.array(z.string().min(1).max(40)).max(8).optional(),
  logo_url: z.string().url().optional().describe(`New logo. ${LOGO_URL_HINT} Required if the listing has no logo yet.`),
  ai_usage: z.string().min(AI_USAGE_MIN).max(AI_USAGE_MAX).optional().describe(AI_USAGE_HINT.replace("Required, ", "")),
  pricing_detail: z.string().max(400).optional(),
  mcp_server_url: z.string().url().optional(),
  mcp_docs_url: z.string().url().optional(),
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
});

export function registerEditListing(server: McpServer, env: Env, _ctx: ExecutionContext, user: McpUser | null) {
  server.registerTool(
    "edit_listing",
    {
      title: "Edit one of your own Tulimoa listings",
      description:
        "Update fields of a listing you own (by slug). You cannot change ownership or set review status. " +
        "Any edit sends the listing back to admin review (status: pending) and it reappears publicly only after re-approval. " +
        "Every listing needs a logo: pass logo_url to replace it (required if the listing has none yet). " +
        "Requires a write-scoped Tulimoa login.",
      inputSchema,
      outputSchema: z.object({
        id: z.string().describe("Listing id."),
        slug: z.string(),
        status: z.literal("pending"),
      }),
    },
    async (raw) => {
      if (!user) return fail("Authentication required to edit a listing.");
      if (!hasWrite(user)) return fail("This token is read-only. A write-scoped token is required to edit a listing.");

      const a = raw as Partial<z.infer<typeof inputSchema>>;
      const slug = String(a.slug ?? "");
      if (!slug) return fail("`slug` is required.");

      // Nur explizit gesetzte, erlaubte Felder. owner/slug bleiben unberuehrt; status/publication
      // werden unten bei einer echten Aenderung zurueckgesetzt (Re-Moderation).
      const patch: {
        name?: string;
        url?: string;
        short_description?: string;
        category?: string;
        mcp?: boolean;
        pricing_model?: string;
        tags?: string[];
        logo_url?: string;
        ai_usage?: string;
        pricing_detail?: string | null;
        mcp_server_url?: string | null;
        mcp_docs_url?: string | null;
        mcp_auth?: string[];
        data_region?: string;
        hosting_provider?: string | null;
        gdpr_dpa?: boolean;
        agent_interfaces?: string[];
        model_source?: string;
        trains_on_customer_data?: string;
        certifications?: string[];
        launch_hook?: string | null;
        x_handle?: string | null;
        founder_x_handles?: string[];
        status?: string;
        published_at?: string | null;
        approved_at?: string | null;
        updated_at?: string;
      } = {};
      if (a.name !== undefined) patch.name = a.name;
      if (a.url !== undefined) patch.url = a.url;
      if (a.short_description !== undefined) patch.short_description = a.short_description;
      if (a.category !== undefined) patch.category = a.category;
      if (a.mcp !== undefined) patch.mcp = a.mcp;
      if (a.pricing_model !== undefined) patch.pricing_model = a.pricing_model;
      if (a.tags !== undefined) patch.tags = a.tags.slice(0, 8);
      if (a.ai_usage !== undefined) {
        const ai = cleanAiUsage(a.ai_usage);
        if (ai.length < AI_USAGE_MIN) return fail(`ai_usage is too short: at least ${AI_USAGE_MIN} characters.`);
        patch.ai_usage = ai;
      }
      if (a.pricing_detail !== undefined) patch.pricing_detail = a.pricing_detail.trim() || null;
      if (a.mcp_server_url !== undefined) patch.mcp_server_url = a.mcp_server_url;
      if (a.mcp_docs_url !== undefined) patch.mcp_docs_url = a.mcp_docs_url;
      if (a.mcp_auth !== undefined) patch.mcp_auth = a.mcp_auth;
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
      if (Object.keys(patch).length === 0 && a.logo_url === undefined) {
        return fail("Nothing to update: provide at least one field.");
      }

      const admin = makeAdmin(env);

      // Eigene Zeile vorab lesen: Logo-Pflicht wie im Web-Editor (submit/[slug]/edit/actions.ts:
      // logo_required), auch bestehende Listings ohne Logo brauchen beim naechsten Speichern eins.
      const { data: current, error: readErr } = await admin
        .from("listings")
        .select("id,logo_url")
        .eq("slug", slug)
        .eq("owner_id", user.userId) // Isolation: nur eigene Zeile
        .maybeSingle();
      if (readErr) return fail(`Edit failed: ${readErr.message}`);
      if (!current) return fail("No listing with that slug is owned by you.");

      let newLogoPath: string | null = null;
      if (a.logo_url !== undefined) {
        const logo = await importLogo(env, admin, user.userId, a.logo_url);
        if (!logo.ok) return fail(logo.error);
        patch.logo_url = logo.url;
        newLogoPath = logo.path;
      } else if (!current.logo_url) {
        return fail("This listing has no logo yet. Pass logo_url with this edit; every listing needs a logo.");
      }

      // Re-Moderation: jede inhaltliche Aenderung nimmt das Listing offline und schickt es zurueck in
      // die Queue. Sonst koennte ein bereits freigegebenes+veroeffentlichtes Listing beliebige neue
      // Inhalte (z.B. Spam-URL) sofort oeffentlich ausspielen, ohne erneute Pruefung.
      patch.status = "pending";
      patch.published_at = null;
      patch.approved_at = null;
      patch.updated_at = new Date().toISOString();

      const { data, error } = await admin
        .from("listings")
        .update(patch)
        .eq("id", current.id)
        .eq("owner_id", user.userId)
        .select("id,slug")
        .maybeSingle();

      if (error || !data) {
        if (newLogoPath) await removeLogo(admin, newLogoPath);
        return fail(error ? `Edit failed: ${error.message}` : "No listing with that slug is owned by you.");
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Listing "${data.slug}" updated and sent back to review (status: pending). It reappears publicly after admin re-approval.`,
          },
        ],
        structuredContent: { id: data.id, slug: data.slug, status: "pending" },
      };
    },
  );
}
