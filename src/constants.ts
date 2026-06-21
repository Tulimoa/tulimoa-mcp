// Kopiert/getrimmt aus src/lib/{tags,countries,pricing-models}.ts, damit der
// Worker keine Imports aus der Next-App braucht. Bei Vokabular-Änderungen hier
// nachziehen (später: gemeinsames @tulimoa/domain-Package).
//
// Hinweis: Das Tag-/Klassifikationssystem wird neu geplant (3-Achsen-Modell).
// Dieser Worker klassifiziert bewusst nur über `category` + Facetten + Volltext.

export const CATEGORIES = [
  { id: "sales-crm", label: "Sales & CRM", labelDe: "Vertrieb & CRM" },
  { id: "marketing", label: "Marketing", labelDe: "Marketing" },
  { id: "communication", label: "Communication", labelDe: "Kommunikation" },
  { id: "productivity", label: "Productivity", labelDe: "Produktivität" },
  { id: "developer-tools", label: "Developer Tools", labelDe: "Developer Tools" },
  { id: "finance-ops", label: "Finance & Operations", labelDe: "Finanzen & Operations" },
  { id: "hr-people", label: "HR & People", labelDe: "HR & People" },
  { id: "customer-support", label: "Customer Support", labelDe: "Kundensupport" },
  { id: "data-analytics", label: "Data & Analytics", labelDe: "Daten & Analytics" },
  { id: "ai-infra", label: "AI Infrastructure", labelDe: "KI-Infrastruktur" },
  { id: "compliance-hosting", label: "Compliance & Hosting", labelDe: "Compliance & Hosting" },
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
