import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env } from "./types";
import { registerAllTools } from "./tools";

// Pro Request frischer McpServer (SDK-Regel ab 1.26: kein Server-Reuse).
function createServer(env: Env, ctx: ExecutionContext): McpServer {
  const server = new McpServer({ name: "tulimoa", version: "0.1.0" });
  registerAllTools(server, env, ctx);
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

    // Per-IP-Rate-Limit am MCP-Endpoint. Kein Auth nötig: Key = Client-IP.
    if (request.method === "POST" && url.pathname === "/mcp") {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.RL_IP.limit({ key: ip });
      if (!success) return tooManyRequests();
    }

    const server = createServer(env, ctx);
    return createMcpHandler(server, { route: "/mcp", corsOptions })(request, env, ctx);
  },
};
