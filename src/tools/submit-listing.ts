import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { makeAdmin } from "../supabase";
import { hasWrite } from "../auth";
import { sendSubmissionNotice } from "../email";
import type { Env, McpUser } from "../types";
import { CATEGORY_IDS, PRICING_MODELS } from "../constants";

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
  tags: z.array(z.string().min(1).max(40)).max(8).optional().describe("Optional descriptive tags (max 8)."),
});

export function registerSubmitListing(server: McpServer, env: Env, ctx: ExecutionContext, user: McpUser | null) {
  server.registerTool(
    "submit_listing",
    {
      title: "Submit a SaaS listing to the Tulimoa directory",
      description:
        "Create a new listing in the Tulimoa directory on behalf of the authenticated user. " +
        "The listing is created with status 'pending' and appears publicly only after admin review. " +
        "Requires a write-scoped Tulimoa login. Use list_categories first to pick a valid category id.",
      inputSchema,
      outputSchema: z.object({
        id: z.string().describe("Listing id."),
        slug: z.string().describe("Final slug (may carry a conflict suffix)."),
        status: z.literal("pending"),
      }),
    },
    async (raw) => {
      if (!user) return fail("Authentication required. Connect with a Tulimoa account (write scope) to submit listings.");
      if (!hasWrite(user)) return fail("This token is read-only. A write-scoped token is required to submit a listing.");

      const args = raw as {
        name: string;
        url: string;
        short_description: string;
        country: string;
        category: string;
        mcp: boolean;
        pricing_model: "free" | "freemium" | "paid" | "lifetime";
        tags?: string[];
      };

      const admin = makeAdmin(env);

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
          tags: args.tags && args.tags.length ? args.tags.slice(0, 8) : [],
          status: "pending",
        })
        .select("id,slug")
        .single();

      if (error || !inserted) return fail(`Submit failed: ${error?.message ?? "insert_failed"}`);

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

      return {
        content: [
          {
            type: "text" as const,
            text: `Listing "${args.name}" submitted (status: pending review). Slug: ${inserted.slug}. It appears publicly after admin approval.`,
          },
        ],
        structuredContent: { id: inserted.id, slug: inserted.slug, status: "pending" },
      };
    },
  );
}
