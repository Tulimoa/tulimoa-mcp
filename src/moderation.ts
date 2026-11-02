// Schimpfwort-Filter fuer Freitexte in submit_listing/edit_listing. Port 1:1 aus der Hauptapp
// (Tulimoa/src/lib/moderation.ts, containsProfanity). Bei Aenderungen der Wortliste dort hier nachziehen.

const PROFANITY = [
  // EN
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "dick",
  "cock", "pussy", "whore", "slut", "fag", "nigger", "nigga",
  "retard", "spic", "kike", "chink", "tranny", "piss",
  // DE
  "scheisse", "scheiße", "fick", "ficken", "arschloch", "wichser",
  "fotze", "hure", "nutte", "schlampe", "bastard", "kanake",
  "neger", "spast", "spasti", "behindert", "schwuchtel",
  // Hass / Gewalt
  "hitler", "nazi", "naziboi", "killyourself", "kys",
  // Leet-Varianten
  "fuk", "fucc", "shyt", "biatch",
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Ganzwort-Treffer plus wenige Endungen (kein offener rechter Rand, sonst trifft es „Cocktail“ & Co.).
const PROFANITY_RE = new RegExp(`\\b(?:${PROFANITY.map(escapeRegex).join("|")})(?:s|es|ed|ing)?\\b`, "i");

export function containsProfanity(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text
    .toLowerCase()
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t");
  return PROFANITY_RE.test(normalized);
}

/** true, wenn irgendeiner der Texte ein Sperrwort enthaelt. */
export function anyProfanity(values: (string | null | undefined)[]): boolean {
  return values.some((v) => containsProfanity(v));
}
