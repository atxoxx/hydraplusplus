import type { SteamAppIdMapping } from "@types";

import { db } from "../level";
import { levelKeys } from "./keys";

/**
 * Persistent mapping from a non-Steam (locally added) game's
 * `${shop}:${objectId}` identity to its resolved Steam AppID. Used by Steam
 * reviews, Steam review summary/analysis, and Steam player count fetchers so
 * they don't fall back to a rate-limited `storesearch` call every visit.
 */
export const steamAppIdMappingSublevel = db.sublevel<string, SteamAppIdMapping>(
  levelKeys.steamAppIdMapping,
  {
    valueEncoding: "json",
  }
);
