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
}
