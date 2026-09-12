import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { makeAdmin } from "../supabase";
import { hasWrite } from "../auth";
import type { Env, McpUser } from "../types";
import { CATEGORY_IDS, PRICING_MODELS } from "../constants";
import { LOGO_URL_HINT, importLogo, removeLogo } from "./logo";

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

      const a = raw as {
        slug?: string;
        name?: string;
        url?: string;
        short_description?: string;
        category?: string;
        mcp?: boolean;
        pricing_model?: string;
        tags?: string[];
        logo_url?: string;
      };
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
