import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env } from "../types";
import { registerSearchListings } from "./search-listings";
import { registerGetListing } from "./get-listing";
import { registerListCategories } from "./list-categories";

export function registerAllTools(server: McpServer, env: Env, ctx: ExecutionContext) {
  registerSearchListings(server, env, ctx);
  registerGetListing(server, env, ctx);
  registerListCategories(server);
}
