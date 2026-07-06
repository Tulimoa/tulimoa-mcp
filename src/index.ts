import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env, McpUser } from "./types";
import { registerAllTools } from "./tools";
import { resolveMcpUser } from "./auth";

const AUTH_ORIGIN = "https://auth.tulimoa.com";
const MCP_RESOURCE = "https://mcp.tulimoa.com/mcp";

// Pro Request frischer McpServer (SDK-Regel ab 1.26: kein Server-Reuse). user ist die schon
// aufgeloeste Schreib-Identitaet (oder null = anonym); Reads ignorieren sie.
function createServer(env: Env, ctx: ExecutionContext, user: McpUser | null): McpServer {
  const server = new McpServer({ name: "tulimoa", version: "1.1.0" });
  registerAllTools(server, env, ctx, user);
  return server;
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
  "Access-Control-Max-Age": "86400",
};

const corsOptions = {
  origin: "*",
  methods: "GET,POST,OPTIONS",
  headers: "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
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
    const user = await resolveMcpUser(env, request);
    const server = createServer(env, ctx, user);
    return createMcpHandler(server, { route: "/mcp", corsOptions })(request, env, ctx);
  },
};
