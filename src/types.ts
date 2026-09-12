// Cloudflare Workers Rate-Limit-Binding (per-colo). Keyed auf IP bzw. einen
// festen Key, also ganz ohne Auth nutzbar.
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  RL_IP: RateLimiter;
  RL_DB: RateLimiter;
  // Cloudflare Images (Logo-Import: skalieren + WebP), siehe src/tools/logo.ts.
  IMAGES: ImagesBinding;
  // Secrets (wrangler secret put). Service-Role NUR fuer Auth-Lookups + Write-Tools; Reads bleiben
  // anon + gecacht. INTERNAL_MCP_SECRET = gleicher Wert wie im Gateway (interner Identitaets-Header).
  SUPABASE_SERVICE_ROLE: string;
  INTERNAL_MCP_SECRET: string;
  // Resend fuer die Admin-Benachrichtigung bei neuen Listing-Einreichungen (via MCP/Agent).
  // Fehlt der Key -> silent skip (best-effort, blockiert nie den Submit).
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  ADMIN_NOTIFY_EMAIL?: string;
}

// Aufgeloeste Schreib-Identitaet (aus internem Gateway-Header ODER direktem OAuth-Bearer).
export interface McpUser {
  userId: string;
  scopes: string[];
  via: "internal" | "oauth";
}
