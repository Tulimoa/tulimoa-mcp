import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CATEGORIES } from "../constants";

export function registerListCategories(server: McpServer) {
  server.registerTool(
    "list_categories",
    {
      title: "List directory categories",
      description:
        "List the category ids and labels used to classify Tulimoa listings. Call this first when " +
        "you need a valid `category` value for search_listings.",
      inputSchema: {},
    },
    async () => {
      const categories = CATEGORIES.map((c) => ({ id: c.id, label: c.label, labelDe: c.labelDe }));
      return {
        content: [
          {
            type: "text" as const,
            text: categories.map((c) => `${c.id} — ${c.label}`).join("\n"),
          },
        ],
        structuredContent: { categories },
      };
    },
  );
}
