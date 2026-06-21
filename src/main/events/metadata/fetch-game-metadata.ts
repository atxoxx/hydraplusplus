import { ipcMain } from "electron";
import { MetadataFetcher } from "@main/services/metadata-fetcher";
import {
  getMetadataCache,
  setMetadataCache,
} from "@main/level/sublevels/metadata-cache";
import {
  searchAllSources,
  searchSteamFirst,
} from "@main/services/metadata-search-aggregator";
import { VNDBApi } from "@main/services/vndb-api";
import { SteamGridDBApi } from "@main/services/steamgriddb-api";
import { PCGamingWikiAPI } from "@main/services/pcgamingwiki-api";
import { IGNMetadataService } from "@main/services/ign-metadata";
import { networkLogger as logger } from "@main/services/logger";
import type { MetadataSearchResult } from "@types";

ipcMain.handle(
  "fetchGameMetadata",
  async (_event, shop: string, objectId: string, gameTitle: string) => {
    try {
      const cached = await getMetadataCache(shop, objectId);
      if (cached) {
        return cached.metadata;
      }

      const metadata = await MetadataFetcher.fetchMetadata(
        shop,
        objectId,
        gameTitle
      );

      if (metadata) {
        const sources = Object.values(metadata.sources).filter(
          (s): s is string => s !== undefined
        );
        await setMetadataCache(shop, objectId, metadata, sources);
      }

      return metadata;
    } catch (error) {
      logger.error("fetchGameMetadata IPC handler failed:", error);
      return null;
    }
  }
);

/**
 * `searchGameMetadata` is the entry-point used by the metadata-search modal.
 *
 * Source tabs supported:
 *  - "all"  — default; fan-out across Steam Store + Hydra catalogue + VNDB,
 *             merge, dedupe, and enrich every candidate. This is the path
 *             the user gets when they open the modal — it almost never
 *             returns zero usable rows because at least the catalogue hits.
 *  - "steam" — Steam Store search; falls back to catalogue (steam-only) if
 *             blocked or empty. Each result is enriched via Steam appdetails.
 *  - "vndb"  — VNDB visual-novel search, useful for non-game VNs.
 *  - "igdb" / "hydra" — deprecated names kept for backward compatibility
 *             so old builds don't break; both behave like "all".
 */

ipcMain.handle(
  "searchGameMetadata",
  async (
    _event,
    query: string,
    source: string,
    shop?: string,
    language?: string
  ): Promise<MetadataSearchResult[]> => {
    try {
      const trimmed = (query ?? "").trim();
      if (trimmed.length < 2) return [];

      const limit = 10;
      const normalized = (source ?? "all").toLowerCase();
      const lang = language || "english";

      if (normalized === "vndb") {
        return searchVnDb(trimmed, limit);
      }

      if (normalized === "steam") {
        return searchSteamFirst(trimmed, limit, lang);
      }

      if (normalized === "steamgriddb") {
        return searchSteamGridDB(trimmed, limit);
      }

      if (normalized === "pcgamingwiki") {
        return searchPCGamingWiki(trimmed, limit);
      }

      if (normalized === "ign") {
        return searchIGN(trimmed, limit);
      }

      // Default: "all" / legacy "igdb" / legacy "hydra" — fan out everywhere.
      const [broad, vn] = await Promise.all([
        searchAllSources(trimmed, limit, lang),
        searchVnDb(trimmed, 2).catch(() => []),
      ]);
      // If the user's `shop` parameter is set (e.g. game is on "steam"), keep
      // matching candidates ahead; otherwise preserve the merged order.
      const filtered = shop
        ? [
            ...broad.filter((r) => r.shop === shop),
            ...broad.filter((r) => r.shop !== shop),
          ]
        : broad;
      return [...filtered, ...vn].slice(0, limit);
    } catch (error) {
      logger.error("searchGameMetadata IPC handler failed:", error);
      return [];
    }
  }
);

async function searchVnDb(
  query: string,
  limit: number
): Promise<MetadataSearchResult[]> {
  try {
    const items = await VNDBApi.searchMany(query, limit);
    if (!items || items.length === 0) return [];
    return items.map((vn) => ({
      title: vn.title,
      objectId: vn.id,
      shop: "custom",
      source: "vndb",
      iconUrl: vn.image?.url || null,
      genres: (vn.tags || [])
        .filter((t) => t.category === "genre")
        .map((t) => t.name),
      developers: (vn.developers || []).map((d) => d.name),
      publishers: [],
      releaseYear: vn.released
        ? parseInt((vn.released.match(/(\d{4})/) || ["", ""])[1], 10) || null
        : null,
      description: (vn.tags || [])
        .filter((t) => (t.spoiler ?? 2) <= 1)
        .slice(0, 8)
        .map((t) => t.name)
        .filter((name, idx, arr) => arr.indexOf(name) === idx)
        .join(", "),
      similarityScore: 1,
    }));
  } catch (err) {
    logger.error("VNDB searchMany failed in fetch-game-metadata:", err);
    return [];
  }
}

async function searchSteamGridDB(
  query: string,
  limit: number
): Promise<MetadataSearchResult[]> {
  try {
    if (!SteamGridDBApi.isConfigured()) {
      const { db } = await import("@main/level");
      const { levelKeys } = await import("@main/level/sublevels");
      const prefs = await db
        .get<string, any>(levelKeys.userPreferences, { valueEncoding: "json" })
        .catch(() => null);
      const key = prefs?.steamgriddbApiKey;
      if (key) {
        SteamGridDBApi.setApiKey(key);
      }
    }

    if (!SteamGridDBApi.isConfigured()) {
      return [];
    }

    const games = await SteamGridDBApi.autocomplete(query);
    return games.slice(0, limit).map((game) => ({
      title: game.name,
      objectId: String(game.id),
      shop: "custom",
      source: "steamgriddb",
      iconUrl: null,
      genres: [],
      developers: [],
      publishers: [],
      releaseYear: null,
      description: "SteamGridDB Entry",
      similarityScore: 1,
    }));
  } catch (err) {
    logger.error("SteamGridDB search in fetch-game-metadata failed:", err);
    return [];
  }
}

async function searchPCGamingWiki(
  query: string,
  limit: number
): Promise<MetadataSearchResult[]> {
  try {
    const pages = await PCGamingWikiAPI.searchPages(query, limit);
    return pages.map((page) => ({
      title: page.title,
      objectId: String(page.pageid),
      shop: "custom",
      source: "pcgamingwiki",
      iconUrl: null,
      genres: [],
      developers: [],
      publishers: [],
      releaseYear: null,
      description: page.extract || `PCGamingWiki article for ${page.title}`,
      similarityScore: 1,
    }));
  } catch (err) {
    logger.error("PCGamingWiki search in fetch-game-metadata failed:", err);
    return [];
  }
}

async function searchIGN(
  query: string,
  _limit: number
): Promise<MetadataSearchResult[]> {
  try {
    const review = await IGNMetadataService.getReviewData(query);
    if (review && (review.score || review.summary)) {
      return [
        {
          title: query,
          objectId: query,
          shop: "custom",
          source: "ign",
          iconUrl: null,
          genres: [],
          developers: [],
          publishers: [],
          releaseYear: null,
          description:
            review.summary ||
            review.verdict ||
            `IGN Review Score: ${review.score}/10`,
          similarityScore: 1,
        },
      ];
    }
    return [];
  } catch (err) {
    logger.error("IGN search in fetch-game-metadata failed:", err);
    return [];
  }
}
