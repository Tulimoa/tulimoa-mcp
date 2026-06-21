import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makeSupabase, type SupabaseClient } from "../supabase";
import type { Env } from "../types";
import { CATEGORY_IDS, EU_COUNTRY_CODES } from "../constants";
import { cacheGet, cacheKeyFor, cachePut } from "../cache";

const inputSchema = {
  query: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe("Free-text terms matched against the listing name and short description."),
  category: z
    .enum(CATEGORY_IDS)
    .optional()
    .describe("Restrict to one category id. Call list_categories for valid ids."),
  pricing_model: z
    .enum(["free", "freemium", "paid", "lifetime"])
    .optional()
    .describe("Restrict to a pricing model."),
  mcp: z.boolean().optional().describe("true = only tools that expose their own MCP server."),
  eu_only: z
    .boolean()
    .optional()
    .describe("true = only tools whose company country is in the EU."),
  sort: z
    .enum(["new", "popular", "viewed"])
    .optional()
    .describe("Result order. Default: popular."),
  limit: z.number().int().min(1).max(50).optional().describe("Max results (1-50, default 20)."),
};

type SearchArgs = {
  query?: string;
  category?: string;
  pricing_model?: "free" | "freemium" | "paid" | "lifetime";
  mcp?: boolean;
  eu_only?: boolean;
  sort?: "new" | "popular" | "viewed";
  limit?: number;
};

// Lean projection: nur was der Agent zum Entscheiden + Verlinken braucht.
const SELECT = "slug,name,short_description,category,mcp,country,pricing_model,url";

function buildQuery(supabase: SupabaseClient, args: SearchArgs) {
  // Kanonisches Public-Visibility-Gate (wie /discover). RLS ist der Backstop.
  let q = supabase
    .from("listings")
    .select(SELECT)
    .eq("status", "approved")
    .not("published_at", "is", null);

  if (args.category) q = q.eq("category", args.category);
  if (args.pricing_model) q = q.eq("pricing_model", args.pricing_model);
  if (typeof args.mcp === "boolean") q = q.eq("mcp", args.mcp);
  if (args.eu_only) q = q.in("country", EU_COUNTRY_CODES);
  if (args.query) {
    // PostgREST or-Filter ist komma-/klammer-delimited → Metazeichen entfernen.
    const term = args.query.replace(/[%,()]/g, " ").trim();
    if (term) q = q.or(`name.ilike.%${term}%,short_description.ilike.%${term}%`);
  }

  const lim = Math.min(args.limit ?? 20, 50);

  // 3-Tier-Sort identisch zu /discover, je nach sort umgeschaltet.
  switch (args.sort ?? "popular") {
    case "new":
      return q.order("created_at", { ascending: false }).limit(lim);
    case "viewed":
      return q
        .order("view_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(lim);
    default: // popular
      return q
        .order("badge_verified_since", { ascending: true, nullsFirst: false })
        .order("view_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(lim);
  }
}

export function registerSearchListings(server: McpServer, env: Env, ctx: ExecutionContext) {
  server.registerTool(
    "search_listings",
    {
      title: "Search SaaS listings",
      description:
        "Find SaaS tools in the Tulimoa directory that an AI agent or team can plug into. " +
        "Discover tools by topic, category, pricing, MCP support, or EU hosting. Returns only " +
        "approved, published listings. Use this for any 'find/recommend a tool for X' request, " +
        "then call get_listing for full detail on a specific result.",
      inputSchema,
    },
    async (args) => {
      const a = args as SearchArgs;
      const key = cacheKeyFor("search", {
        query: a.query,
        category: a.category,
        pricing_model: a.pricing_model,
        mcp: a.mcp,
        eu_only: a.eu_only,
        sort: a.sort ?? "popular",
        limit: Math.min(a.limit ?? 20, 50),
      });

      let results = (await cacheGet(key)) as Array<Record<string, unknown>> | null;
      if (!results) {
        // Globaler (per-colo) DB-Cap: nur auf dem Cache-Miss-Pfad, schützt Supabase.
        const { success } = await env.RL_DB.limit({ key: "db" });
        if (!success) {
          return {
            content: [{ type: "text" as const, text: "Service is busy right now, please retry in a moment." }],
            isError: true,
          };
        }
        const { data, error } = await buildQuery(makeSupabase(env), a);
        if (error) {
          return {
            content: [{ type: "text" as const, text: `Search failed: ${error.message}` }],
            isError: true,
          };
        }
        results = (data ?? []) as Array<Record<string, unknown>>;
        cachePut(ctx, key, results, 300);
      }

      const lines = results
        .map(
          (r) =>
            `- ${r.name} (${r.category}, ${r.pricing_model ?? "n/a"}${r.mcp ? ", MCP" : ""}) — ${r.url}  [slug: ${r.slug}]`,
        )
        .join("\n");
      return {
        content: [
          {
            type: "text" as const,
            text: results.length ? `${results.length} listing(s):\n${lines}` : "No matching listings found.",
          },
        ],
        structuredContent: { count: results.length, results },
      };
    },
  );
}
