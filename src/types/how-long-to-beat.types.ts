/* Existing shape — kept for backwards compatibility with the Hydra
   cloud endpoint that returns this list directly. */
export interface HowLongToBeatCategory {
  title: string;
  duration: string;
  accuracy: string;
}

export interface HowLongToBeatGameData {
  id: number;
  name: string;
  categories: HowLongToBeatCategory[];
  reviewScore: number;
  platforms: string[];
  imageUrl: string | null;
  similarityScore: number;
}

export interface HowLongToBeatProgress {
  category: string;
  userPlaytimeSeconds: number;
  estimatedSeconds: number;
  progressPercent: number;
  remainingSeconds: number;
}

/* ---------- Multi-provider playtime model (new) ---------- */

export type PlaytimeProviderId = "howlongtobeat" | "backlogged" | "igdb_steam";

export type PlaytimeMappingSource = "manual" | "auto";

/** A persisted, per-game link to a third-party playtime provider entry. */
export interface PlaytimeMapping {
  provider: PlaytimeProviderId;
  externalId: string;
  source: PlaytimeMappingSource;
  matchedSimilarityScore?: number;
  updatedAt: string;
}

/** Standardized search hit returned by any provider. */
export interface PlaytimeSearchResult {
  provider: PlaytimeProviderId;
  providerGameId: string;
  title: string;
  releaseYear: number | null;
  platforms: string[];
  imageUrl: string | null;
  similarityScore: number;
  estimatedSeconds: number | null;
}

/** A single normalized playtime category ("Main Story", "100%", "Solo"...). */
export interface PlaytimeCategory {
  title: string;
  duration: string;
  accuracy: string;
  durationSeconds: number;
}

/** Full data for a single provider entry — what the card renders. */
export interface PlaytimeGameData {
  provider: PlaytimeProviderId;
  providerGameId: string;
  title: string;
  categories: PlaytimeCategory[];
  platforms: string[];
  imageUrl: string | null;
}
