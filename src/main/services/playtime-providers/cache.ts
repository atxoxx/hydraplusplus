import type {
  PlaytimeGameData,
  PlaytimeProviderId,
  PlaytimeSearchResult,
} from "./types";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const SEARCH_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const FETCH_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

const searchCache = new Map<string, CacheEntry<PlaytimeSearchResult[]>>();
const fetchCache = new Map<string, CacheEntry<PlaytimeGameData>>();

function searchKey(provider: PlaytimeProviderId, query: string): string {
  return `${provider}::${query.trim().toLowerCase()}`;
}

function fetchKey(provider: PlaytimeProviderId, externalId: string): string {
  return `${provider}::${externalId.trim()}`;
}

function isFresh<T>(entry: CacheEntry<T> | undefined): boolean {
  if (!entry) return false;
  return entry.expiresAt > Date.now();
}

export function getCachedSearch(
  provider: PlaytimeProviderId,
  query: string
): PlaytimeSearchResult[] | null {
  const k = searchKey(provider, query);
  const e = searchCache.get(k);
  if (!isFresh(e)) return null;
  return e?.value ?? null;
}

export function setCachedSearch(
  provider: PlaytimeProviderId,
  query: string,
  results: PlaytimeSearchResult[]
): void {
  searchCache.set(searchKey(provider, query), {
    value: results,
    expiresAt: Date.now() + SEARCH_TTL_MS,
  });
}

export function getCachedFetch(
  provider: PlaytimeProviderId,
  externalId: string
): PlaytimeGameData | null {
  const k = fetchKey(provider, externalId);
  const e = fetchCache.get(k);
  if (!isFresh(e)) return null;
  return e?.value ?? null;
}

export function setCachedFetch(
  provider: PlaytimeProviderId,
  externalId: string,
  value: PlaytimeGameData
): void {
  fetchCache.set(fetchKey(provider, externalId), {
    value,
    expiresAt: Date.now() + FETCH_TTL_MS,
  });
}

/** Evict every cache entry touching a single provider (e.g. on user re-assignment). */
export function invalidateProvider(provider: PlaytimeProviderId): void {
  const prefix = `${provider}::`;
  for (const k of searchCache.keys()) {
    if (k.startsWith(prefix)) searchCache.delete(k);
  }
  for (const k of fetchCache.keys()) {
    if (k.startsWith(prefix)) fetchCache.delete(k);
  }
}
