# Tulimoa MCP Server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI agents discover curated SaaS and AI-agent tools from the [Tulimoa](https://tulimoa.com) directory.

- **Endpoint:** `https://mcp.tulimoa.com/mcp`
- **Transport:** Streamable HTTP
- **Auth:** none for the read tools (public data). The write tools (`submit_listing`, `edit_listing`) require an OAuth login via `auth.tulimoa.com` and a `write`-scoped token bound to your Tulimoa account.

## Tools

| Tool | Auth | What it does |
| --- | --- | --- |
| `search_listings` | none | Find tools by free-text `query`, `category`, `pricing_model` (free / freemium / paid / lifetime), `mcp` (tool has its own MCP server), `eu_only`, `sort` (new / popular / viewed), `limit`. Returns approved, published listings. |
| `get_listing` | none | Full detail for one tool by its `slug`. |
| `list_categories` | none | The category ids and labels used by `search_listings`. |
| `submit_listing` | write | Create a new directory listing on behalf of the logged-in user (`name`, `url`, `short_description`, `country`, `category`, `mcp`, `pricing_model`, optional `tags`). Created as `pending`; public after admin review. Max 5 / 24h per owner. |
| `edit_listing` | write | Update fields of a listing you own (by `slug`). Any edit sends it back to review (status `pending`) before it is public again. |

## Listing Examples

Reusable JSON payloads live in [`examples/`](examples/). The Xquik example shows
an MCP-enabled social automation listing that can be adapted before calling
`submit_listing`.

Validate example payloads before using them:

```bash
python3 -m json.tool examples/xquik-submit-listing.json >/dev/null
```

Call `list_categories` in your MCP client before submission to confirm current
category ids. Keep API tokens, screenshots, and private notes out of listing
fields. Submitted and edited listings stay pending until admin review.

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

A single [Cloudflare Worker](https://workers.cloudflare.com) built on the `agents` SDK `createMcpHandler` (stateless Streamable HTTP, no Durable Objects). Reads hit the public Tulimoa catalog with the Supabase anon key, gated by RLS to approved and published listings — authless, since that data is public. Writes resolve a Tulimoa identity per request (either a direct OAuth Bearer, hash-looked-up in `oauth_tokens` and audience-bound to `https://mcp.tulimoa.com/mcp`, or an internally-signed identity header from the Tulimoa gateway) and then insert with an explicit `owner_id`. Hardened with per-colo rate limits and edge caching to protect the backend.

OAuth-capable clients discover the authorization server (`auth.tulimoa.com`) via `GET /.well-known/oauth-protected-resource`.

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
