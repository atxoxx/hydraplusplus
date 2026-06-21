import { registerEvent } from "../register-event";
import { searchGoogleImages } from "@main/services/google-image-search";
import { SteamGridDBApi } from "@main/services/steamgriddb-api";
import { searchIGDBImages } from "@main/services/igdb-image-search";
import { searchSteamCDNImages } from "@main/services/steam-cdn-image-search";
import { db } from "@main/level";
import { levelKeys } from "@main/level/sublevels";
import { networkLogger as logger } from "@main/services/logger";
import type {
  AssetType,
  SearchGameAssetsResponse,
} from "@main/services/duckduckgo-image-search";
import type { UserPreferences } from "@types";

export type ImageSearchSource = "google" | "steamgriddb" | "igdb" | "steamcdn";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedEntry {
  results: SearchGameAssetsResponse;
  timestamp: number;
}

function getCacheKey(
  gameTitle: string,
  assetType: string,
  source: string,
  shop?: string,
  objectId?: string
): string {
  const suffix = shop && objectId ? `:${shop}:${objectId}` : "";
  return `${levelKeys.metadataCache}:img:${source}:${assetType}:${gameTitle.toLowerCase()}${suffix}`;
}

async function getCached(
  key: string
): Promise<SearchGameAssetsResponse | null> {
  try {
    const entry = await db.get<string, CachedEntry>(key, {
      valueEncoding: "json",
    });
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.results;
    }
  } catch {
    // Key not found or expired
  }
  return null;
}

async function setCached(
  key: string,
  results: SearchGameAssetsResponse
): Promise<void> {
  const entry: CachedEntry = { results, timestamp: Date.now() };
  await db.put<string, CachedEntry>(key, entry, { valueEncoding: "json" });
}

const searchGameAssetsMultiEvent = async (
  _event: Electron.IpcMainInvokeEvent,
  gameTitle: string,
  assetType: AssetType,
  source: ImageSearchSource,
  shop?: string,
  objectId?: string
): Promise<SearchGameAssetsResponse> => {
  const trimmedTitle = gameTitle.trim();
  if (!trimmedTitle) {
    return { results: [], query: "" };
  }

  // Check cache
  const cacheKey = getCacheKey(trimmedTitle, assetType, source, shop, objectId);
  const cached = await getCached(cacheKey);
  if (cached) {
    logger.log(
      `Image search cache hit for source=${source} type=${assetType} query="${trimmedTitle}"`
    );
    return cached;
  }

  let response: SearchGameAssetsResponse;

  try {
    switch (source) {
      case "google":
        response = await searchGoogleImages(trimmedTitle, assetType);
        break;

      case "steamgriddb": {
        // Load API key from user preferences on first use
        if (!SteamGridDBApi.isConfigured()) {
          try {
            const prefs = await db.get<string, UserPreferences | null>(
              levelKeys.userPreferences,
              { valueEncoding: "json" }
            );
            const key = (prefs as any)?.steamgriddbApiKey;
            if (key) {
              SteamGridDBApi.setApiKey(key);
            }
          } catch {
            // Preferences not available — key stays null
          }
        }

        if (!SteamGridDBApi.isConfigured()) {
          return { results: [], query: trimmedTitle };
        }
        // Map frontend asset types to SteamGridDB endpoint family explicitly so
        // a grid/banner request hits /grids rather than silently falling back to
        // /icons as it did previously.
        type SgdbSingular = "icon" | "logo" | "hero" | "grid";
        const SGDB_MAP: Record<string, SgdbSingular> = {
          logo: "logo",
          hero: "hero",
          icon: "icon",
          grid: "grid",
          banner: "grid",
        };
        const sgdbSingular: SgdbSingular = SGDB_MAP[assetType] ?? "icon";
        const results = await SteamGridDBApi.searchImages(
          trimmedTitle,
          sgdbSingular,
          shop,
          objectId
        );
        response = { results, query: trimmedTitle };
        break;
      }

      case "igdb": {
        const results = await searchIGDBImages(trimmedTitle, assetType);
        response = { results, query: trimmedTitle };
        break;
      }

      case "steamcdn": {
        const results = await searchSteamCDNImages(
          trimmedTitle,
          assetType,
          shop === "steam" ? objectId : null
        );
        response = { results, query: trimmedTitle };
        break;
      }

      default:
        logger.warn(
          `Unknown image search source: ${source}, falling back to google`
        );
        response = await searchGoogleImages(trimmedTitle, assetType);
    }
  } catch (error) {
    logger.error(
      `Image search failed for source=${source} type=${assetType}:`,
      error
    );
    response = { results: [], query: trimmedTitle };
  }

  // Cache results if non-empty
  if (response.results.length > 0) {
    await setCached(cacheKey, response);
  }

  return response;
};

registerEvent("searchGameAssetsMulti", searchGameAssetsMultiEvent);
