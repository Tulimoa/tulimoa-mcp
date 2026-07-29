---
name: tulimoa-gateway
description: Connect an agent to the Tulimoa MCP gateway — one EU-hosted endpoint that federates your connected SaaS tools and carries a persistent memory layer, so context (facts, IDs, goals, plans) survives across turns and sessions and the agent stops re-fetching and re-asking.
homepage: https://tulimoa.com/gateway
version: 1.2.0
---

Use this skill when an agent should reach several SaaS tools through a single MCP endpoint AND keep working memory that survives context compaction and new sessions.

It connects to the Tulimoa gateway (remote) at `https://gateway.tulimoa.com/mcp`. The gateway federates the tools you connect in the Tulimoa dashboard (the Tulimoa directory is always available; other SaaS appear once connected) and adds a memory layer on top. Reading memory needs a read-scoped key; writing/deleting needs a write-scoped key. The gateway advertises its authorization server via RFC 9728 discovery, so a compliant client can run the OAuth flow, or you can pass a Tulimoa gateway API key as a Bearer token.

The memory is what keeps the agent from forgetting. Native memory tools (namespaced `tulimoa__`):

- `recall` — pull back what was established earlier (pinned facts, IDs, decisions, open loops). Call at the START of a task and again before finishing. Args: `topic` (optional free-text filter), `limit`.
- `remember` — store a durable fact (an ID, a decision, a preference, a resource you will reuse). Args: `text`, optional `key` (a stable key overwrites the previous value for that key — no duplicate facts), `importance`, `durable` (keep across sessions), `share_with_team`. Credential-shaped text is refused; store a reference instead.
- `set_goal` — set the one active goal for the session; resurfaced if context is compacted.
- `checkpoint` — save a plan before a multi-step, multi-tool task so it can be resumed after compaction.
- `forget` — remove a remembered item by `id` or `key`.
- `get_pending` — replay events missed while disconnected or after compaction.
- `recall_result` — fetch the full payload of an earlier tool result that the gateway replaced with a short dedup pointer (pass the `cache_key` from the `[tulimoa dedup]` note).

Behaviour worth knowing:

- The gateway injects a compact continuity block into tool results when it matters (goal changed, a new ID was captured, the agent looks disoriented), so the working context travels with the conversation instead of being lost.
- Byte-identical repeated tool calls are collapsed to a short pointer to save tokens; the full payload stays retrievable via `recall_result`. Structured output is passed through unchanged.
- Memory is EU-hosted. A user can export or erase all of their gateway memory (GDPR Art. 15 / 17) from the Tulimoa dashboard; an erase clears live sessions within seconds.

Guidance: at the start of a task call `tulimoa__recall` to load prior context; whenever you learn something durable (an ID, a decision, a user preference) call `tulimoa__remember`; for a multi-step plan call `tulimoa__set_goal` / `tulimoa__checkpoint`; before finishing, `tulimoa__recall` once more so you do not drop an open loop.
