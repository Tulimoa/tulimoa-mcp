import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { makeAdmin } from "../supabase";
import { hasWrite } from "../auth";
import type { Env, McpUser } from "../types";
import { CATEGORY_IDS, PRICING_MODELS } from "../constants";

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
});

export function registerEditListing(server: McpServer, env: Env, _ctx: ExecutionContext, user: McpUser | null) {
  server.registerTool(
    "edit_listing",
    {
      title: "Edit one of your own Tulimoa listings",
      description:
        "Update fields of a listing you own (by slug). You cannot change ownership or set review status. " +
        "Any edit sends the listing back to admin review (status: pending) and it reappears publicly only after re-approval. " +
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
      if (Object.keys(patch).length === 0) return fail("Nothing to update: provide at least one field.");
      // Re-Moderation: jede inhaltliche Aenderung nimmt das Listing offline und schickt es zurueck in
      // die Queue. Sonst koennte ein bereits freigegebenes+veroeffentlichtes Listing beliebige neue
      // Inhalte (z.B. Spam-URL) sofort oeffentlich ausspielen, ohne erneute Pruefung.
      patch.status = "pending";
      patch.published_at = null;
      patch.approved_at = null;
      patch.updated_at = new Date().toISOString();

      const admin = makeAdmin(env);
      const { data, error } = await admin
        .from("listings")
        .update(patch)
        .eq("slug", slug)
        .eq("owner_id", user.userId) // Isolation: nur eigene Zeile
        .select("id,slug")
        .maybeSingle();

      if (error) return fail(`Edit failed: ${error.message}`);
      if (!data) return fail("No listing with that slug is owned by you.");

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
