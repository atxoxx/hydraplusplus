import { registerEvent } from "../register-event";
import { searchGameAssets } from "@main/services/duckduckgo-image-search";
import type {
  AssetSearchResult,
  AssetType,
} from "@main/services/duckduckgo-image-search";
import { SteamGridDBApi } from "@main/services/steamgriddb-api";
import { searchIGDBImages } from "@main/services/igdb-image-search";
import { searchSteamCDNImages } from "@main/services/steam-cdn-image-search";
import { db } from "@main/level";
import { levelKeys } from "@main/level/sublevels";
import { networkLogger as logger } from "@main/services/logger";
import type { UserPreferences } from "@types";

export type SearchGameAssetsAggregatedResponse = {
  results: AssetSearchResult[];
  query: string;
};

type SgdbSingular = "icon" | "logo" | "hero" | "grid";

const SGDB_MAP: Record<AssetType, SgdbSingular> = {
  icon: "icon",
  logo: "logo",
  hero: "hero",
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface AggregatedCacheEntry {
  results: AssetSearchResult[];
  query: string;
  timestamp: number;
}

function getCacheKey(gameTitle: string, assetType: string): string {
  return `${levelKeys.metadataCache}:img:aggregated:${assetType}:${gameTitle.toLowerCase()}`;
}

async function getCached(
  key: string
): Promise<SearchGameAssetsAggregatedResponse | null> {
  try {
    const entry = await db.get<string, AggregatedCacheEntry>(key, {
      valueEncoding: "json",
    });
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return {
        results: entry.results,
        query: entry.query,
      };
    }
  } catch {
    // Key not found or expired
  }
  return null;
}

async function setCached(
  key: string,
  payload: SearchGameAssetsAggregatedResponse
): Promise<void> {
  const entry: AggregatedCacheEntry = {
    results: payload.results,
    query: payload.query,
    timestamp: Date.now(),
  };
  await db.put<string, AggregatedCacheEntry>(key, entry, {
    valueEncoding: "json",
  });
}

/**
 * Fetches results from a single source by reusing the same dispatch logic as
 * `search-game-assets-multi.ts`. Returns an empty array on failure so a single
 * bad source does not poison the aggregated payload.
 */
async function fetchFromSource(
  source: string,
  title: string,
  assetType: AssetType
): Promise<AssetSearchResult[]> {
  switch (source) {
    case "google":
      return searchGameAssets(title, assetType).then((r) => r.results);
    case "steamgriddb":
      return SteamGridDBApi.searchImages(title, SGDB_MAP[assetType]);
    case "igdb":
      return searchIGDBImages(title, assetType);
    case "steamcdn":
      return searchSteamCDNImages(title, assetType);
    default:
      return [];
  }
}

/**
 * Hydrate the SteamGridDB API key from user preferences once per call so the
 * service can dispatch without the renderer threading the key through IPC.
 */
async function ensureSteamGridDbKey(): Promise<boolean> {
  if (SteamGridDBApi.isConfigured()) return true;
  try {
    const prefs = await db.get<string, UserPreferences | null>(
      levelKeys.userPreferences,
      { valueEncoding: "json" }
    );
    // `steamgriddbApiKey` is written by the renderer settings slice but is
    // not part of the strict UserPreferences schema, so widen like the
    // sibling `search-game-assets-multi.ts` event does.
    const key = (
      prefs as UserPreferences & { steamgriddbApiKey?: string | null }
    )?.steamgriddbApiKey;
    if (key) {
      SteamGridDBApi.setApiKey(key);
      return true;
    }
  } catch {
    // No prefs available — leave key unconfigured
  }
  return false;
}

/**
 * Normalize a URL for deduplication: strip query strings (Steam URL
 * fingerprinting via cache-busters) and lowercase host so equivalent
 * results coming back with different query params collapse together.
 * Returns null for unparseable/empty URLs so the caller can skip them.
 */
function normalizeUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    url.search = "";
    const key = `${url.host.toLowerCase()}${url.pathname}`;
    return key || null;
  } catch {
    logger.warn(`Aggregated search: dropping unparseable url=${rawUrl}`);
    return null;
  }
}

function dedupe(results: AssetSearchResult[]): AssetSearchResult[] {
  const seen = new Set<string>();
  const merged: AssetSearchResult[] = [];
  for (const r of results) {
    const key = normalizeUrl(r.fullImageUrl || r.thumbnailUrl || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }
  return merged;
}

const SOURCE_PRIORITY: Record<string, number> = {
  steamgriddb: 0,
  igdb: 1,
  steamcdn: 2,
  google: 3,
};

// Cap merged results before caching + sorting so LevelDB entries stay
// bounded. Priority sort runs first so the cheapest-to-skip results lose.
const MAX_AGGREGATED_RESULTS = 40;

const searchGameAssetsAggregatedEvent = async (
  _event: Electron.IpcMainInvokeEvent,
  gameTitle: string,
  assetType: AssetType
): Promise<SearchGameAssetsAggregatedResponse> => {
  const trimmedTitle = gameTitle.trim();
  if (!trimmedTitle) {
    return { results: [], query: "" };
  }

  const cacheKey = getCacheKey(trimmedTitle, assetType);
  const cached = await getCached(cacheKey);
  if (cached) {
    logger.log(
      `Aggregated image search cache hit type=${assetType} query="${trimmedTitle}" resultCount=${cached.results.length}`
    );
    return cached;
  }

  // Hydrate SteamGridDB API key from preferences if present.
  await ensureSteamGridDbKey();

  const hasSteamGridDb = SteamGridDBApi.isConfigured();
  const activeSources: string[] = ["google", "igdb", "steamcdn"];
  if (hasSteamGridDb) activeSources.push("steamgriddb");

  logger.log(
    `Aggregated image search start type=${assetType} query="${trimmedTitle}" sources=[${activeSources.join(",")}]`
  );

  const settled = await Promise.allSettled(
    activeSources.map((source) =>
      fetchFromSource(source, trimmedTitle, assetType)
    )
  );

  const merged: AssetSearchResult[] = [];
  const contributingSources: string[] = [];

  settled.forEach((outcome, idx) => {
    const source = activeSources[idx];
    if (outcome.status === "fulfilled" && outcome.value.length > 0) {
      merged.push(...outcome.value);
      contributingSources.push(source);
    } else if (outcome.status === "rejected") {
      logger.warn(
        `Aggregated search source=${source} failed: ${outcome.reason}`
      );
    }
  });

  const deduped = dedupe(merged);

  // Prefer sources in the order: SteamGridDB (curated) → IGDB (canonical) →
  // Steam CDN (official keys) → Google (free-form aggregate). Stable sort
  // keeps source priority while preserving fetch order within a source.
  deduped.sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.sourceName?.toLowerCase?.() ?? ""] ?? 99;
    const pb = SOURCE_PRIORITY[b.sourceName?.toLowerCase?.() ?? ""] ?? 99;
    if (pa !== pb) return pa - pb;
    // Higher confidence (degree of curation) wins when sources tie.
    const wa = a.width ?? 0;
    const wb = b.width ?? 0;
    if (wb !== wa) return wb - wa;
    return 0;
  });

  const trimmed = deduped.slice(0, MAX_AGGREGATED_RESULTS);

  const response: SearchGameAssetsAggregatedResponse = {
    results: trimmed,
    query: trimmedTitle,
  };

  if (response.results.length > 0) {
    await setCached(cacheKey, response);
  }

  logger.log(
    `Aggregated image search done type=${assetType} query="${trimmedTitle}" sources=[${contributingSources.join(",")}] resultCount=${response.results.length}`
  );

  return response;
};

registerEvent("searchGameAssetsAggregated", searchGameAssetsAggregatedEvent);
