import type { AdminClient } from "../supabase";
import type { Env } from "../types";

// Bild-Import fuer submit_listing/edit_listing (Logo + Galerie). Agents schicken Bild-URLs (kein
// Base64, spart Tokens); der Worker laedt sie, prueft Groesse + Magic-Bytes, skaliert und legt sie
// als WebP ab. Gleiche Regeln wie der Web-Upload der Hauptapp (src/lib/actions/upload-image.ts +
// src/components/landing/image-uploader.tsx):
//   Logo:    Bucket `logos`,   max. 512 px,  Qualitaet 0.90, max. 2 MB
//   Galerie: Bucket `gallery`, max. 1280 px, Qualitaet 0.78, max. 4 MB, hoechstens 5 Bilder
// Pfad {user_id}/{ts}-{rand}.webp. SSRF: global_fetch_strictly_public (wrangler.jsonc).

type ImageSpec = {
  bucket: "logos" | "gallery";
  label: string;
  maxPx: number;
  minPx: number;
  quality: number;
  maxOutputBytes: number;
};

const LOGO: ImageSpec = { bucket: "logos", label: "Logo", maxPx: 512, minPx: 64, quality: 90, maxOutputBytes: 2_097_152 };
const GALLERY: ImageSpec = { bucket: "gallery", label: "Gallery image", maxPx: 1280, minPx: 0, quality: 78, maxOutputBytes: 4_194_304 };

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
export const MAX_GALLERY_IMAGES = 5;
export const MAX_CAPTION = 120;

export const LOGO_URL_HINT =
  "Public https URL of the company logo: PNG, JPEG, WebP, GIF or AVIF, at least 64 px, max 10 MB. " +
  "A square icon works best. Tulimoa downloads it, scales it to max 512 px and stores it as WebP.";

export const GALLERY_URLS_HINT =
  `Optional screenshots, up to ${MAX_GALLERY_IMAGES} public https image URLs (PNG, JPEG, WebP, GIF or AVIF, max 10 MB each). ` +
  "The first one is the hero image. Tulimoa scales them to max 1280 px and stores them as WebP. " +
  "Images already stored on Tulimoa (from get_listing) are kept as they are.";

export type ImageImport = { ok: true; url: string; path: string | null } | { ok: false; error: string };
export type LogoImport = ImageImport;

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

/** Liegt die URL schon in unserem Storage-Bucket? Dann nicht erneut importieren. */
function isOwnStorageUrl(env: Env, bucket: string, raw: string): boolean {
  const base = `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/`;
  return raw.startsWith(base);
}

async function importImage(env: Env, admin: AdminClient, userId: string, rawUrl: string, spec: ImageSpec): Promise<ImageImport> {
  const fail = (error: string): ImageImport => ({ ok: false, error });
  const what = spec.label;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail(`${what} URL is not valid: ${rawUrl}`);
  }
  if (url.protocol !== "https:") return fail(`${what} URL must be https: ${rawUrl}`);

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
    return fail(`Could not download ${what.toLowerCase()} ${rawUrl} (network error or timeout).`);
  }
  if (!res.ok || !res.body) return fail(`Could not download ${what.toLowerCase()} ${rawUrl} (HTTP ${res.status}).`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_INPUT_BYTES) return fail(`${what} is too large (max 10 MB): ${rawUrl}`);

  const bytes = await readCapped(res.body, MAX_INPUT_BYTES);
  if (!bytes) return fail(`${what} is too large (max 10 MB): ${rawUrl}`);

  const format = sniff(bytes);
  if (!format) return fail(`${rawUrl} is not a supported image (PNG, JPEG, WebP, GIF or AVIF).`);
  if (format === "image/svg+xml") return fail(`SVG is not supported (${rawUrl}). Provide a PNG, JPEG, WebP, GIF or AVIF URL.`);

  if (spec.minPx > 0) {
    try {
      const info = await env.IMAGES.info(streamOf(bytes));
      if ("width" in info && Math.max(info.width, info.height) < spec.minPx) {
        return fail(`${what} is too small (${info.width}x${info.height}). Provide at least ${spec.minPx} px, a favicon is not enough.`);
      }
    } catch {
      return fail(`${rawUrl} is not a readable image.`);
    }
  }

  let webp: Uint8Array;
  try {
    const out = await env.IMAGES.input(streamOf(bytes))
      .transform({ width: spec.maxPx, height: spec.maxPx, fit: "scale-down" })
      .output({ format: "image/webp", quality: spec.quality, anim: false });
    webp = new Uint8Array(await new Response(out.image()).arrayBuffer());
  } catch (err) {
    console.error("[importImage] transform failed:", err);
    return fail(`Could not convert ${rawUrl} to WebP. Try a PNG or JPEG URL.`);
  }
  if (sniff(webp) !== "image/webp") return fail(`Could not convert ${rawUrl} to WebP. Try a PNG or JPEG URL.`);
  if (webp.byteLength > spec.maxOutputBytes) {
    return fail(`${what} is too large after conversion (max ${Math.round(spec.maxOutputBytes / 1_048_576)} MB): ${rawUrl}`);
  }

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.webp`;
  const { error } = await admin.storage.from(spec.bucket).upload(path, webp, {
    contentType: "image/webp",
    upsert: false,
    cacheControl: "31536000, immutable",
  });
  if (error) return fail(`${what} upload failed: ${error.message}`);

  const { data } = admin.storage.from(spec.bucket).getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path };
}

export function importLogo(env: Env, admin: AdminClient, userId: string, logoUrl: string): Promise<LogoImport> {
  return importImage(env, admin, userId, logoUrl, LOGO);
}

export type GalleryImport =
  | { ok: true; urls: string[]; captions: string[]; paths: string[] }
  | { ok: false; error: string };

/**
 * Galerie importieren: hoechstens 5 Bilder, Bildunterschriften (max. 120 Zeichen) passend zur
 * Reihenfolge. Bilder, die schon im Bucket `gallery` liegen, bleiben unveraendert. Scheitert ein
 * Bild, werden die schon hochgeladenen wieder entfernt.
 */
export async function importGallery(
  env: Env,
  admin: AdminClient,
  userId: string,
  rawUrls: string[],
  rawCaptions: string[] | undefined,
): Promise<GalleryImport> {
  const list = rawUrls.map((u) => u.trim()).filter(Boolean).slice(0, MAX_GALLERY_IMAGES);
  const urls: string[] = [];
  const paths: string[] = [];
  for (const raw of list) {
    if (isOwnStorageUrl(env, "gallery", raw)) {
      urls.push(raw);
      continue;
    }
    const img = await importImage(env, admin, userId, raw, GALLERY);
    if (!img.ok) {
      await removeImages(admin, "gallery", paths);
      return { ok: false, error: img.error };
    }
    urls.push(img.url);
    if (img.path) paths.push(img.path);
  }
  const captions = urls.map((_, i) => (rawCaptions?.[i] ?? "").trim().slice(0, MAX_CAPTION));
  return { ok: true, urls, captions, paths };
}

async function removeImages(admin: AdminClient, bucket: "logos" | "gallery", paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await admin.storage
    .from(bucket)
    .remove(paths)
    .then(() => undefined, () => undefined);
}

// Best-effort Aufraeumen, wenn das Listing-Insert/Update nach dem Upload scheitert.
export async function removeLogo(admin: AdminClient, path: string | null): Promise<void> {
  if (path) await removeImages(admin, "logos", [path]);
}

export async function removeGallery(admin: AdminClient, paths: string[]): Promise<void> {
  await removeImages(admin, "gallery", paths);
}
