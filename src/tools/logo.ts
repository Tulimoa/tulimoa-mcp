import type { AdminClient } from "../supabase";
import type { Env } from "../types";

// Logo-Import fuer submit_listing/edit_listing. Agents schicken eine Bild-URL (kein Base64, spart
// Tokens); der Worker laedt sie, prueft Groesse + Magic-Bytes, skaliert auf max. 512 px und legt
// sie als WebP in den Bucket `logos`. Gleiche Regeln wie der Web-Upload der Hauptapp
// (src/lib/actions/upload-image.ts + src/lib/image/to-webp.ts): nur WebP im Bucket, max. 2 MB,
// Pfad {user_id}/{ts}-{rand}.webp. SSRF: global_fetch_strictly_public (wrangler.jsonc).

const BUCKET = "logos";
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2_097_152;
const MAX_PX = 512;
const MIN_PX = 64;
const QUALITY = 90;
const FETCH_TIMEOUT_MS = 10_000;

export const LOGO_URL_HINT =
  "Public https URL of the company logo: PNG, JPEG, WebP, GIF or AVIF, at least 64 px, max 5 MB. " +
  "A square icon works best. Tulimoa downloads it, scales it to max 512 px and stores it as WebP.";

export type LogoImport = { ok: true; url: string; path: string } | { ok: false; error: string };

type Format = "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/avif" | "image/svg+xml";

function sniff(b: Uint8Array): Format | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  const ftyp = String.fromCharCode(...b.subarray(4, 12));
  if (ftyp === "ftypavif" || ftyp === "ftypavis") return "image/avif";
  const head = new TextDecoder().decode(b.subarray(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

async function readCapped(body: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Blob([bytes]).stream();
}

export async function importLogo(env: Env, admin: AdminClient, userId: string, logoUrl: string): Promise<LogoImport> {
  const fail = (error: string): LogoImport => ({ ok: false, error });

  let url: URL;
  try {
    url = new URL(logoUrl);
  } catch {
    return fail("logo_url is not a valid URL.");
  }
  if (url.protocol !== "https:") return fail("logo_url must be an https URL.");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: "image/webp,image/avif,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.5",
        "user-agent": "TulimoaBot/1.0 (+https://tulimoa.com)",
      },
    });
  } catch {
    return fail("Could not download logo_url (network error or timeout).");
  }
  if (!res.ok || !res.body) return fail(`Could not download logo_url (HTTP ${res.status}).`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_INPUT_BYTES) return fail("Logo is too large (max 5 MB).");

  const bytes = await readCapped(res.body, MAX_INPUT_BYTES);
  if (!bytes) return fail("Logo is too large (max 5 MB).");

  const format = sniff(bytes);
  if (!format) return fail("logo_url does not point to a supported image (PNG, JPEG, WebP, GIF or AVIF).");
  if (format === "image/svg+xml") return fail("SVG logos are not supported. Provide a PNG, JPEG, WebP, GIF or AVIF URL.");

  try {
    const info = await env.IMAGES.info(streamOf(bytes));
    if ("width" in info && Math.max(info.width, info.height) < MIN_PX) {
      return fail(`Logo is too small (${info.width}x${info.height}). Provide at least ${MIN_PX} px, a favicon is not enough.`);
    }
  } catch {
    return fail("logo_url is not a readable image.");
  }

  let webp: Uint8Array;
  try {
    const out = await env.IMAGES.input(streamOf(bytes))
      .transform({ width: MAX_PX, height: MAX_PX, fit: "scale-down" })
      .output({ format: "image/webp", quality: QUALITY, anim: false });
    webp = new Uint8Array(await new Response(out.image()).arrayBuffer());
  } catch (err) {
    console.error("[importLogo] transform failed:", err);
    return fail("Could not convert the logo to WebP. Try a PNG or JPEG URL.");
  }
  if (sniff(webp) !== "image/webp") return fail("Could not convert the logo to WebP. Try a PNG or JPEG URL.");
  if (webp.byteLength > MAX_OUTPUT_BYTES) return fail("Logo is too large after conversion (max 2 MB).");

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.webp`;
  const { error } = await admin.storage.from(BUCKET).upload(path, webp, {
    contentType: "image/webp",
    upsert: false,
    cacheControl: "31536000, immutable",
  });
  if (error) return fail(`Logo upload failed: ${error.message}`);

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path };
}

// Best-effort Aufraeumen, wenn das Listing-Insert/Update nach dem Upload scheitert.
export async function removeLogo(admin: AdminClient, path: string): Promise<void> {
  await admin.storage
    .from(BUCKET)
    .remove([path])
    .then(() => undefined, () => undefined);
}
