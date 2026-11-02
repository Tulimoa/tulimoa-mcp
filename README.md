# Tulimoa MCP Server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI agents discover curated SaaS and AI-agent tools from the [Tulimoa](https://tulimoa.com) directory.

- **Endpoint:** `https://mcp.tulimoa.com/mcp`
- **Transport:** Streamable HTTP
- **Auth:** none for the read tools (public data). The write tools (`submit_listing`, `edit_listing`) require an OAuth login via `auth.tulimoa.com` and a `write`-scoped token bound to your Tulimoa account.

## Tools

| Tool | Auth | What it does |
| --- | --- | --- |
| `search_listings` | none | Find tools by free-text `query`, `category`, `pricing_model` (free / freemium / paid / lifetime), `mcp` (tool has its own MCP server), `eu_only`, `sort` (new / popular / viewed), `limit`. Returns approved, published listings. |
| `get_listing` | none | Full detail for one tool by its `slug`, including how it uses AI (`ai_usage`), data region and EU hosting, model source and certifications. |
| `list_categories` | none | The category ids and labels used by `search_listings`. |
| `submit_listing` | write | Create a new directory listing for AI or MCP software on behalf of the logged-in user, with the same fields and rules as the web form (https://tulimoa.com/submit/guidelines). Required: `name`, `url` (own website, http or https), `short_description`, `country` (form list), `category`, `mcp`, `pricing_model`, `logo_url`, `ai_usage`, `visibility`. `logo_url`: a public https image URL (PNG, JPEG, WebP, GIF or AVIF, at least 64 px), scaled to max 512 px and stored as WebP. `ai_usage`: 40 to 600 chars. `visibility`: `badge` (free; the Tulimoa badge must already be on the website, the tool checks it and returns the badge HTML if it is missing; reviewed within 7 days) or `launch` ($5 one-time, no badge, reviewed first, refunded if rejected; needs `withdrawal_consent: true`, returns a `checkout_url`). Optional like the form: `gallery_urls` (up to 5, stored as WebP) with `gallery_captions`, `content_blocks`, `founded_year`, `team_size`, `demo_url`, `docs_url`, `open_source`, `notable_customers`, data points, X handles and a hand-test request (`test_request`). Texts pass the same word filter as the form. Already listed websites are rejected, at most 2 active listings per account and 5 submissions per 24h. Created as `pending`; public after admin review. The submitter gets a confirmation email; the admin queue shows the listing as submitted via MCP. |
| `edit_listing` | write | Update fields of a listing you own (by `slug`) with the same fields and rules as the web editor; only the fields you pass change. Changes to a live listing show right away and are checked afterwards. A changed MCP endpoint on a live listing sends it back to review, and editing a rejected listing resubmits it when the rejection reason allows. The badge is re-checked on every edit. A listing without a logo needs one with the next edit. |

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
