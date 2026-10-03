import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { makeAdmin } from "../supabase";
import { hasWrite } from "../auth";
import { sendSubmissionNotice } from "../email";
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
  LAUNCH_PRICE_USD,
  MAX_FOUNDER_HANDLES,
  MCP_AUTH,
  MODEL_SOURCES,
  TRAINS_OPTIONS,
  badgeSnippet,
  cleanAiUsage,
  findListedSite,
  launchCheckoutLink,
  manageLink,
  normalizeHandles,
} from "./launch";

const MAX_LISTINGS_PER_DAY = 5;

// Minimaler slugify (port aus src/lib/slug.ts der Hauptapp; bei Aenderung dort nachziehen).
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

const inputSchema = z.object({
  name: z.string().min(1).max(60).describe("Product/company name (max 60 chars)."),
  url: z.string().url().describe("Public homepage URL (https)."),
  short_description: z.string().min(1).max(300).describe("One-line pitch (max 300 chars)."),
  country: z.string().regex(/^[A-Z]{2}$/).describe("ISO-3166-1 alpha-2 country code of the company, e.g. DE."),
  category: z.enum(CATEGORY_IDS).describe("One category id. Call list_categories for valid ids."),
  mcp: z.boolean().describe("true = this tool exposes its own MCP server."),
  // DB: listings.pricing_model ist NOT NULL (kein Default, kein Backfill-Trigger) -> Pflichtfeld.
  pricing_model: z.enum(PRICING_MODELS).describe("Pricing model (required): free | freemium | paid | lifetime."),
  // Logo ist Pflicht wie im Web-Formular (submit/new/actions.ts: logo_required).
  logo_url: z.string().url().describe(`Required. ${LOGO_URL_HINT}`),
  ai_usage: z.string().min(AI_USAGE_MIN).max(AI_USAGE_MAX).describe(AI_USAGE_HINT),
  visibility: z
    .enum(["badge", "launch"])
    .describe(
      "How the listing goes live (required). 'badge' = free: embed the Tulimoa badge on the product website, " +
        "reviewed within 7 days; if the badge is missing for 14 days the listing goes offline again. " +
        `'launch' = $${LAUNCH_PRICE_USD} one-time launch package: no badge needed, reviewed first, optional welcome ` +
        "post from @gettulimoa on X, refunded automatically if rejected. Ask the user which one they want.",
    ),
  withdrawal_consent: z
    .boolean()
    .optional()
    .describe(
      "Required (true) for visibility 'launch'. Only set it after the user agrees: Tulimoa starts the review right " +
        `away, the right of withdrawal ends once the listing is live, and a rejected listing gets the $${LAUNCH_PRICE_USD} back automatically.`,
    ),
  pricing_detail: z.string().max(400).optional().describe("Optional price detail, e.g. 'from $10/month'."),
  mcp_server_url: z.string().url().optional().describe("Only if mcp is true: endpoint URL of the MCP server."),
  mcp_docs_url: z.string().url().optional().describe("Only if mcp is true: link to the MCP docs."),
  mcp_auth: z.array(z.enum(MCP_AUTH)).max(2).optional().describe("Only if mcp is true: how agents connect (oauth, api). Empty = no auth."),
  data_region: z.enum(DATA_REGIONS).optional().describe(`Optional. ${DATA_REGION_HINT}`),
  hosting_provider: z.string().max(60).optional().describe("Optional hosting provider and location, e.g. 'Hetzner, Falkenstein'."),
  gdpr_dpa: z.boolean().optional().describe("Optional: a GDPR data processing agreement (DPA) is available."),
  agent_interfaces: z.array(z.enum(AGENT_INTERFACES)).max(4).optional().describe("Optional: other ways agents can use it."),
  model_source: z.enum(MODEL_SOURCES).optional().describe("Optional: which AI models (own, open-weight, provider, mixed, none)."),
  trains_on_customer_data: z.enum(TRAINS_OPTIONS).optional().describe("Optional: trains on customer data (no, opt-out, yes)."),
  certifications: z.array(z.enum(CERTIFICATIONS)).max(3).optional().describe("Optional: soc2, iso27001, hipaa."),
  x_post_opt_in: z
    .boolean()
    .optional()
    .describe("Launch package only: a free welcome post from @gettulimoa on X after approval. Needs launch_hook and at least one X handle."),
  launch_hook: z.string().max(140).optional().describe("Launch package with welcome post: one sentence why the tool matters (max 140 chars, English)."),
  x_handle: z.string().max(40).optional().describe("Optional company X handle, e.g. @acme."),
  founder_x_handles: z.array(z.string().max(40)).max(MAX_FOUNDER_HANDLES).optional().describe("Optional founder X handles (max 4)."),
  tags: z.array(z.string().min(1).max(40)).max(8).optional().describe("Optional descriptive tags (max 8)."),
});

export function registerSubmitListing(server: McpServer, env: Env, ctx: ExecutionContext, user: McpUser | null) {
  server.registerTool(
    "submit_listing",
    {
      title: "Submit an AI or MCP tool to the Tulimoa directory",
      description:
        "Create a new listing in the Tulimoa directory (AI and MCP software with its own website) on behalf of the " +
        "authenticated user. It starts as 'pending' and is reviewed by hand. Required: logo_url (a public image URL, " +
        "e.g. the company's square icon) and ai_usage (how the software uses AI or what agents can do with it). " +
        "Choose how it goes live with `visibility`: 'badge' (free, Tulimoa badge on the website, reviewed within 7 days) " +
        `or 'launch' ($${LAUNCH_PRICE_USD} one-time, no badge, reviewed first, refunded if rejected). For 'launch' ask the ` +
        "user for consent and pass withdrawal_consent: true; the result has a checkout_url the user opens to pay. " +
        "For 'badge' the result has the badge HTML to embed. A website that is already listed cannot be submitted " +
        "again. Use list_categories first to pick a valid category id. Requires a write-scoped Tulimoa login.",
      inputSchema,
      outputSchema: z.object({
        id: z.string().describe("Listing id."),
        slug: z.string().describe("Final slug (may carry a conflict suffix)."),
        status: z.literal("pending"),
        visibility: z.enum(["badge", "launch"]),
        next_step: z.string().describe("What the user has to do now."),
        manage_url: z.string().describe("Dashboard page for status, badge check and payment."),
        checkout_url: z.string().optional().describe("Launch package only: opens the Polar checkout (Tulimoa login needed)."),
        badge_html: z
          .object({ light: z.string(), dark: z.string() })
          .optional()
          .describe("Badge only: HTML for dark backgrounds (light) or light backgrounds (dark)."),
      }),
    },
    async (raw) => {
      if (!user) return fail("Authentication required. Connect with a Tulimoa account (write scope) to submit listings.");
      if (!hasWrite(user)) return fail("This token is read-only. A write-scoped token is required to submit a listing.");

      const args = raw as z.infer<typeof inputSchema>;

      // Regeln wie im Web-Formular (submit/new/actions.ts + lib/listings/launch-fields.ts).
      const aiUsage = cleanAiUsage(args.ai_usage);
      if (aiUsage.length < AI_USAGE_MIN) {
        return fail(`ai_usage is too short: describe the AI use in at least ${AI_USAGE_MIN} characters.`);
      }
      const launch = args.visibility === "launch";
      if (launch && args.withdrawal_consent !== true) {
        return fail(
          "The launch package needs the user's consent first. Ask them: Tulimoa starts the review right away, the right " +
            `of withdrawal ends once the listing is live, and a rejected listing gets the $${LAUNCH_PRICE_USD} back automatically. ` +
            "If they agree, call again with withdrawal_consent: true. Or use visibility 'badge' (free).",
        );
      }
      const xPost = launch && args.x_post_opt_in === true;
      const handles = normalizeHandles(args.x_handle, args.founder_x_handles);
      if (!handles.ok) return fail(handles.error);
      const launchHook = (args.launch_hook ?? "").replace(/\s+/g, " ").trim().slice(0, 140) || null;
      if (xPost && !launchHook) return fail("The welcome post needs launch_hook: one sentence why the tool matters (max 140 chars).");
      if (xPost && !handles.company && handles.founders.length === 0) {
        return fail("The welcome post needs at least one X handle (x_handle or founder_x_handles), or set x_post_opt_in to false.");
      }

      const admin = makeAdmin(env);

      // Duplikat-Schutz wie im Web-Formular: gleiche Website schon live oder in der Queue.
      const listed = await findListedSite(admin, args.url, user.userId);
      if (listed?.state === "own") {
        return fail(
          `You already submitted this website (slug: ${listed.slug}). Use edit_listing to change it, or open ${manageLink(listed.slug)} for status and payment.`,
        );
      }
      if (listed) {
        return fail("This website is already in the Tulimoa directory. If it's your product, email hello@tulimoa.com and we'll transfer the listing to you.");
      }

      // Anti-Spam: max 5 Listings/24h pro Owner (alle Status zaehlen).
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.userId)
        .gte("created_at", since);
      if ((count ?? 0) >= MAX_LISTINGS_PER_DAY) {
        return fail("Rate limit: you can submit at most 5 listings per 24 hours.");
      }

      // Slug mit Konflikt-Suffix.
      const base = slugify(args.name);
      if (!base) return fail("Could not derive a slug from the name.");
      let slug = base;
      for (let i = 2; i < 100; i++) {
        const { data: existing } = await admin.from("listings").select("id").eq("slug", slug).maybeSingle();
        if (!existing) break;
        slug = `${base}-${i}`;
      }

      const logo = await importLogo(env, admin, user.userId, args.logo_url);
      if (!logo.ok) return fail(logo.error);

      const { data: inserted, error } = await admin
        .from("listings")
        .insert({
          owner_id: user.userId,
          slug,
          name: args.name,
          url: args.url,
          short_description: args.short_description,
          country: args.country,
          category: args.category,
          mcp: args.mcp,
          pricing_model: args.pricing_model,
          pricing_detail: args.pricing_detail?.trim() || null,
          logo_url: logo.url,
          tags: args.tags && args.tags.length ? args.tags.slice(0, 8) : [],
          status: "pending",
          ai_usage: aiUsage,
          visibility_choice: args.visibility,
          launch_consent_at: launch ? new Date().toISOString() : null,
          x_post_opt_in: xPost,
          launch_hook: launchHook,
          x_handle: handles.company,
          founder_x_handles: handles.founders,
          data_region: args.data_region ?? null,
          hosting_provider: args.hosting_provider?.trim() || null,
          gdpr_dpa: args.gdpr_dpa === true,
          agent_interfaces: args.agent_interfaces ?? [],
          model_source: args.model_source ?? null,
          trains_on_customer_data: args.trains_on_customer_data ?? null,
          certifications: args.certifications ?? [],
          mcp_server_url: args.mcp ? (args.mcp_server_url ?? null) : null,
          mcp_docs_url: args.mcp ? (args.mcp_docs_url ?? null) : null,
          mcp_auth: args.mcp ? (args.mcp_auth ?? []) : [],
        })
        .select("id,slug")
        .single();

      if (error || !inserted) {
        ctx.waitUntil(removeLogo(admin, logo.path));
        return fail(`Submit failed: ${error?.message ?? "insert_failed"}`);
      }

      // Audit (R5, best-effort). Service-Role -> auth.uid() null -> append_audit erlaubt jede user_id.
      ctx.waitUntil(
        (admin as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> })
          .rpc("append_audit", {
            p_action: "listing_submitted",
            p_detail: { listing_id: inserted.id, slug: inserted.slug, via: user.via },
            p_target_user: user.userId,
          })
          .then(() => undefined)
          .catch(() => undefined),
      );

      // Admin-Benachrichtigung (best-effort): Web-Submits mailen selbst, dieser Pfad deckt
      // Agent-/MCP-Einreichungen ab, damit auch die in der Freigabe-Queue gemeldet werden.
      ctx.waitUntil(
        (async () => {
          let submitterEmail: string | null = null;
          try {
            const { data } = await admin.auth.admin.getUserById(user.userId);
            submitterEmail = data?.user?.email ?? null;
          } catch {
            // egal — dann ohne Absender-Mail benachrichtigen
          }
          await sendSubmissionNotice(env, {
            id: inserted.id,
            slug: inserted.slug,
            name: args.name,
            url: args.url,
            submitterEmail,
          });
        })(),
      );

      const manageUrl = manageLink(inserted.slug);
      if (launch) {
        const checkoutUrl = launchCheckoutLink(inserted.id);
        const nextStep =
          `Pay the $${LAUNCH_PRICE_USD} launch package: open ${checkoutUrl} (Polar checkout; log in to Tulimoa with the same account if asked). ` +
          "Paid listings are reviewed first; if rejected, the payment is refunded automatically.";
        return {
          content: [
            {
              type: "text" as const,
              text: `Listing "${args.name}" submitted (status: pending review, launch package). Slug: ${inserted.slug}.\nNext step: ${nextStep}\nStatus: ${manageUrl}`,
            },
          ],
          structuredContent: {
            id: inserted.id,
            slug: inserted.slug,
            status: "pending",
            visibility: "launch",
            next_step: nextStep,
            manage_url: manageUrl,
            checkout_url: checkoutUrl,
          },
        };
      }
      const light = badgeSnippet(inserted.slug, "light");
      const dark = badgeSnippet(inserted.slug, "dark");
      const nextStep =
        `Embed the Tulimoa badge on ${args.url} (badge_html: 'light' for dark backgrounds, 'dark' for light ones). ` +
        `We review within 7 days; the listing goes live once approved and the badge is found. Check the badge anytime at ${manageUrl}.`;
      return {
        content: [
          {
            type: "text" as const,
            text: `Listing "${args.name}" submitted (status: pending review, free with badge). Slug: ${inserted.slug}.\nNext step: ${nextStep}\n\nBadge for light backgrounds:\n${dark}`,
          },
        ],
        structuredContent: {
          id: inserted.id,
          slug: inserted.slug,
          status: "pending",
          visibility: "badge",
          next_step: nextStep,
          manage_url: manageUrl,
          badge_html: { light, dark },
        },
      };
    },
  );
}
