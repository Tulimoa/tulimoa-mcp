import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import type { Env, McpUser } from "./types";
import { registerAllTools } from "./tools";
import { resolveMcpUser } from "./auth";

const AUTH_ORIGIN = "https://auth.tulimoa.com";
const MCP_RESOURCE = "https://mcp.tulimoa.com/mcp";

// SEP-2549: Katalog + discover sind fuer alle identisch (Write-Gating passiert erst beim Call),
// deshalb public/1h. Der Katalog aendert sich nur mit einem Deploy.
const CATALOG_CACHE = { ttlMs: 3_600_000, cacheScope: "public" as const };

// Pro Request frischer McpServer (Factory-Modell des v2-Handlers; gleiche Regel wie SDK 1.26+:
// kein Server-Reuse). user ist die schon aufgeloeste Schreib-Identitaet (oder null = anonym).
function createServer(env: Env, ctx: ExecutionContext, user: McpUser | null): McpServer {
  const server = new McpServer(
    { name: "tulimoa", version: "1.2.0" },
    { cacheHints: { "tools/list": CATALOG_CACHE, "server/discover": CATALOG_CACHE } },
  );
  registerAllTools(server, env, ctx, user);
  return server;
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Authorization",
  "Access-Control-Max-Age": "86400",
};

const corsOptions = {
  origin: "*",
  methods: "GET,POST,OPTIONS",
  headers: "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Authorization",
  maxAge: 86400,
};

function tooManyRequests(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "Rate limit exceeded. Please slow down." },
    }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } },
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    // RFC 9728: Protected-Resource-Metadata. OAuth-faehige Clients entdecken so den AS
    // (auth.tulimoa.com). Reads bleiben authless; nur Write-Tools verlangen einen Token.
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      return new Response(
        JSON.stringify({
          resource: MCP_RESOURCE, // R1: byte-gleich zur oauth_tokens.audience + dem auth.ts-Check
          authorization_servers: [AUTH_ORIGIN],
          bearer_methods_supported: ["header"],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Per-IP-Rate-Limit am MCP-Endpoint. Kein Auth nötig: Key = Client-IP.
    if (request.method === "POST" && url.pathname === "/mcp") {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.RL_IP.limit({ key: ip });
      if (!success) return tooManyRequests();
    }

    // Schreib-Identitaet aufloesen (interner Gateway-Header ODER direkter OAuth-Bearer). Anonyme
    // Reads haben keine dieser Header -> user=null, kein DB-Hit. Pro Request frisch.
    // Dual-Era (Default legacy:'stateless'): moderne 2026-07-28-Requests UND alte initialize-
    // Clients laufen ueber denselben Handler; die Factory closed env/ctx/user pro Request ein.
    const user = await resolveMcpUser(env, request);
    const handler = createMcpHandler(() => createServer(env, ctx, user), {
      route: "/mcp",
      corsOptions,
      allowedOriginHostnames: "*", // oeffentlicher, authless-read MCP-Endpoint; CORS bleibt Wildcard wie bisher
    });
    return handler(request, env, ctx);
  },
};
