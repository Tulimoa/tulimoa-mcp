import type { McpServer } from "@modelcontextprotocol/server";
import type { Env, McpUser } from "../types";
import { registerSearchListings } from "./search-listings";
import { registerGetListing } from "./get-listing";
import { registerListCategories } from "./list-categories";
import { registerSubmitListing } from "./submit-listing";
import { registerEditListing } from "./edit-listing";

export function registerAllTools(server: McpServer, env: Env, ctx: ExecutionContext, user: McpUser | null) {
  // Reads: authless + gecacht (oeffentliche Daten).
  registerSearchListings(server, env, ctx);
  registerGetListing(server, env, ctx);
  registerListCategories(server);
  // Writes: immer advertised (OAuth-Clients entdecken sie), aber an den aufgeloesten User gebunden;
  // das Tool selbst lehnt anonyme / read-only Aufrufe ab.
  registerSubmitListing(server, env, ctx, user);
  registerEditListing(server, env, ctx, user);
}
