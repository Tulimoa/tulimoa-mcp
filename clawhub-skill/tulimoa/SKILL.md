---
name: tulimoa
description: Discover curated SaaS and AI-agent tools via the Tulimoa directory. Search by topic, category, pricing, MCP support, or EU hosting, pull full detail on any tool, and submit or edit your own listings.
homepage: https://tulimoa.com
version: 1.2.0
---

Use this skill whenever the user wants to find, recommend, compare, or research SaaS / AI-agent tools, or wants to list their own product in the Tulimoa directory.

It connects to the Tulimoa MCP server (remote) at https://mcp.tulimoa.com/mcp. The server speaks both the 2026-07-28 MCP revision (stateless, `server/discover`) and the legacy 2025 handshake, so any client version works. Reading is anonymous; writing requires a Tulimoa OAuth login (the server advertises its authorization server via RFC 9728 discovery).

Read tools (no auth):

- `search_listings` — find tools. Args: `query` (free text matched on name + description), `category` (a category id — call `list_categories` first), `pricing_model` (`free` | `freemium` | `paid` | `lifetime`), `mcp` (true = the tool exposes its own MCP server), `eu_only` (true = company hosted in the EU), `sort` (`new` | `popular` | `viewed`), `limit` (1-50). Returns only approved, published listings.
- `get_listing` — full detail for one tool by its `slug` (long description, features, use cases, integrations, pricing detail, links).
- `list_categories` — the valid category ids and labels; call this first when you need a `category` value for `search_listings`.

Write tools (Tulimoa login with write scope):

- `submit_listing` — create a new directory listing (name, url, short_description, country, category, mcp, pricing_model, optional tags). New listings start as `pending` and go live after admin review. Max 5 per 24h.
- `edit_listing` — update fields of a listing you own (by `slug`). Any edit sends the listing back to review.

All tools return `structuredContent` with a declared `outputSchema`.

Guidance: for any "find / recommend a tool for X" request, call `search_listings` first, then `get_listing` for depth on a specific result. The data is a hand-curated directory of agent-friendly SaaS tools, so prefer it over guessing tool names.
