export interface SteamGenre {
  id: string;
  name: string;
}

export interface SteamCategory {
  id: number;
  description: string;
}

export interface SteamScreenshot {
  id: number;
  path_thumbnail: string;
  path_full: string;
}

export interface SteamVideoSource {
  max: string;
  "480": string;
}

export interface SteamMovie {
  id: number;
  dash_av1?: string;
  dash_h264?: string;
  hls_h264?: string;
  mp4?: SteamVideoSource;
  webm?: SteamVideoSource;
  thumbnail: string;
  name: string;
  highlight: boolean;
}

export interface SteamAppDetails {
  name: string;
  steam_appid: number;
  detailed_description: string;
  about_the_game: string;
  short_description: string;
  developers: string[];
  publishers: string[];
  genres: SteamGenre[];
  movies?: SteamMovie[];
  supported_languages: string;
  controller_support?: "full" | "partial";
  categories?: SteamCategory[];
  screenshots?: SteamScreenshot[];
  pc_requirements: {
    minimum: string;
    recommended: string;
  };
  mac_requirements: {
    minimum: string;
    recommended: string;
  };
  linux_requirements: {
    minimum: string;
    recommended: string;
  };
  release_date: {
    coming_soon: boolean;
    date: string;
  };
  content_descriptors: {
    ids: number[];
  };
}

export interface SteamShortcut {
  appid: number;
  appname: string;
  Exe: string;
  StartDir: string;
  icon: string;
  ShortcutPath: string;
  LaunchOptions: string;
  IsHidden: boolean;
  AllowDesktopConfig: boolean;
  AllowOverlay: boolean;
  OpenVR: boolean;
  Devkit: boolean;
  DevkitGameID: string;
  DevkitOverrideAppID: boolean;
  LastPlayTime: number;
  FlatpakAppID: string;
}

export interface CreateSteamShortcutOptions {
  openVr?: boolean;
}

export interface SteamPlayerCount {
  currentPlayers: number;
  allTimePeak: number | null;
  trend24h: number | null;
  trend7d: number | null;
  timestamp: number;
}

export interface SteamReviewSummary {
  reviewScoreDescriptor: string;
  totalPositive: number;
  totalNegative: number;
  totalReviews: number;
  reviewScore: number;
  recentReviewScoreDescriptor: string | null;
  recentPositive: number | null;
  recentNegative: number | null;
  recentTotal: number | null;
  recentReviewScore: number | null;
}

export interface SteamReviewHistoryPoint {
  date: string;
  positive: number;
  negative: number;
  total: number;
}

export interface SteamPlayerHistoryPoint {
  date: string;
  players: number;
}

export interface SteamReviewAnalysis {
  summary: SteamReviewSummary;
  history: SteamReviewHistoryPoint[];
  languageBreakdown: { language: string; count: number }[];
  playerHistory: SteamPlayerHistoryPoint[];
}

/* --- Steam reviews list (paginated, Playnite ReviewViewer parity) --- */

export interface SteamReviewAuthor {
  steamid: string;
  personaname: string;
  /** Resolved profile URL derived from steamid. */
  profileUrl: string;
  num_games_owned: number;
  num_reviews: number;
  /** Total playtime in minutes. */
  playtime_forever: number;
  /** Last two weeks playtime in minutes. */
  playtime_last_two_weeks: number;
  /** Playtime in minutes at the moment the review was written. */
  playtime_at_review: number;
  last_played: number;
}

export interface SteamReview {
  recommendationid: number;
  author: SteamReviewAuthor;
  language: string;
  /** Plain-text body with Steam BBCode stripped. */
  review: string;
  timestamp_created: number;
  timestamp_updated: number;
  voted_up: boolean;
  votes_up: number;
  votes_funny: number;
  weighted_vote_score: string;
  comment_count: number;
  steam_purchase: boolean;
  received_for_free: boolean;
  written_during_early_access: boolean;
}

export interface SteamReviewQuerySummary {
  num_reviews: number;
  review_score: number;
  review_score_desc: string;
  total_positive: number;
  total_negative: number;
  total_reviews: number;
}

export interface SteamReviewsPage {
  reviews: SteamReview[];
  cursor: string;
  query_summary: SteamReviewQuerySummary;
}

export type SteamReviewSortFilter = "all" | "recent" | "funny";
export type SteamReviewTypeFilter = "all" | "positive" | "negative";
export type SteamReviewPurchaseTypeFilter =
  | "all"
  | "steam"
  | "non_steam_purchase";

/** Subset of Steam language codes we'll surface in the filter dropdown. */
export type SteamReviewLanguageFilter =
  | "all"
  | "english"
  | "schinese"
  | "tchinese"
  | "japanese"
  | "koreana"
  | "russian"
  | "french"
  | "german"
  | "spanish"
  | "latam"
  | "portuguese"
  | "brazilian"
  | "polish"
  | "turkish"
  | "thai"
  | "ukrainian"
  | "vietnamese"
  | "italian"
  | "indonesian"
  | "arabic";

export interface SteamReviewFilters {
  /** Cursor returned from previous page; use "*" (the default) for first page. */
  cursor?: string;
  filter: SteamReviewSortFilter;
  reviewType: SteamReviewTypeFilter;
  purchaseType: SteamReviewPurchaseTypeFilter;
  language: SteamReviewLanguageFilter;
  /** When `filter === "recent"`, narrow to last N days. */
  dayRange?: number;
  /** Minimum playtime at review, in minutes (0 = no lower bound). */
  playtimeMinMinutes: number;
  /** Maximum playtime at review, in minutes (0 = no upper bound). */
  playtimeMaxMinutes: number;
  /** Defaults to 20 in the service layer; max 100 (Steam hard cap). */
  numPerPage?: number;
}

/* --- Persistent Steam AppID mapping for non-Steam (locally added) games --- */

/**
 * How the Steam AppID was resolved for a game whose native shop is not Steam.
 * Persisted in a LevelDB sublevel keyed by `${shop}:${objectId}` so that
 * Steam reviews / player count keep working across restarts and don't fall back
 * to a rate-limited, ambiguous-by-title Steam store search every visit.
 *  - `title_search`: resolved via the Steam store search API by game title.
 *  - `linked`: derived from a catalogue record the user explicitly linked.
 */
export type SteamAppIdMappingSource = "title_search" | "linked";

export interface SteamAppIdMapping {
  /** Resolved Steam AppID. */
  steamAppId: number;
  /** Epoch milliseconds when this mapping was resolved. */
  resolvedAt: number;
  /** How the mapping was originally discovered. */
  source: SteamAppIdMappingSource;
}
