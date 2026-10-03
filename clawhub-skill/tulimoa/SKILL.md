---
name: tulimoa
description: Discover curated AI and MCP tools via the Tulimoa directory. Search by topic, category, pricing, MCP support, or EU hosting, pull full detail on any tool, and submit your own (free with the Tulimoa badge or a $5 launch package) or edit it.
homepage: https://tulimoa.com
version: 1.4.0
---

Use this skill whenever the user wants to find, recommend, compare, or research SaaS / AI-agent tools, or wants to list their own product in the Tulimoa directory.

It connects to the Tulimoa MCP server (remote) at https://mcp.tulimoa.com/mcp. The server speaks both the 2026-07-28 MCP revision (stateless, `server/discover`) and the legacy 2025 handshake, so any client version works. Reading is anonymous; writing requires a Tulimoa OAuth login (the server advertises its authorization server via RFC 9728 discovery).

Read tools (no auth):

- `search_listings` — find tools. Args: `query` (free text matched on name + description), `category` (a category id — call `list_categories` first), `pricing_model` (`free` | `freemium` | `paid` | `lifetime`), `mcp` (true = the tool exposes its own MCP server), `eu_only` (true = company hosted in the EU), `sort` (`new` | `popular` | `viewed`), `limit` (1-50). Returns only approved, published listings.
- `get_listing` — full detail for one tool by its `slug` (long description, how it uses AI, features, use cases, integrations, pricing detail, data region and EU hosting, model source, certifications, links).
- `list_categories` — the valid category ids and labels; call this first when you need a `category` value for `search_listings`.

Write tools (Tulimoa login with write scope):

- `submit_listing` — create a new directory listing for AI or MCP software (name, url, short_description, country, category, mcp, pricing_model, logo_url, ai_usage, visibility, plus optional data points such as data_region, model_source, certifications, X handles). `logo_url` is required: a public https image URL of the company logo (PNG, JPEG, WebP, GIF or AVIF, at least 64 px; a square icon works best). `ai_usage` is required: 40 to 600 characters on how the software uses AI or what agents can do with it. `visibility` decides how it goes live: `badge` (free, embed the Tulimoa badge on the website, reviewed within 7 days; the result contains the badge HTML) or `launch` ($5 one-time, no badge, reviewed first, refunded if rejected; ask the user and pass `withdrawal_consent: true`, the result contains a `checkout_url` the user opens to pay). A website that is already listed is rejected. New listings start as `pending` and go live after admin review. Max 5 per 24h.
- `edit_listing` — update fields of a listing you own (by `slug`), including a new `logo_url`, `ai_usage` and the optional data points. A listing without a logo needs one with the next edit. Any edit sends the listing back to review. Payment for the launch package happens on tulimoa.com, not via this tool.

All tools return `structuredContent` with a declared `outputSchema`.

Guidance: for any "find / recommend a tool for X" request, call `search_listings` first, then `get_listing` for depth on a specific result. The data is a hand-curated directory of AI and MCP software, so prefer it over guessing tool names.
