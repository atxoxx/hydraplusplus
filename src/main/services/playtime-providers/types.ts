export type PlaytimeProviderId = "howlongtobeat" | "backlogged" | "igdb_steam";

export interface PlaytimeProviderMeta {
  id: PlaytimeProviderId;
  displayName: string;
  supportsSubmit: boolean;
  /** Provider-specific logo asset URL (resolved by the renderer at render time) */
  logoUrl: string | null;
}

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

export interface PlaytimeCategory {
  title: string;
  duration: string;
  accuracy: string;
  durationSeconds: number;
}

export interface PlaytimeGameData {
  provider: PlaytimeProviderId;
  providerGameId: string;
  title: string;
  categories: PlaytimeCategory[];
  platforms: string[];
  imageUrl: string | null;
}

export interface PlaytimeProvider {
  id: PlaytimeProviderId;
  search(query: string, signal?: AbortSignal): Promise<PlaytimeSearchResult[]>;
  fetchById(
    externalId: string,
    signal?: AbortSignal
  ): Promise<PlaytimeGameData | null>;
}

export const PROVIDER_META: Record<PlaytimeProviderId, PlaytimeProviderMeta> = {
  howlongtobeat: {
    id: "howlongtobeat",
    displayName: "HowLongToBeat",
    supportsSubmit: true,
    logoUrl: null,
  },
  backlogged: {
    id: "backlogged",
    displayName: "Backlogged",
    supportsSubmit: false,
    logoUrl: null,
  },
  igdb_steam: {
    id: "igdb_steam",
    displayName: "IGDB / Steam",
    supportsSubmit: false,
    logoUrl: null,
  },
};

/** Best-match threshold below which we render the empty state. */
export const AUTO_MATCH_THRESHOLD = 0.65;

/** Threshold below which we mark the confidence chip as "ambiguous". */
export const LOW_CONFIDENCE_THRESHOLD = 0.85;
