import axios, { AxiosInstance } from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper as withCookieJar } from "axios-cookiejar-support";
import * as cheerio from "cheerio";
import { BrowserWindow, session as electronSession } from "electron";
import type {
  PlaytimeGameData,
  PlaytimeCategory,
  PlaytimeProvider,
  PlaytimeSearchResult,
} from "./types";
import {
  getCachedFetch,
  getCachedSearch,
  setCachedFetch,
  setCachedSearch,
} from "./cache";

const HLTB_BASE = "https://howlongtobeat.com";
const HLTB_HOMEPAGE = `${HLTB_BASE}/`;

/** Time between calls — mirrors the Lacro59 plugin's 350ms base delay. */
const RATE_LIMIT_MS = 350;

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": DEFAULT_UA,
  Referer: HLTB_HOMEPAGE,
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9",
};

/* ------------------------------------------------------------------ */
/*                          Rate limiter                              */
/* ------------------------------------------------------------------ */

class SlidingRateLimiter {
  private lastCall = 0;

  public async wait(): Promise<void> {
    const now = Date.now();
    const diff = now - this.lastCall;
    if (diff < RATE_LIMIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - diff));
    }
    this.lastCall = Date.now();
  }
}

/* ------------------------------------------------------------------ */
/*                Hidden BrowserWindow cookie warmer                  */
/* ------------------------------------------------------------------ */

/**
 * HLTB issues its session cookies + a fingerprint from the Next.js
 * client bundle at hydration time. Plain HTTP can't see those cookies
 * — we need a real browser context. We spin up a throwaway, headless
 * `BrowserWindow`, load the homepage + a child page so JS can run,
 * then drain the resulting cookies into a `tough-cookie` jar that
 * axios can use.
 */
class HltbSessionWarmer {
  private warmPromise: Promise<CookieJar> | null = null;

  public warm(): Promise<CookieJar> {
    if (this.warmPromise === null) {
      this.warmPromise = this.doWarm();
    }
    return this.warmPromise;
  }

  private async doWarm(): Promise<CookieJar> {
    const jar = new CookieJar();
    const sess = electronSession.defaultSession;

    let window: BrowserWindow | null = null;
    try {
      window = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      // Visit the homepage and let Next.js hydrate.
      try {
        await window.loadURL(HLTB_HOMEPAGE);
      } catch {
        // tolerated — warmer failures never block search
      }
      // Give the client bundle a moment to run fingerprint scripts.
      await sleep(1500);

      // Visit a child page so cookies stick across paths.
      try {
        await window.loadURL(`${HLTB_BASE}/games`);
      } catch {
        // ignored
      }
      await sleep(1200);
    } finally {
      if (window && !window.isDestroyed()) {
        window.destroy();
      }
    }

    await this.appendSessionCookies(sess, jar);
    return jar;
  }

  private async appendSessionCookies(
    sess: Electron.Session,
    jar: CookieJar
  ): Promise<void> {
    let cookies: Electron.Cookie[] = [];
    try {
      cookies = await sess.cookies.get({ domain: "howlongtobeat.com" });
    } catch {
      return;
    }

    for (const c of cookies) {
      const segments = [
        `${c.name}=${c.value}`,
        `Domain=${c.domain}`,
        `Path=${c.path || "/"}`,
      ];
      if (c.secure) segments.push("Secure");
      if (c.httpOnly) segments.push("HttpOnly");
      if (typeof c.expirationDate === "number") {
        segments.push(
          `Expires=${new Date(c.expirationDate * 1000).toUTCString()}`
        );
      }
      if (c.sameSite && c.sameSite !== "no_restriction") {
        segments.push(
          `SameSite=${c.sameSite.charAt(0).toUpperCase()}${c.sameSite.slice(1)}`
        );
      }
      try {
        await jar.setCookie(segments.join("; "), HLTB_BASE);
      } catch {
        // malformed cookie — skip
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*                    Dynamic endpoint discovery                      */
/* ------------------------------------------------------------------ */

/**
 * Walks HLTB's homepage, follows `_next/static/chunks/*.js` script
 * tags, and extracts the current `/api/...` POST endpoint by regex.
 * The endpoint is cached for the session because HLTB rotates it
 * regularly. Today the regex matches `/api/bleed`, but the discovery
 * keeps us forward-compatible if the path changes.
 */
class EndpointDiscovery {
  private discoveredPath: string | null = null;

  public async resolve(): Promise<string> {
    if (this.discoveredPath !== null) return this.discoveredPath;
    try {
      const html = await axios.get<string>(HLTB_HOMEPAGE, {
        timeout: 10_000,
        headers: DEFAULT_HEADERS,
        responseType: "text",
        transformResponse: (d) => d,
      });
      const bundlePaths = Array.from(
        new Set(
          (html.data.match(/\/_next\/static\/chunks\/[^"]+\.js/g) ?? []).slice(
            0,
            40
          )
        )
      );

      for (const bundlePath of bundlePaths) {
        try {
          const body = await axios.get<string>(`${HLTB_BASE}${bundlePath}`, {
            timeout: 8_000,
            headers: DEFAULT_HEADERS,
            responseType: "text",
            transformResponse: (d) => d,
          });
          const match = body.data.match(
            /fetch\s*\(\s*["'](\/api\/[A-Za-z0-9_\/]+)["']\s*,\s*\{[^}]*method\s*:\s*["']POST["']/
          );
          if (match && match[1]) {
            this.discoveredPath = match[1];
            return this.discoveredPath;
          }
        } catch {
          // a single failed bundle shouldn't kill discovery
        }
      }
    } catch {
      // ignored — fall back to the static endpoint
    }
    this.discoveredPath = "/api/bleed";
    return this.discoveredPath;
  }
}

/* ------------------------------------------------------------------ */
/*                           Provider                                 */
/* ------------------------------------------------------------------ */

/**
 * HowLongToBeat provider.
 *
 * The HLTB website (`howlongtobeat.com`) does not expose a public API.
 * The `/api/bleed` endpoint requires:
 *   1. JS-issued session cookies (set by Next.js hydration)
 *   2. A fingerprint token trio issued by `/api/bleed/init?t={ts}`
 *   3. The `Referer`, `X-Requested-With`, and a JSON body with
 *      `searchType`, `searchTerms`, `searchPage`, `size`, `t`.
 *
 * This provider mirrors the Lacro59 Playnite plugin's flow:
 *   - Hidden BrowserWindow warmup → tough-cookie jar
 *   - Dynamic `/api/...` discovery via homepage JS bundles (cached)
 *   - `/api/bleed/init?t=...` to capture `Token`/`Hpkey`/`Hpval`
 *   - POST search JSON with those tokens as headers
 *   - 350ms sliding-window rate limit between calls
 *   - cheerio-based HTML parsing for `/game?id={id}` detail pages
 */
export class HowLongToBeatProvider implements PlaytimeProvider {
  public readonly id = "howlongtobeat" as const;

  private readonly warmer = new HltbSessionWarmer();
  private readonly discovery = new EndpointDiscovery();
  private readonly rateLimiter = new SlidingRateLimiter();

  private httpPromise: Promise<AxiosInstance> | null = null;
  private tokenPromise: Promise<AuthToken> | null = null;

  public async search(
    query: string,
    signal?: AbortSignal
  ): Promise<PlaytimeSearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const cached = getCachedSearch(this.id, q);
    if (cached !== null) return cached;

    await this.rateLimiter.wait();
    try {
      const http = await this.getHttp();
      const endpoint = await this.discovery.resolve();
      const token = await this.getAuthToken(signal);

      const payload = {
        searchType: "games",
        searchTerms: [stripEditionNoise(q)],
        searchPage: 1,
        size: 20,
        searchOptions: {
          games: {
            userId: 0,
            platform: "",
            sortCategory: "popular",
            rangeCategory: "main",
            mainStyle: "",
          },
          users: "",
          lists: "",
          filter: "",
          sort: 0,
        },
        ...(token.t ? { t: token.t } : {}),
      };

      const response = await http.post(endpoint, payload, {
        signal,
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...mapTokenToHeaders(token),
        },
      });

      const results = this.parseSearchResponse(response.data, q);
      if (results.length > 0) setCachedSearch(this.id, q, results);
      return results;
    } catch (err) {
      if (axios.isCancel(err)) return [];
      // eslint-disable-next-line no-console
      console.warn("[HLTB] search failed:", errorMessage(err));
      return [];
    }
  }

  public async fetchById(
    externalId: string,
    signal?: AbortSignal
  ): Promise<PlaytimeGameData | null> {
    const id = externalId.trim();
    if (!id) return null;

    const cached = getCachedFetch(this.id, id);
    if (cached) return cached;

    await this.rateLimiter.wait();
    try {
      const http = await this.getHttp();
      const response = await http.get<string>(
        `/game?id=${encodeURIComponent(id)}`,
        {
          signal,
          transformResponse: (d) => d,
          responseType: "text",
          headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
          },
        }
      );
      const data = this.parseGamePage(id, response.data);
      if (data) setCachedFetch(this.id, id, data);
      return data;
    } catch (err) {
      if (axios.isCancel(err)) return null;
      // eslint-disable-next-line no-console
      console.warn("[HLTB] fetchById failed:", errorMessage(err));
      return null;
    }
  }

  private async getHttp(): Promise<AxiosInstance> {
    if (this.httpPromise === null) {
      this.httpPromise = (async () => {
        const jar = await this.warmer.warm();
        const client = axios.create({
          baseURL: HLTB_BASE,
          timeout: 12_000,
          headers: { ...DEFAULT_HEADERS },
        });
        withCookieJar(client);
        // `axios-cookiejar-support` augments `defaults.jar` at runtime.
        (client.defaults as unknown as { jar: CookieJar }).jar = jar;
        return client;
      })();
    }
    return this.httpPromise;
  }

  private async getAuthToken(signal?: AbortSignal): Promise<AuthToken> {
    if (this.tokenPromise === null) {
      this.tokenPromise = (async () => {
        const http = await this.getHttp();
        const endpoint = await this.discovery.resolve();
        const ts = Date.now();
        const resp = await http.get(`${endpoint}/init?t=${ts}`, { signal });
        const data = (resp.data ?? {}) as Record<string, unknown>;
        return {
          t: asString(data.t ?? data.timestamp ?? data.ts) ?? String(ts),
          token: asString(data.token),
          hpKey: asString(data.hpKey ?? data.hpkey),
          hpVal: asString(data.hpVal ?? data.hpval),
        } satisfies AuthToken;
      })().catch((err) => {
        // On failure, drop the cached promise so the next call retries.
        this.tokenPromise = null;
        throw err;
      });
    }
    return this.tokenPromise;
  }

  private parseSearchResponse(
    data: unknown,
    fallbackTitle: string
  ): PlaytimeSearchResult[] {
    const list = extractGameList(data);
    return list
      .filter(
        (entry) =>
          entry !== null &&
          typeof entry === "object" &&
          ((entry as RawEntry).game_id ?? (entry as RawEntry).id) !==
            undefined &&
          ((entry as RawEntry).game_name ?? (entry as RawEntry).name)
      )
      .map((entry) => {
        const raw = entry as RawEntry;
        const providerGameId = String(raw.game_id ?? raw.id ?? fallbackTitle);
        const title = (raw.game_name ?? raw.name ?? fallbackTitle).trim();
        const imagePath = raw.game_image ?? raw.image_url ?? null;
        return {
          provider: this.id,
          providerGameId,
          title,
          releaseYear:
            typeof raw.release_world === "number" ? raw.release_world : null,
          platforms: raw.profile_platform
            ? String(raw.profile_platform)
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean)
            : [],
          imageUrl: imagePath
            ? String(imagePath).startsWith("http")
              ? String(imagePath)
              : `${HLTB_BASE}/games/${imagePath}`
            : null,
          similarityScore:
            typeof raw.similarity === "number" ? raw.similarity : 0.95,
          estimatedSeconds: pickPrimarySeconds(raw),
        } satisfies PlaytimeSearchResult;
      });
  }

  private parseGamePage(id: string, html: string): PlaytimeGameData | null {
    let $: cheerio.CheerioAPI;
    try {
      $ = cheerio.load(html);
    } catch {
      return null;
    }

    const title =
      $("h1").first().text().trim() ||
      $("header h1").first().text().trim() ||
      id;

    const targets: Array<{ key: string; label: string }> = [
      { key: "Main Story", label: "Main Story" },
      { key: "Main + Extra", label: "Main + Sides" },
      { key: "Completionist", label: "Completionist" },
      { key: "All Styles", label: "Solo" },
    ];

    const categories: PlaytimeCategory[] = [];
    for (const { key, label } of targets) {
      const text = findCategoryDuration($, key);
      if (text) {
        categories.push({
          title: label,
          duration: text,
          accuracy: "00",
          durationSeconds: parseDurationToSeconds(text),
        });
      }
    }
    if (categories.length === 0) return null;

    return {
      provider: this.id,
      providerGameId: id,
      title,
      categories,
      platforms: [],
      imageUrl: null,
    };
  }
}

/* ------------------------------------------------------------------ */
/*                            Helpers                                 */
/* ------------------------------------------------------------------ */

interface AuthToken {
  t: string;
  token: string | null;
  hpKey: string | null;
  hpVal: string | null;
}

interface RawEntry {
  game_id?: number | string;
  id?: number | string;
  game_name?: string;
  name?: string;
  game_image?: string;
  image_url?: string;
  release_world?: number;
  profile_platform?: string;
  similarity?: number;
  comp_main?: number;
  comp_plus?: number;
  comp_100?: number;
  comp_all?: number;
}

function findCategoryDuration(
  $: cheerio.CheerioAPI,
  label: string
): string | null {
  let result: string | null = null;
  const lc = label.toLowerCase();
  $("li, div.GamePage_game__*, article, section").each((_, el) => {
    if (result) return;
    const text = $(el).text().trim();
    if (!text) return;
    if (!text.toLowerCase().includes(lc)) return;
    const match = text.match(/(\d+(?:\.\d+)?)\s*(Hours?|Mins?|Minutes?)/i);
    if (!match) return;
    const value = match[1];
    const unit = match[2].toLowerCase().startsWith("h") ? "Hours" : "Mins";
    result = `${value} ${unit}`;
  });
  return result;
}

function extractGameList(data: unknown): RawEntry[] {
  if (Array.isArray(data)) return data as RawEntry[];
  if (
    data &&
    typeof data === "object" &&
    "data" in (data as Record<string, unknown>)
  ) {
    const inner = (data as { data: unknown }).data;
    if (Array.isArray(inner)) return inner as RawEntry[];
  }
  return [];
}

function mapTokenToHeaders(token: AuthToken): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token.token) headers.Token = token.token;
  if (token.hpKey) headers.Hpkey = token.hpKey;
  if (token.hpVal) headers.Hpval = token.hpVal;
  return headers;
}

function stripEditionNoise(q: string): string {
  return q
    .replace(
      /\b(edition|goty|game of the year|remaster(ed)?|definitive|complete|enhanced|collection)\b/gi,
      ""
    )
    .trim();
}

function pickPrimarySeconds(entry: RawEntry): number | null {
  const v =
    entry.comp_main ?? entry.comp_plus ?? entry.comp_100 ?? entry.comp_all;
  return typeof v === "number" ? v : null;
}

function parseDurationToSeconds(duration: string): number {
  const value = parseFloat(duration);
  if (!Number.isFinite(value)) return 0;
  const lower = duration.toLowerCase();
  if (lower.includes("hour")) return value * 3600;
  if (lower.includes("min")) return value * 60;
  return value * 3600;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "Unknown error");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
