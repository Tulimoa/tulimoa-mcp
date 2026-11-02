import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { makeAdmin } from "../supabase";
import { hasWrite } from "../auth";
import { sendSubmissionNotice, sendSubmitterConfirmation } from "../email";
import { anyProfanity } from "../moderation";
import type { Env, McpUser } from "../types";
import { CATEGORY_IDS, COUNTRY_CODES, PRICING_MODELS } from "../constants";
import { LOGO_URL_HINT, importGallery, importLogo, removeGallery, removeLogo } from "./logo";
import { fetchAndDetectBadge } from "./badge";
import { blockTexts, detailsShape, httpUrl, normalizeContentBlocks } from "./fields";
import { isStaffOrAgency, loadProfile, quotaReached, LISTING_LIMIT } from "./review";
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
  normalizeXHandle,
} from "./launch";

// Regeln 1:1 wie das Web-Formular (Tulimoa/src/app/(landing)/submit/new/actions.ts +
// lib/listings/launch-fields.ts). Bei Aenderungen dort hier nachziehen. Die Regeln fuer Menschen stehen
// auf https://tulimoa.com/submit/guidelines.

const MAX_LISTINGS_PER_DAY = 5;
const GUIDELINES_URL = "https://tulimoa.com/submit/guidelines";

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
  name: z.string().min(1).max(60).describe("Product name (max 60 chars)."),
  url: httpUrl().describe("The product's own website (http or https). A marketplace page or an app-store-only app is not accepted."),
  short_description: z.string().min(1).max(300).describe("One-line pitch (max 300 chars), ideally in English."),
  country: z.enum(COUNTRY_CODES).describe("ISO-3166-1 alpha-2 code of the company's HQ, e.g. DE. Same list as the web form."),
  category: z.enum(CATEGORY_IDS).describe("One category id. Call list_categories for valid ids."),
  mcp: z.boolean().describe("true = this tool exposes its own MCP server."),
  pricing_model: z.enum(PRICING_MODELS).describe("Pricing model (required): free | freemium | paid | lifetime."),
  logo_url: httpUrl().describe(`Required. ${LOGO_URL_HINT}`),
  ai_usage: z.string().min(AI_USAGE_MIN).max(AI_USAGE_MAX).describe(AI_USAGE_HINT),
  visibility: z
    .enum(["badge", "launch"])
    .describe(
      "How the listing goes live (required). 'badge' = free: the Tulimoa badge must ALREADY be embedded on the product " +
        "website; this tool checks the page and refuses the badge route without it (the error returns the badge HTML to embed). " +
        "Reviewed within 7 days. If the badge is missing for 7 days later on, the listing is deleted unless the badge is back or " +
        `the launch package is booked. 'launch' = $${LAUNCH_PRICE_USD} one-time launch package: no badge needed, reviewed first, ` +
        "optional welcome post on X, refunded automatically if rejected. Ask the user which one they want.",
    ),
  withdrawal_consent: z
    .boolean()
    .optional()
    .describe(
      "Required (true) for visibility 'launch'. Only set it after the user agrees: Tulimoa starts the review right " +
        `away, the right of withdrawal ends once the listing is live, and a rejected listing gets the $${LAUNCH_PRICE_USD} back automatically.`,
    ),
  pricing_detail: z.string().max(400).optional().describe("Optional price detail, e.g. 'from $10/month'."),
  mcp_server_url: httpUrl().optional().describe("Only if mcp is true: endpoint URL of the MCP server (e.g. .../mcp)."),
  mcp_docs_url: httpUrl().optional().describe("Only if mcp is true: link to the MCP docs."),
  mcp_auth: z.array(z.enum(MCP_AUTH)).max(2).optional().describe("Only if mcp is true: how agents connect (oauth, api). Empty = no auth."),
  data_region: z.enum(DATA_REGIONS).optional().describe(`Optional. ${DATA_REGION_HINT}`),
  hosting_provider: z.string().max(60).optional().describe("Optional hosting provider and location, e.g. 'Hetzner, Falkenstein'."),
  gdpr_dpa: z.boolean().optional().describe("Optional: a GDPR data processing agreement (DPA) is available."),
  agent_interfaces: z.array(z.enum(AGENT_INTERFACES)).max(4).optional().describe("Optional: other ways agents can use it (api, cli, sdk, webhooks)."),
  model_source: z.enum(MODEL_SOURCES).optional().describe("Optional: which AI models (own, open-weight, provider, mixed, none)."),
  trains_on_customer_data: z.enum(TRAINS_OPTIONS).optional().describe("Optional: trains on customer data (no, opt-out, yes)."),
  certifications: z.array(z.enum(CERTIFICATIONS)).max(3).optional().describe("Optional: soc2, iso27001, hipaa."),
  x_post_opt_in: z
    .boolean()
    .optional()
    .describe("Launch package only: a free welcome post on X after approval. Needs launch_hook and at least one X handle."),
  launch_hook: z.string().max(140).optional().describe("Launch package with welcome post: one sentence why the tool matters (max 140 chars, English)."),
  x_handle: z.string().max(40).optional().describe("Optional company X handle, e.g. @acme."),
  founder_x_handles: z.array(z.string().max(40)).max(MAX_FOUNDER_HANDLES).optional().describe("Optional founder X handles (max 4)."),
  ...detailsShape,
  test_request: z
    .boolean()
    .optional()
    .describe(
      "Optional: ask Florian to test the tool by hand (about an hour with a real account; result goes on the listing, on X and " +
        "into the weekly Radar, including what is missing). Free for now, no right to a test or a date.",
    ),
  test_x_handle: z.string().max(40).optional().describe("Test request only: the submitter's X handle, to tag them and ask questions."),
  test_note: z.string().max(600).optional().describe("Test request only: what the tester should look at."),
  test_access: z.string().max(300).optional().describe("Test request only: a trial link or promo code; the test says so if access was given."),
});

type Args = z.infer<typeof inputSchema>;

export function registerSubmitListing(server: McpServer, env: Env, ctx: ExecutionContext, user: McpUser | null) {
  server.registerTool(
    "submit_listing",
    {
      title: "Submit an AI or MCP tool to the Tulimoa directory",
      description:
        "Create a new listing in the Tulimoa directory on behalf of the authenticated user, with the same fields and rules " +
        `as the web form (${GUIDELINES_URL}): AI or MCP software with its own website, the user's own product, at most ` +
        `${LISTING_LIMIT} active listings per account. It starts as 'pending' and is reviewed by hand. Required: logo_url and ` +
        "ai_usage (how the software uses AI or what agents can do with it). Choose how it goes live with `visibility`: 'badge' " +
        "(free; the Tulimoa badge must already be on the website, this tool checks it) or " +
        `'launch' ($${LAUNCH_PRICE_USD} one-time, no badge, reviewed first, refunded if rejected). For 'launch' ask the user for ` +
        "consent and pass withdrawal_consent: true; the result has a checkout_url the user opens to pay. Optional fields match " +
        "the form: gallery, content blocks, founding year, team size, demo and docs links, data points, X handles and a test " +
        "request. A website that is already listed cannot be submitted again. Use list_categories first to pick a valid " +
        "category id. Requires a write-scoped Tulimoa login.",
      inputSchema,
      outputSchema: z.object({
        id: z.string().describe("Listing id."),
        slug: z.string().describe("Final slug (may carry a conflict suffix)."),
        status: z.literal("pending"),
        visibility: z.enum(["badge", "launch"]),
        badge_verified: z.boolean().describe("true = the Tulimoa badge was found on the website."),
        test_requested: z.boolean().describe("true = a hand test was requested."),
        next_step: z.string().describe("What the user has to do now."),
        manage_url: z.string().describe("Dashboard page for status, badge check and payment."),
        checkout_url: z.string().optional().describe("Launch package only: opens the Polar checkout (Tulimoa login needed)."),
        badge_html: z
          .object({ light: z.string(), dark: z.string() })
          .optional()
          .describe("Badge route only: the badge HTML (light = for dark backgrounds, dark = for light backgrounds). Keep it on the site."),
      }),
    },
    async (raw) => {
      if (!user) return fail("Authentication required. Connect with a Tulimoa account (write scope) to submit listings.");
      if (!hasWrite(user)) return fail("This token is read-only. A write-scoped token is required to submit a listing.");

      const args = raw as Args;

      // ── Felder wie im Formular ──────────────────────────────────────────
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

      const contentBlocks = args.content_blocks ? normalizeContentBlocks(args.content_blocks) : null;
      const pricingDetail = args.pricing_detail?.trim() || null;
      const hostingProvider = args.hosting_provider?.trim() || null;
      const notableCustomers = args.notable_customers?.trim().slice(0, 200) || null;
      if (
        anyProfanity([
          args.name,
          args.short_description,
          pricingDetail,
          notableCustomers,
          launchHook,
          hostingProvider,
          aiUsage,
          ...blockTexts(contentBlocks),
        ])
      ) {
        return fail("The submission contains words we don't allow. Please rephrase it.");
      }

      const admin = makeAdmin(env);
      const profile = await loadProfile(admin, user.userId);

      // ── Kontingent, Tageslimit, Duplikat ────────────────────────────────
      if (await quotaReached(admin, user.userId, profile)) {
        return fail(
          `This account already has ${LISTING_LIMIT} active listings (in review or live), the limit per account. Existing ` +
            "listings stay as they are. To list more tools, apply as a partner agency: https://tulimoa.com/for-agencies",
        );
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.userId)
        .gte("created_at", since);
      if ((count ?? 0) >= MAX_LISTINGS_PER_DAY) {
        return fail("Rate limit: you can submit at most 5 listings per 24 hours.");
      }

      const listed = await findListedSite(admin, args.url, user.userId);
      if (listed?.state === "own") {
        return fail(
          `You already submitted this website (slug: ${listed.slug}). Use edit_listing to change it, or open ${manageLink(listed.slug)} for status and payment.`,
        );
      }
      if (listed) {
        return fail("This website is already in the Tulimoa directory. If it's your product, email hello@tulimoa.com and we'll transfer the listing to you.");
      }

      // Slug mit Konflikt-Suffix (vor dem Badge-Check, damit der Badge-Code auf die richtige Seite zeigt).
      const base = slugify(args.name);
      if (!base) return fail("Could not derive a slug from the name.");
      let slug = base;
      for (let i = 2; i < 100; i++) {
        const { data: existing } = await admin.from("listings").select("id").eq("slug", slug).maybeSingle();
        if (!existing) break;
        slug = `${base}-${i}`;
      }

      // ── Badge: auf dem kostenlosen Weg VOR dem Absenden Pflicht (wie im Formular seit 2026-10-15) ──
      const badgeRequired = !launch && !isStaffOrAgency(profile);
      let badgeVerified = false;
      if (badgeRequired) {
        const badge = await fetchAndDetectBadge(args.url);
        if (badge.error) {
          return fail(
            `Could not reach ${args.url} to check the Tulimoa badge (${badge.error}). Try again in a moment, or use visibility 'launch'.`,
          );
        }
        if (!badge.present) {
          const why =
            badge.reason === "too_small"
              ? "The badge was found but is too small: it must be at least 100 px wide and visible."
              : "The Tulimoa badge was not found on the website.";
          return fail(
            `${why} On the free route the badge has to be on ${args.url} before you submit. Embed one of these ` +
              "snippets on that page, then call submit_listing again with the same arguments. Or use visibility 'launch' " +
              `($${LAUNCH_PRICE_USD} one-time, no badge).\n\nFor light backgrounds:\n${badgeSnippet(slug, "dark")}\n\n` +
              `For dark backgrounds:\n${badgeSnippet(slug, "light")}`,
          );
        }
        badgeVerified = true;
      } else if (!launch) {
        // Admins, Kuratoren, Agenturen: kein Zwang, Flag nur wenn der Badge wirklich da ist.
        badgeVerified = (await fetchAndDetectBadge(args.url)).present === true;
      }

      // ── Bilder ──────────────────────────────────────────────────────────
      const logo = await importLogo(env, admin, user.userId, args.logo_url);
      if (!logo.ok) return fail(logo.error);
      let galleryUrls: string[] = [];
      let galleryCaptions: string[] = [];
      let galleryPaths: string[] = [];
      if (args.gallery_urls && args.gallery_urls.length > 0) {
        const gallery = await importGallery(env, admin, user.userId, args.gallery_urls, args.gallery_captions);
        if (!gallery.ok) {
          ctx.waitUntil(removeLogo(admin, logo.path));
          return fail(gallery.error);
        }
        galleryUrls = gallery.urls;
        galleryCaptions = gallery.captions;
        galleryPaths = gallery.paths;
      }

      const now = new Date().toISOString();
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
          pricing_detail: pricingDetail,
          logo_url: logo.url,
          hero_url: galleryUrls[0] ?? null,
          gallery_urls: galleryUrls.length > 0 ? galleryUrls : null,
          gallery_captions: galleryCaptions.some((c) => c) ? galleryCaptions : null,
          content_blocks: contentBlocks,
          founded_year: args.founded_year ?? null,
          team_size: args.team_size ?? null,
          demo_url: args.demo_url ?? null,
          docs_url: args.docs_url ?? null,
          open_source: args.open_source === true,
          notable_customers: notableCustomers,
          tags: [],
          status: "pending",
          submitted_via: "mcp",
          badge_verified: badgeVerified,
          badge_verified_at: badgeVerified ? now : null,
          ai_usage: aiUsage,
          visibility_choice: args.visibility,
          launch_consent_at: launch ? now : null,
          x_post_opt_in: xPost,
          launch_hook: launchHook,
          x_handle: handles.company,
          founder_x_handles: handles.founders,
          data_region: args.data_region ?? null,
          hosting_provider: hostingProvider,
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
        ctx.waitUntil(removeGallery(admin, galleryPaths));
        if (error?.message?.includes("listing_limit")) {
          return fail(`This account already has ${LISTING_LIMIT} active listings, the limit per account. Agencies: https://tulimoa.com/for-agencies`);
        }
        return fail(`Submit failed: ${error?.message ?? "insert_failed"}`);
      }

      // Testwunsch wie im Formular (Tabelle listing_test_requests). Best effort, ungueltiges Handle faellt weg.
      const wantsTest = args.test_request === true;
      if (wantsTest) {
        const testHandle = normalizeXHandle(args.test_x_handle ?? "") || null;
        const { error: testErr } = await (admin as unknown as { from: (t: string) => any })
          .from("listing_test_requests")
          .insert({
            listing_id: inserted.id,
            requested_by: user.userId,
            x_handle: testHandle,
            note: args.test_note?.trim().slice(0, 600) || null,
            access: args.test_access?.trim().slice(0, 300) || null,
          });
        if (testErr) console.error("[submit_listing] test request failed:", testErr.message ?? testErr);
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

      // Mails (best-effort): Admin-Hinweis + Eingangsbestaetigung an den Einreicher wie im Web.
      ctx.waitUntil(
        (async () => {
          let submitterEmail: string | null = null;
          try {
            const { data } = await admin.auth.admin.getUserById(user.userId);
            submitterEmail = data?.user?.email ?? null;
          } catch {
            submitterEmail = profile.email;
          }
          await sendSubmissionNotice(env, {
            id: inserted.id,
            slug: inserted.slug,
            name: args.name,
            url: args.url,
            submitterEmail,
            visibility: args.visibility,
            testRequested: wantsTest,
          });
          if (submitterEmail) await sendSubmitterConfirmation(env, submitterEmail, args.name, profile.language);
        })(),
      );

      const manageUrl = manageLink(inserted.slug);
      const common = {
        id: inserted.id,
        slug: inserted.slug,
        status: "pending" as const,
        badge_verified: badgeVerified,
        test_requested: wantsTest,
        manage_url: manageUrl,
      };
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
          structuredContent: { ...common, visibility: "launch" as const, next_step: nextStep, checkout_url: checkoutUrl },
        };
      }
      const light = badgeSnippet(inserted.slug, "light");
      const dark = badgeSnippet(inserted.slug, "dark");
      const nextStep = badgeVerified
        ? "Nothing to do: the badge was found. We review within 7 days and email the result. Keep the badge on the website; " +
          "if it is missing for 7 days, the listing is deleted unless the badge is back or the launch package is booked."
        : `Embed the Tulimoa badge on ${args.url} (badge_html). We review within 7 days. Check the badge anytime at ${manageUrl}.`;
      return {
        content: [
          {
            type: "text" as const,
            text: `Listing "${args.name}" submitted (status: pending review, free with badge${badgeVerified ? ", badge found" : ""}). Slug: ${inserted.slug}.\nNext step: ${nextStep}\nStatus: ${manageUrl}`,
          },
        ],
        structuredContent: { ...common, visibility: "badge" as const, next_step: nextStep, badge_html: { light, dark } },
      };
    },
  );
}
