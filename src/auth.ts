// Schreib-Auth fuer tulimoa-mcp. Reads bleiben authless + gecacht; NUR Write-Tools brauchen einen User.
// Zwei Pfade:
//  (a) interner Trust: das Gateway hat den User schon authentifiziert und signiert die Identitaet per
//      HMAC ueber das private Service-Binding (X-Tulimoa-*). MUSS byte-gleich zu
//      gateway/src/federation/internal-auth.ts sein. R6: kein DB-Nonce auf dem Hot-Path; Schutz =
//      privates Binding (workers_dev=false) + ts-Fenster <60s.
//  (b) direkter OAuth-Bearer (Stufe 2): sha256-Hash-Lookup in oauth_tokens, AUDIENCE-gebunden.

import type { Env, McpUser } from "./types";
import { makeAdmin } from "./supabase";

const INTERNAL_MAX_AGE_MS = 60_000;
const MCP_AUDIENCE = "https://mcp.tulimoa.com/mcp";

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, base: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveInternal(env: Env, h: Headers): Promise<McpUser | null> {
  const userId = h.get("X-Tulimoa-User");
  const scopes = h.get("X-Tulimoa-Scopes");
  const ts = h.get("X-Tulimoa-Ts");
  const nonce = h.get("X-Tulimoa-Nonce");
  const sig = h.get("X-Tulimoa-Internal");
  if (!userId || scopes === null || !ts || !nonce || !sig || !env.INTERNAL_MCP_SECRET) return null;

  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < -5_000 || age > INTERNAL_MAX_AGE_MS) return null; // ts-Fenster (R6)

  const base = `${userId}|${scopes}|${ts}|${nonce}`; // == internalSigningBase im Gateway
  const expected = await hmacHex(env.INTERNAL_MCP_SECRET, base);
  if (!timingSafeEqualHex(expected, sig.toLowerCase())) return null;

  return { userId, scopes: scopes ? scopes.split(",").filter(Boolean) : [], via: "internal" };
}

async function resolveOAuth(env: Env, h: Headers): Promise<McpUser | null> {
  const auth = h.get("authorization");
  const m = auth ? /^Bearer\s+(.+)$/i.exec(auth.trim()) : null;
  if (!m) return null;
  if (!env.SUPABASE_SERVICE_ROLE) return null;

  const tokenHash = await sha256Hex(m[1].trim());
  // oauth_tokens ist (noch) nicht in den lokalen database.types -> Cast.
  const admin = makeAdmin(env) as unknown as { from: (t: string) => any };
  const { data } = await admin
    .from("oauth_tokens")
    .select("user_id,scopes,audience")
    .eq("token_hash", tokenHash)
    .eq("audience", MCP_AUDIENCE)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  const row = data as { user_id: string; scopes: string[] | null } | null;
  if (!row) return null;
  return { userId: row.user_id, scopes: row.scopes?.length ? row.scopes : ["read"], via: "oauth" };
}

// Pro Request einmal aufloesen (in fetch, vor createServer). null = anonym (nur Reads erlaubt).
export async function resolveMcpUser(env: Env, request: Request): Promise<McpUser | null> {
  return (await resolveInternal(env, request.headers)) ?? (await resolveOAuth(env, request.headers));
}

export function hasWrite(u: McpUser | null): boolean {
  return !!u && u.scopes.includes("write");
}
