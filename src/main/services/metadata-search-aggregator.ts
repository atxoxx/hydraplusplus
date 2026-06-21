import axios from "axios";
import { HydraApi } from "./hydra-api";
import { getSteamAppDetails } from "./steam";
import { networkLogger as logger } from "./logger";
import type { MetadataSearchResult } from "@types";
import type { SteamAppDetails } from "@types";

/**
 * Normalized candidate shape returned by `searchCatalogue`.
 */
interface CatalogueCandidate {
  title: string;
  objectId: string;
  shop: string;
  iconUrl: string | null;
  // Optional warm fields the catalogue sometimes returns:
  genres?: string[];
  developers?: string[];
  publishers?: string[];
  releaseYear?: number | null;
  description?: string;
}

const STEAM_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Pull a broad list of candidate games from the Hydra catalogue. We intentionally
 * do NOT restrict by shop here because the catalogue already indexes IGDB-sourced
 * data for ALL shops — the user can refine later by source tab.
 */
async function searchCatalogue(
  query: string,
  limit: number,
  shopFilter?: string,
  language?: string
): Promise<CatalogueCandidate[]> {
  try {
    const results = await HydraApi.get<CatalogueCandidate[]>(
      "/catalogue/search/suggestions",
      {
        query,
        limit,
        ...(shopFilter ? { shop: shopFilter } : {}),
        ...(language ? { language } : {}),
      },
      { needsAuth: false }
    );
    return Array.isArray(results) ? results : [];
  } catch (err) {
    logger.error("Catalogue search failed:", err);
    return [];
  }
}

/**
 * Enrich a single Steam candidate using the official Steam appdetails endpoint.
 * Returns null on failure — callers must fall back to catalogue-suggestion values.
 */
async function enrichSteamCandidate(
  appId: string,
  language?: string
): Promise<Partial<MetadataSearchResult>> {
  try {
    const details = await getSteamAppDetails(appId, language || "english");
    if (!details) return {};
    return mapSteamDetails(details);
  } catch (err) {
    logger.error(`Steam enrichment failed for app ${appId}:`, err);
    return {};
  }
}

function mapSteamDetails(
  details: SteamAppDetails
): Partial<MetadataSearchResult> {
  const yearMatch = details.release_date?.date?.match(/(\d{4})/);
  const releaseYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
  return {
    title: details.name,
    description:
      details.short_description ||
      details.about_the_game ||
      details.detailed_description ||
      "",
    developers: Array.isArray(details.developers) ? details.developers : [],
    publishers: Array.isArray(details.publishers) ? details.publishers : [],
    genres: Array.isArray(details.genres)
      ? details.genres.map((g) => g.name)
      : [],
    releaseYear,
    tags: Array.isArray(details.categories)
      ? details.categories.map((c) => c.description)
      : [],
  };
}

/**
 * Enrich a non-Steam candidate by calling the catalogue's game-detail endpoint.
 *
 * NOTE: only the `launchbox` and `steam` shops have full detail backends in
 * this repo; other shops (epic, gog, etc.) hit a stub that returns nothing
 * useful. We guard the call so a 404 / empty payload doesn't take down the
 * whole enrichment batch.
 */
async function enrichHydraCandidate(
  shop: string,
  objectId: string
): Promise<Partial<MetadataSearchResult>> {
  // The general `/games/:shop/:objectId` endpoint only returns useful data for
  // launchbox; for everything else the catalogue suggestion fields are the
  // best we'll get. Bail early so we don't log spurious "Failed to fetch" errors.
  if (!shop || !objectId) return {};
  if (shop !== "launchbox" && shop !== "steam") return {};
  try {
    const response = await HydraApi.get<{
      title?: string;
      description?: string;
      developers?: string[];
      publishers?: string[];
      genres?: string[];
      releaseYear?: number | null;
      releaseDate?: string | null;
    } | null>(`/games/${shop}/${objectId}`, null, { needsAuth: false });

    if (!response) return {};
    return {
      title: response.title,
      description: response.description ?? "",
      developers: Array.isArray(response.developers) ? response.developers : [],
      publishers: Array.isArray(response.publishers) ? response.publishers : [],
      genres: Array.isArray(response.genres) ? response.genres : [],
      releaseYear:
        typeof response.releaseYear === "number" ? response.releaseYear : null,
    };
  } catch (err) {
    logger.error(`Hydra enrichment failed for ${shop}:${objectId}:`, err);
    return {};
  }
}

/**
 * Map a candidate + enrichment patch to the public `MetadataSearchResult` shape,
 * always producing sane defaults so the modal never renders `undefined`.
 */
function buildResult(
  candidate: CatalogueCandidate,
  patch: Partial<MetadataSearchResult>
): MetadataSearchResult {
  return {
    title: patch.title ?? candidate.title ?? "",
    objectId: candidate.objectId,
    shop: candidate.shop,
    source: patch.source ?? candidate.shop, // truthful label
    iconUrl: patch.iconUrl ?? candidate.iconUrl ?? null,
    genres: Array.isArray(patch.genres)
      ? patch.genres
      : Array.isArray(candidate.genres)
        ? candidate.genres
        : [],
    developers: Array.isArray(patch.developers)
      ? patch.developers
      : Array.isArray(candidate.developers)
        ? candidate.developers
        : [],
    publishers: Array.isArray(patch.publishers)
      ? patch.publishers
      : Array.isArray(candidate.publishers)
        ? candidate.publishers
        : [],
    tags: patch.tags,
    releaseYear:
      typeof patch.releaseYear === "number"
        ? patch.releaseYear
        : typeof candidate.releaseYear === "number"
          ? candidate.releaseYear
          : null,
    description: patch.description ?? candidate.description ?? "",
    similarityScore: 1,
  };
}

/**
 * Enrichment entry point — dispatches per-shop.
 * Steam gets full Steam appdetails; everything else gets the catalogue detail endpoint.
 */
async function enrichCandidate(
  candidate: CatalogueCandidate,
  language?: string
): Promise<Partial<MetadataSearchResult>> {
  if (candidate.shop === "steam" && /^\d+$/.test(candidate.objectId)) {
    return enrichSteamCandidate(candidate.objectId, language);
  }
  return enrichHydraCandidate(candidate.shop, candidate.objectId);
}

/**
 * Run with a small concurrency limit. Each item runs in an isolated try/catch
 * so a single failure (e.g. Steam rate-limit) never takes down the whole batch.
 */
async function withConcurrencyLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const safeFn = async (item: T): Promise<R | null> => {
    try {
      return await fn(item);
    } catch (err) {
      logger.error("Aggregator worker failed:", err);
      return null;
    }
  };
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        results[idx] = (await safeFn(items[idx])) as R;
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/**
 * Try a direct Steam store search, but tolerate explicit 429/403 rate-limits and
 * network errors by returning an empty list — the caller will fall back to the
 * catalogue path so the user always sees something useful.
 */
async function searchSteamStoreSafe(
  query: string,
  limit: number,
  language?: string
): Promise<MetadataSearchResult[]> {
  try {
    const response = await axios.get<{
      items?: Array<{ id: number; name: string; tiny_image?: string }>;
    }>(`https://store.steampowered.com/api/storesearch`, {
      params: { term: query, l: language || "english" },
      timeout: 6000,
      headers: { "User-Agent": STEAM_CHROME_UA },
      validateStatus: () => true,
    });

    if (response.status === 200 && Array.isArray(response.data?.items)) {
      const items = response.data.items.slice(0, limit);
      return items.map((it) => ({
        title: it.name,
        objectId: String(it.id),
        shop: "steam",
        source: "steam",
        iconUrl: it.tiny_image ?? null,
        genres: [],
        developers: [],
        publishers: [],
        releaseYear: null,
        description: "",
        similarityScore: 1,
      }));
    }
    if (response.status === 429 || response.status === 403) {
      logger.warn(
        `Steam store search rate-limited (${response.status}), falling back to catalogue.`
      );
    }
    return [];
  } catch (err) {
    logger.error("Steam store search threw:", err);
    return [];
  }
}

/**
 * Public: "all sources" search.
 *
 *  1. Try direct Steam store search — fastest when it works.
 *  2. In parallel, search the Hydra catalogue (broad).
 *  3. Merge candidates by `(shop, objectId)`.
 *  4. Enrich EVERY remaining candidate with full metadata.
 *  5. Mark the source truthfully so the UI can show "Steam" vs "Catalogue" per row.
 */
export async function searchAllSources(
  query: string,
  limit: number,
  language?: string
): Promise<MetadataSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const [steamResults, catalogueCandidates] = await Promise.all([
    searchSteamStoreSafe(trimmed, limit, language),
    searchCatalogue(trimmed, limit, undefined, language),
  ]);

  // Merge and dedupe by (shop, objectId); prefer Steam-direct hits because
  // they already have a confirmed shop:objectId pair.
  const seen = new Set<string>();
  const merged: Array<{
    candidate: CatalogueCandidate;
    steamHit?: MetadataSearchResult;
  }> = [];

  for (const hit of steamResults) {
    const key = `${hit.shop}:${hit.objectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      candidate: {
        title: hit.title,
        objectId: hit.objectId,
        shop: hit.shop,
        iconUrl: hit.iconUrl,
      },
      steamHit: hit,
    });
  }

  for (const c of catalogueCandidates) {
    const key = `${c.shop}:${c.objectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ candidate: c });
  }

  // Enrich in parallel. Steam-direct hits ALSO get enriched (their catalogue
  // candidate is already mostly empty) so the modal gets full metadata.
  const enriched = await withConcurrencyLimit(
    merged.slice(0, limit),
    async (entry) => {
      const patch = await enrichCandidate(entry.candidate, language);
      const result = buildResult(entry.candidate, {
        ...patch,
        source: entry.steamHit ? "steam" : entry.candidate.shop,
      });
      return result;
    },
    4
  );

  // Drop empty results so the modal never shows blank rows.
  return enriched.filter((r) => r.title && r.objectId && r.shop);
}

/**
 * Public: search via Steam only, with graceful fallback to the catalogue when
 * the Steam endpoint is blocked or returns nothing.
 */
export async function searchSteamFirst(
  query: string,
  limit: number,
  language?: string
): Promise<MetadataSearchResult[]> {
  const direct = await searchSteamStoreSafe(query, limit, language);
  if (direct.length > 0 && direct.some((r) => r.developers || r.genres)) {
    // Already enriched via Steam appdetails upstream path in some cases; if
    // not, the caller reuses the catalogue path.
    return direct;
  }

  // Fall back to catalogue restricted to steam:shop + enrich every result.
  const candidates = await searchCatalogue(query, limit, "steam", language);
  if (candidates.length === 0) return direct;

  const enriched = await withConcurrencyLimit(
    candidates,
    async (c) => {
      const patch = await enrichSteamCandidate(c.objectId, language);
      return buildResult(c, { ...patch, source: "steam" });
    },
    3
  );
  return enriched.filter((r) => r.title);
}
