import axios from "axios";
import { logger } from "./logger";
import type {
  SteamPlayerCount,
  SteamReview,
  SteamReviewSummary,
  SteamReviewAnalysis,
  SteamReviewsPage,
  SteamReviewFilters,
} from "@types";

const STEAM_API_BASE = "https://api.steampowered.com";
const STEAM_STORE_API = "https://store.steampowered.com/api";
const STEAM_STORE_REVIEWS_API = "https://store.steampowered.com";
const STEAMSPY_API = "https://steamspy.com/api.php";
const STEAMCHARTS_URL = "https://steamcharts.com/app";

const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

const playerCountCache = new Map<
  string,
  { data: SteamPlayerCount; timestamp: number }
>();
const reviewSummaryCache = new Map<
  string,
  { data: SteamReviewSummary; timestamp: number }
>();
const reviewsPageCache = new Map<
  string,
  { data: SteamReviewsPage; timestamp: number }
>();

function getCached<T>(
  cache: Map<string, { data: T; timestamp: number }>,
  key: string
): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCache<T>(
  cache: Map<string, { data: T; timestamp: number }>,
  key: string,
  data: T
): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Get current player count from Steam's official API.
 * Endpoint: ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid={appid}
 */
export async function getCurrentPlayerCount(
  appId: number
): Promise<number | null> {
  try {
    const response = await axios.get<{
      response: { player_count: number; result: number };
    }>(`${STEAM_API_BASE}/ISteamUserStats/GetNumberOfCurrentPlayers/v1/`, {
      params: { appid: appId },
      timeout: 8000,
    });

    if (response.data?.response?.result === 1) {
      return response.data.response.player_count;
    }
    return null;
  } catch (err) {
    logger.error("Failed to fetch current player count", err);
    return null;
  }
}

/**
 * Get all-time peak from SteamSpy API.
 * SteamSpy endpoint: ?request=appdetails&appid={appid}
 * Returns ccu (concurrent users) field which represents the peak.
 */
export async function getSteamSpyPeak(appId: number): Promise<number | null> {
  try {
    const response = await axios.get<{ ccu?: number }>(STEAMSPY_API, {
      params: { request: "appdetails", appid: appId },
      timeout: 8000,
    });

    if (response.data?.ccu && response.data.ccu > 0) {
      return response.data.ccu;
    }
    return null;
  } catch (err) {
    logger.error("Failed to fetch SteamSpy peak data", err);
    return null;
  }
}

/**
 * Scrape SteamCharts.com for trend data (24h and 7d change percentages)
 * and all-time peak as a fallback.
 */
export async function scrapeSteamChartsData(appId: number): Promise<{
  allTimePeak: number | null;
  trend24h: number | null;
  trend7d: number | null;
} | null> {
  try {
    const response = await axios.get<string>(`${STEAMCHARTS_URL}/${appId}`, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const html = response.data;

    // Try to parse the all-time peak from the page
    // SteamCharts typically shows: "all-time peak: X,XXX"
    const peakMatch = html.match(/all-time peak[:\s]*([\d,]+)/i);
    const allTimePeak = peakMatch
      ? parseInt(peakMatch[1].replace(/,/g, ""), 10)
      : null;

    // Try to parse 24h and 7d trend percentages
    // SteamCharts shows percentage changes like "+12.5%" or "-5.3%"
    const trend24hMatch = html.match(
      /(?:24h|24 hour|past 24 hours)[^<]*?([+-]?\d+\.?\d*)\s*%/i
    );
    const trend7dMatch = html.match(
      /(?:7d|7 day|past 7 days|past week)[^<]*?([+-]?\d+\.?\d*)\s*%/i
    );

    const trend24h = trend24hMatch ? parseFloat(trend24hMatch[1]) : null;
    const trend7d = trend7dMatch ? parseFloat(trend7dMatch[1]) : null;

    return { allTimePeak, trend24h, trend7d };
  } catch (err) {
    logger.error("Failed to scrape SteamCharts", err);
    return null;
  }
}

/**
 * Get the full player count data combining multiple sources.
 * 1. Current players: Steam API
 * 2. All-time peak: SteamSpy → SteamCharts fallback
 * 3. Trends: SteamCharts scraping
 */
export async function getSteamPlayerCountData(
  appId: number
): Promise<SteamPlayerCount | null> {
  const cacheKey = `player_count:${appId}`;
  const cached = getCached(playerCountCache, cacheKey);
  if (cached) return cached;

  const currentPlayers = await getCurrentPlayerCount(appId);
  if (currentPlayers === null) {
    return null;
  }

  const [steamSpyPeak, steamChartsData] = await Promise.all([
    getSteamSpyPeak(appId),
    scrapeSteamChartsData(appId),
  ]);

  const allTimePeak = steamSpyPeak ?? steamChartsData?.allTimePeak ?? null;

  const result: SteamPlayerCount = {
    currentPlayers,
    allTimePeak,
    trend24h: steamChartsData?.trend24h ?? null,
    trend7d: steamChartsData?.trend7d ?? null,
    timestamp: Date.now(),
  };

  setCache(playerCountCache, cacheKey, result);
  return result;
}

// ---- Steam Reviews API DTOs (based on Playnite ReviewViewer reference) ----

interface SteamReviewsResponse {
  success: number;
  query_summary: {
    num_reviews: number;
    review_score: number;
    review_score_desc: string;
    total_positive: number;
    total_negative: number;
    total_reviews: number;
  };
  reviews: SteamReviewRaw[];
  cursor: string;
}

interface SteamReviewRaw {
  recommendationid: number;
  author: {
    steamid: string;
    personaname: string;
    num_games_owned: number;
    num_reviews: number;
    playtime_forever: number;
    playtime_last_two_weeks: number;
    playtime_at_review: number;
    last_played: number;
  };
  language: string;
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

/**
 * Strip Steam's BBCode tags and normalize line breaks so the renderer can show
 * the body as plain text.
 *
 * Supported in Steam reviews: `[b]`, `[i]`, `[u]`, `[s]`, `[strike]`,
 * `[code]`, `[spoiler]`, `[url]…[/url]`, `[list]`, `[*]`, `[h1]`, etc.
 * We strip them all and assign `\\n` to closing list items.
 */
function stripSteamBbCode(input: string): string {
  if (!input) return "";
  let text = input;

  // Convert list items to a newline so multi-item lists stay readable.
  text = text.replace(/\[\*\]/g, "\n• ");
  text = text.replace(/\[\/list\]/gi, "\n");
  text = text.replace(/\[list(?:=[^\]]+)?\]/gi, "");

  // Convert heading markers to plain newlines.
  text = text.replace(/\[\/?h[1-6]\]/gi, "\n");

  // Strip all remaining tags (opening/closing/self-closing).
  text = text.replace(/\[[^\]]*\]/g, "");

  // Collapse multiple blank lines.
  text = text.replace(/\n{2,}/g, "\n\n");

  return text.trim();
}

/** Adapt a raw Steam review to the public SteamReview type. */
function adaptSteamReview(raw: SteamReviewRaw): SteamReview {
  return {
    ...raw,
    author: {
      ...raw.author,
      profileUrl: `https://steamcommunity.com/profiles/${raw.author.steamid}`,
    },
    review: stripSteamBbCode(raw.review),
  };
}

interface SteamReviewSummaryRaw {
  totalPositive: number;
  totalNegative: number;
  totalReviews: number;
  reviewScore: number;
  reviewScoreDesc: string;
}

/**
 * Build the Steam reviews API URL matching the Playnite ReviewViewer reference.
 * Uses proper cursor-based pagination, language filters, review type, purchase type,
 * date range, playtime filters, display mode, and helpful system.
 */
function buildSteamReviewsUrl(
  appId: number,
  options: {
    cursor?: string;
    filter?: "summary" | "all" | "recent" | "funny";
    reviewType?: "all" | "positive" | "negative";
    purchaseType?: "all" | "steam" | "non_steam_purchase";
    language?: string;
    dayRange?: number;
    playtimeMinMinutes?: number;
    playtimeMaxMinutes?: number;
    numPerPage?: number;
  } = {}
): string {
  const {
    cursor = "*",
    filter = "summary",
    reviewType = "all",
    purchaseType = "all",
    language = "all",
    dayRange,
    playtimeMinMinutes,
    playtimeMaxMinutes,
    numPerPage = 20,
  } = options;

  const params = new URLSearchParams();
  params.set("json", "1");
  params.set("cursor", cursor);
  params.set("filter", filter);
  params.set("language", language);
  params.set("review_type", reviewType);
  params.set("purchase_type", purchaseType);
  params.set("num_per_page", String(numPerPage));

  // Filter offtopic activity by default
  params.set("filter_offtopic_activity", "1");

  // Interface language (separate from review language)
  params.set("l", "english");

  // Date range for "recent" reviews — when dayRange is set, use it exclusively
  if (dayRange) {
    params.set("day_range", String(dayRange));
  } else {
    // Lifetime date range
    params.set("date_range_type", "all");
    params.set("start_date", "-1");
    params.set("end_date", "-1");
  }

  // Optional playtime filter — the Steam API expects 0 / 0 to mean "no bound"
  params.set("playtime_filter_min", String(playtimeMinMinutes ?? 0));
  params.set("playtime_filter_max", String(playtimeMaxMinutes ?? 0));

  // All device types
  params.set("playtime_type", "all");

  // Use Steam's review quality/helpfulness system
  params.set("use_review_quality", "1");

  return `${STEAM_STORE_REVIEWS_API}/appreviews/${appId}?${params.toString()}`;
}

/**
 * Fetch a single page of Steam reviews.
 */
async function fetchReviewPage(
  appId: number,
  options: {
    cursor?: string;
    filter?: "summary" | "all" | "recent" | "funny";
    language?: string;
    dayRange?: number;
    numPerPage?: number;
  } = {},
  signal?: AbortSignal
): Promise<SteamReviewsResponse | null> {
  try {
    const url = buildSteamReviewsUrl(appId, options);
    const response = await axios.get<SteamReviewsResponse>(url, {
      timeout: 12000,
      signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    if (response.data?.success === 1) {
      return response.data;
    }
    return null;
  } catch (err) {
    if (axios.isAxiosError(err) && err.code === "ERR_CANCELED") return null;
    logger.error("Failed to fetch Steam review page", err);
    return null;
  }
}

/**
 * Get review summary from Steam Store API.
 * Uses filter=summary to get only the query_summary without review text.
 */
async function getReviewSummaryRaw(
  appId: number,
  dayRange?: number
): Promise<SteamReviewSummaryRaw | null> {
  const page = await fetchReviewPage(appId, {
    filter: "summary",
    dayRange,
    numPerPage: 0,
  });

  if (page?.query_summary) {
    const s = page.query_summary;
    return {
      totalPositive: s.total_positive,
      totalNegative: s.total_negative,
      totalReviews: s.total_reviews,
      reviewScore: s.review_score,
      reviewScoreDesc: s.review_score_desc,
    };
  }
  return null;
}

/**
 * Get the full review summary (all-time + recent 30 days).
 */
export async function getSteamReviewSummaryData(
  appId: number
): Promise<SteamReviewSummary | null> {
  // v2 cache key — bumps when the `reviewScore` shape changed from
  // Steam's 0-10 bucket index to a true 0-100 percentage. Bypasses the
  // 5-minute in-memory TTL on rollout so users see the fix immediately.
  const cacheKey = `review_summary:v2:${appId}`;
  const cached = getCached(reviewSummaryCache, cacheKey);
  if (cached) return cached;

  const [allTime, recent] = await Promise.all([
    getReviewSummaryRaw(appId),
    getReviewSummaryRaw(appId, 30),
  ]);

  if (!allTime) return null;

  // Steam's `review_score` is a 0-10 bucket index (e.g. 8 = "Very Positive"),
  // not a percentage. Compute the actual positive ratio from totals so the UI
  // displays a real percentage (matches Steam's storefront text and the bar
  // fill width we already render).
  const calculateScore = (
    positive: number | null,
    total: number | null
  ): number => {
    if (!positive || !total || total <= 0) return 0;
    return Math.round((positive / total) * 100);
  };

  const result: SteamReviewSummary = {
    reviewScoreDescriptor: allTime.reviewScoreDesc,
    totalPositive: allTime.totalPositive,
    totalNegative: allTime.totalNegative,
    totalReviews: allTime.totalReviews,
    reviewScore: calculateScore(allTime.totalPositive, allTime.totalReviews),
    recentReviewScoreDescriptor: recent?.reviewScoreDesc ?? null,
    recentPositive: recent?.totalPositive ?? null,
    recentNegative: recent?.totalNegative ?? null,
    recentTotal: recent?.totalReviews ?? null,
    recentReviewScore: recent
      ? calculateScore(recent.totalPositive, recent.totalReviews)
      : null,
  };

  setCache(reviewSummaryCache, cacheKey, result);
  return result;
}

/**
 * Single pagination pass that collects BOTH language breakdown
 * and review history from Steam reviews. Avoids duplicating API calls.
 * Fetches up to 10 pages max (up to 1000 reviews with numPerPage=100).
 */
async function collectReviewData(
  appId: number,
  signal?: AbortSignal
): Promise<{
  languageBreakdown: { language: string; count: number }[];
  history: {
    date: string;
    positive: number;
    negative: number;
    total: number;
  }[];
}> {
  const languageCounts = new Map<string, number>();
  const monthlyBuckets = new Map<
    string,
    { positive: number; negative: number }
  >();
  let cursor = "*";
  const maxPages = 10;

  for (let page = 0; page < maxPages; page++) {
    // Small delay between pages to avoid rate limiting
    if (page > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const data = await fetchReviewPage(
      appId,
      { filter: "all", numPerPage: 100, cursor },
      signal
    );

    if (!data || data.reviews.length === 0) break;

    for (const review of data.reviews) {
      // Language breakdown
      const lang = review.language || "unknown";
      languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);

      // Monthly history aggregation
      const date = new Date(review.timestamp_created * 1000);
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      const bucket = monthlyBuckets.get(monthKey) || {
        positive: 0,
        negative: 0,
      };
      if (review.voted_up) {
        bucket.positive++;
      } else {
        bucket.negative++;
      }
      monthlyBuckets.set(monthKey, bucket);
    }

    cursor = data.cursor;
    if (!cursor || cursor === "" || data.reviews.length < 100) break;
  }

  return {
    languageBreakdown: Array.from(languageCounts.entries())
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    history: Array.from(monthlyBuckets.entries())
      .map(([date, counts]) => ({
        date: `${date}-01`,
        positive: counts.positive,
        negative: counts.negative,
        total: counts.positive + counts.negative,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Get full review analysis including history and language breakdown.
 * Uses cursor-based pagination from the Steam reviews API to collect
 * real review history data and language distribution.
 */
export async function getSteamReviewAnalysisData(
  appId: number,
  signal?: AbortSignal
): Promise<SteamReviewAnalysis | null> {
  const summary = await getSteamReviewSummaryData(appId);
  if (!summary) return null;

  const { languageBreakdown, history } = await collectReviewData(appId, signal);

  const result: SteamReviewAnalysis = {
    summary,
    history,
    languageBreakdown,
    playerHistory: [],
  };

  return result;
}

/**
 * Build a cache key for a Steam reviews page request.
 * Distinct cursors earn distinct cache entries, so a back-scroll loads the
 * same page quickly while each next page still forces a fresh HTTP call.
 */
function buildReviewsPageCacheKey(
  appId: number,
  filters: SteamReviewFilters
): string {
  return [
    `reviews:${appId}`,
    filters.filter,
    filters.reviewType,
    filters.purchaseType,
    filters.language,
    filters.dayRange ?? "-",
    filters.playtimeMinMinutes,
    filters.playtimeMaxMinutes,
    filters.numPerPage ?? 20,
    filters.cursor ?? "*",
  ].join(":");
}

/**
 * Fetch a single page of Steam reviews using the same cursor-based pagination
 * that the Playnite ReviewViewer plugin exposes. Returns adapted reviews
 * (BBCode stripped + author.profileUrl populated) so the renderer can use
 * them as-is.
 */
export async function fetchSteamReviewsPage(
  appId: number,
  filters: SteamReviewFilters,
  signal?: AbortSignal
): Promise<SteamReviewsPage | null> {
  const cacheKey = buildReviewsPageCacheKey(appId, filters);
  const cached = getCached(reviewsPageCache, cacheKey);
  if (cached) return cached;

  try {
    const url = buildSteamReviewsUrl(appId, {
      cursor: filters.cursor,
      filter: filters.filter,
      reviewType: filters.reviewType,
      purchaseType: filters.purchaseType,
      language: filters.language,
      dayRange: filters.dayRange,
      playtimeMinMinutes: filters.playtimeMinMinutes,
      playtimeMaxMinutes: filters.playtimeMaxMinutes,
      numPerPage: filters.numPerPage,
    });

    const response = await axios.get<SteamReviewsResponse>(url, {
      timeout: 12000,
      signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    if (response.data?.success !== 1) {
      return null;
    }

    const page: SteamReviewsPage = {
      reviews: response.data.reviews.map(adaptSteamReview),
      cursor: response.data.cursor ?? "",
      query_summary: {
        num_reviews: response.data.query_summary.num_reviews,
        review_score: response.data.query_summary.review_score,
        review_score_desc: response.data.query_summary.review_score_desc,
        total_positive: response.data.query_summary.total_positive,
        total_negative: response.data.query_summary.total_negative,
        total_reviews: response.data.query_summary.total_reviews,
      },
    };

    setCache(reviewsPageCache, cacheKey, page);
    return page;
  } catch (err) {
    if (axios.isAxiosError(err) && err.code === "ERR_CANCELED") return null;
    logger.error("Failed to fetch Steam reviews page", err);
    return null;
  }
}

/**
 * Search Steam store for a game by name to find its App ID.
 * Used for non-Steam games.
 */
export async function searchSteamGame(
  gameTitle: string,
  signal?: AbortSignal
): Promise<number | null> {
  try {
    const response = await axios.get<{
      items?: Array<{ id: number; name: string }>;
    }>(`${STEAM_STORE_API}/storesearch/`, {
      params: { term: gameTitle, l: "english" },
      timeout: 8000,
      signal,
    });

    const items = response.data?.items;
    if (items && items.length > 0) {
      // Return the first match's app ID
      return items[0].id;
    }
    return null;
  } catch (err) {
    logger.error("Failed to search Steam store", err);
    return null;
  }
}
