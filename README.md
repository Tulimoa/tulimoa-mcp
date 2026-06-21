# Tulimoa MCP Server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI agents discover curated SaaS and AI-agent tools from the [Tulimoa](https://tulimoa.com) directory.

- **Endpoint:** `https://mcp.tulimoa.com/mcp`
- **Transport:** Streamable HTTP
- **Auth:** none (read-only, public data)

## Tools

| Tool | What it does |
| --- | --- |
| `search_listings` | Find tools by free-text `query`, `category`, `pricing_model` (free / freemium / paid / lifetime), `mcp` (tool has its own MCP server), `eu_only`, `sort` (new / popular / viewed), `limit`. Returns approved, published listings. |
| `get_listing` | Full detail for one tool by its `slug`. |
| `list_categories` | The category ids and labels used by `search_listings`. |

## Connect

**Claude Code**
```bash
claude mcp add --transport http tulimoa https://mcp.tulimoa.com/mcp
```

**OpenClaw**
```bash
openclaw mcp add tulimoa --url https://mcp.tulimoa.com/mcp --transport streamable-http
```

**Generic MCP client (`mcp.json`)**
```json
{
  "servers": {
    "tulimoa": { "type": "http", "url": "https://mcp.tulimoa.com/mcp" }
  }
}
```

## How it works

A single [Cloudflare Worker](https://workers.cloudflare.com) built on the `agents` SDK `createMcpHandler` (stateless Streamable HTTP, no Durable Objects). It reads the public Tulimoa catalog from Supabase with the anon key, gated by RLS to approved and published listings. Authless by design, since the data is public and read-only. Hardened with per-colo rate limits and edge caching to protect the backend.

## Develop

```bash
pnpm install
pnpm dev         # wrangler dev (local)
pnpm typecheck   # tsc --noEmit
pnpm deploy      # wrangler deploy
```

The `clawhub-skill/` folder contains the [ClawHub](https://docs.openclaw.ai/clawhub) skill that wraps this server for OpenClaw discovery.

## License

[MIT](./LICENSE)
