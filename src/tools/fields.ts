import { z } from "zod";
import { GALLERY_URLS_HINT, MAX_CAPTION, MAX_GALLERY_IMAGES } from "./logo";

// Gemeinsame Felder von submit_listing und edit_listing, damit beide 1:1 dem Web-Formular folgen
// (Tulimoa/src/app/(landing)/submit/new/submit-form.tsx + actions.ts, lib/content-blocks.ts).

/** Nur http(s), wie httpUrl() in submit/new/actions.ts. */
export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const httpUrl = () => z.string().max(500).refine(isHttpUrl, { message: "Must be an http(s) URL." });

// ── Content-Bloecke (lib/content-blocks.ts) ─────────────────────────────────

export const BLOCK_TYPES = ["long_description", "ideal_for", "not_for", "key_features", "use_cases", "integrations"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

const BLOCK_MAX_LEN: Record<BlockType, number> = {
  long_description: 600,
  ideal_for: 400,
  not_for: 400,
  key_features: 600,
  use_cases: 400,
  integrations: 400,
};
const BLOCK_SUBJECT_MAX = 100;
const BLOCK_HAS_SUBJECT = new Set<BlockType>(["ideal_for", "not_for"]);
const MAX_BLOCKS = 30;

export type ContentBlock = { type: BlockType; content: string; subject?: string };

export const contentBlocksSchema = z
  .array(
    z.object({
      type: z.enum(BLOCK_TYPES),
      content: z.string().min(1).max(600),
      subject: z
        .string()
        .max(BLOCK_SUBJECT_MAX)
        .optional()
        .describe("Only for ideal_for and not_for: the short audience after 'Ideal for' / 'Not for', e.g. 'small SaaS teams'."),
    }),
  )
  .max(MAX_BLOCKS)
  .describe(
    "Optional profile sections, like in the web form. type: long_description (max 600 chars), ideal_for, not_for, " +
      "key_features (one feature per line, 5 to 10 lines, max 600), use_cases, integrations (comma-separated). Max 400 chars " +
      "unless noted. Several blocks of the same type are allowed. Write in English. On edit, the list replaces all blocks.",
  );

/** Wie normalizeContentBlocks der Hauptapp: trimmen, Leere raus, pro Typ kuerzen; null wenn nichts bleibt. */
export function normalizeContentBlocks(raw: { type: BlockType; content: string; subject?: string }[]): ContentBlock[] | null {
  const out: ContentBlock[] = [];
  for (const b of raw) {
    const content = b.content.trim().slice(0, BLOCK_MAX_LEN[b.type]);
    if (!content) continue;
    const subject = b.subject?.trim().slice(0, BLOCK_SUBJECT_MAX);
    out.push(subject && BLOCK_HAS_SUBJECT.has(b.type) ? { type: b.type, content, subject } : { type: b.type, content });
  }
  return out.length > 0 ? out : null;
}

// ── Weitere optionale Formularfelder („Mehr Details“) ───────────────────────

export const TEAM_SIZES = ["1", "2-10", "11-50", "51-250", "250+"] as const;

export const detailsShape = {
  founded_year: z.number().int().min(1900).max(2100).optional().describe("Optional founding year."),
  team_size: z.enum(TEAM_SIZES).optional().describe("Optional team size: 1, 2-10, 11-50, 51-250 or 250+."),
  demo_url: httpUrl().optional().describe("Optional demo or video URL."),
  docs_url: httpUrl().optional().describe("Optional documentation URL."),
  open_source: z.boolean().optional().describe("Optional: the software is open source."),
  notable_customers: z.string().max(200).optional().describe("Optional notable customers, e.g. 'Acme, Globex'."),
  content_blocks: contentBlocksSchema.optional(),
  gallery_urls: z.array(z.string().max(1000)).max(MAX_GALLERY_IMAGES).optional().describe(GALLERY_URLS_HINT),
  gallery_captions: z
    .array(z.string().max(MAX_CAPTION))
    .max(MAX_GALLERY_IMAGES)
    .optional()
    .describe("Optional captions for gallery_urls, same order, max 120 chars each."),
};

/** Freitexte, die wie im Web-Formular auf Sperrwoerter geprueft werden. */
export function blockTexts(blocks: ContentBlock[] | null): string[] {
  return (blocks ?? []).flatMap((b) => [b.content, b.subject ?? ""]);
}
