// Kopiert/getrimmt aus src/lib/{categories,countries,pricing-models}.ts der
// Next-App, damit der Worker keine Imports aus der App braucht. MUSS mit
// src/lib/categories.ts dort 1:1 übereinstimmen (gleiche ids), sonst werfen
// search/submit/edit „invalid enum". Bei Vokabular-Änderungen hier nachziehen
// (später: gemeinsames @tulimoa/domain-Package).
//
// Klassifikation §13: eine feste Primär-Kategorie (14 + Other), Single-Select.

export const CATEGORIES = [
  { id: "developer-tools", label: "Developer Tools", labelDe: "Developer Tools" },
  { id: "ai-infra", label: "AI Infrastructure & LLM Tools", labelDe: "KI-Infrastruktur & LLM-Tools" },
  { id: "sales-crm", label: "Sales & CRM", labelDe: "Vertrieb & CRM" },
  { id: "marketing", label: "Marketing & Growth", labelDe: "Marketing & Growth" },
  { id: "productivity", label: "Productivity & Docs", labelDe: "Produktivität & Docs" },
  { id: "data-analytics", label: "Data & Analytics", labelDe: "Daten & Analytics" },
  { id: "finance-accounting", label: "Finance & Accounting", labelDe: "Finanzen & Buchhaltung" },
  { id: "customer-support", label: "Customer Support", labelDe: "Kundensupport" },
  { id: "hr-recruiting", label: "HR & Recruiting", labelDe: "HR & Recruiting" },
  { id: "design-creative", label: "Design & Creative", labelDe: "Design & Kreativ" },
  { id: "security-privacy", label: "Security & Privacy", labelDe: "Security & Datenschutz" },
  { id: "communication", label: "Communication & Collaboration", labelDe: "Kommunikation & Zusammenarbeit" },
  { id: "commerce-payments", label: "Commerce & Payments", labelDe: "Commerce & Payments" },
  { id: "automation-nocode", label: "Automation & No-Code", labelDe: "Automation & No-Code" },
  { id: "other", label: "Other", labelDe: "Sonstiges" },
] as const;

// Tuple der gültigen Kategorie-ids (= der in listings.category gespeicherte Wert).
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as unknown as [string, ...string[]];

export const PRICING_MODELS = ["free", "freemium", "paid", "lifetime"] as const;

export const SORTS = ["new", "popular", "viewed"] as const;

// ISO-3166-1 alpha-2 der EU-Mitglieder (aus countries.ts inEu: true).
export const EU_COUNTRY_CODES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

// Laender-Codes des Web-Formulars (Tulimoa/src/lib/countries.ts, COUNTRIES[].code). submit_listing
// akzeptiert nur diese, wie das Formular (invalid_country). Bei neuen Laendern dort hier nachziehen.
export const COUNTRY_CODES = [
  "AR", "AU", "AT", "BE", "BR", "BG", "CA", "CL", "CN", "CO", "HR", "CY", "CZ", "DK", "EG", "EE",
  "FI", "FR", "DE", "GR", "HK", "HU", "IS", "IN", "ID", "IE", "IL", "IT", "JP", "LV", "LI", "LT",
  "LU", "MY", "MT", "MX", "MA", "NL", "NZ", "NG", "NO", "PE", "PH", "PL", "PT", "RO", "SA", "RS",
  "SG", "SK", "SI", "ZA", "KR", "ES", "SE", "CH", "TW", "TH", "TR", "UA", "AE", "GB", "US", "VN",
] as const;
