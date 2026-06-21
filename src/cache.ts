// Edge-Cache-Helfer (Cloudflare Cache API, caches.default — per-colo geteilt).
// Zweck: wiederholte read-only Reads treffen den Edge-Cache statt Supabase.
// Das ist der stärkste Schutz der geteilten DB unter Last; das Rate-Limit ist
// nur der Abuse-Riegel obendrauf.

// Stabiler Cache-Key aus Tool + normalisierten Parametern (sortiert, ohne leere).
export function cacheKeyFor(kind: string, params: Record<string, unknown>): Request {
  const sp = new URLSearchParams();
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v !== undefined && v !== null) sp.set(k, String(v));
  }
  // Synthetische, nie-gefetchte URL als Cache-Schlüssel.
  return new Request(`https://mcp-cache.tulimoa.internal/${kind}?${sp.toString()}`);
}

export async function cacheGet(key: Request): Promise<unknown | null> {
  const hit = await caches.default.match(key);
  return hit ? await hit.json() : null;
}

export function cachePut(ctx: ExecutionContext, key: Request, value: unknown, ttlSeconds: number): void {
  const resp = new Response(JSON.stringify(value), {
    headers: { "Cache-Control": `public, max-age=${ttlSeconds}` },
  });
  // Nicht-blockierend schreiben.
  ctx.waitUntil(caches.default.put(key, resp));
}
