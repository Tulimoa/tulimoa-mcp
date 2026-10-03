import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { makeSupabase } from "../supabase";
import type { Env } from "../types";
import { cacheGet, cacheKeyFor, cachePut } from "../cache";

// Vollere Projektion fürs Detail (ohne interne/Badge-Felder).
const DETAIL_SELECT = [
  "slug",
  "name",
  "short_description",
  "long_description",
  "category",
  "mcp",
  "country",
  "pricing_model",
  "pricing_detail",
  "url",
  "demo_url",
  "docs_url",
  "features",
  "use_cases",
  "integrations",
  "ideal_for",
  "not_for",
  "founded_year",
  "team_size",
  "logo_url",
  "view_count",
  // Launch-Umbau 2026-10-03: KI-Einsatz und Datenpunkte (öffentlich auf der Listing-Seite).
  "ai_usage",
  "data_region",
  "eu_hosted",
  "hosting_provider",
  "gdpr_dpa",
  "agent_interfaces",
  "model_source",
  "trains_on_customer_data",
  "certifications",
].join(",");

const NOT_FOUND = "No published listing found";

export function registerGetListing(server: McpServer, env: Env, ctx: ExecutionContext) {
  server.registerTool(
    "get_listing",
    {
      title: "Get one SaaS listing",
      description:
        "Fetch full detail of a single Tulimoa listing by its slug: long description, how it uses AI " +
        "(ai_usage), features, use cases, integrations, pricing detail, data region and EU hosting, " +
        "model source, certifications, and links. Use after search_listings when the user wants depth " +
        "on a specific tool.",
      inputSchema: z.object({
        slug: z.string().min(1).max(120).describe("The listing's URL slug, e.g. 'acme-crm'."),
      }),
      outputSchema: z.object({
        listing: z
          .looseObject({ slug: z.string(), name: z.string() })
          .describe("Full listing row (detail projection, see DETAIL_SELECT)."),
      }),
    },
    async ({ slug }) => {
      const key = cacheKeyFor("listing", { slug });

      const cached = (await cacheGet(key)) as Record<string, unknown> | null;
      if (cached) {
        // Negativ-Treffer werden kurz gecacht (Anti-Enumeration): __notfound-Sentinel.
        if (cached.__notfound) {
          return {
            content: [{ type: "text" as const, text: `${NOT_FOUND} for slug '${slug}'.` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: `${cached.name}: ${cached.short_description}\n${cached.url}` }],
          structuredContent: { listing: cached },
        };
      }

      // Globaler (per-colo) DB-Cap: nur auf dem Cache-Miss-Pfad.
      const { success } = await env.RL_DB.limit({ key: "db" });
      if (!success) {
        return {
          content: [{ type: "text" as const, text: "Service is busy right now, please retry in a moment." }],
          isError: true,
        };
      }

      const { data, error } = await makeSupabase(env)
        .from("listings")
        .select(DETAIL_SELECT)
        .eq("status", "approved")
        .not("published_at", "is", null)
        .eq("slug", slug)
        .maybeSingle();

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Lookup failed: ${error.message}` }],
          isError: true,
        };
      }
      if (!data) {
        cachePut(ctx, key, { __notfound: true }, 60);
        return {
          content: [{ type: "text" as const, text: `${NOT_FOUND} for slug '${slug}'.` }],
          isError: true,
        };
      }

      const listing = data as unknown as Record<string, unknown>;
      cachePut(ctx, key, listing, 600);
      return {
        content: [
          {
            type: "text" as const,
            text: `${listing.name}: ${listing.short_description}\n${listing.url}`,
          },
        ],
        structuredContent: { listing },
      };
    },
  );
}
