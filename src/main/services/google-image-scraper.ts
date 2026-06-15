import { BrowserWindow } from "electron";
import { networkLogger as logger } from "./logger";

export type AssetType = "icon" | "logo" | "hero";

export interface AssetSearchResult {
  id: string;
  thumbnailUrl: string;
  fullImageUrl: string;
  sourceUrl: string;
  sourceName: string;
  width: number | null;
  height: number | null;
}

export interface SearchGameAssetsResponse {
  results: AssetSearchResult[];
  query: string;
}

const MAX_RESULTS = 15;
const MIN_RESULTS_BEFORE_RELAX = 5;

const QUERY_TEMPLATES: Record<AssetType, string> = {
  icon: '"{title}" icon',
  logo: '"{title}" logo png transparent',
  hero: '"{title}" banner',
};

const ASPECT_RATIO_RANGES: Record<
  AssetType,
  { min: number; max: number; orientation: string }
> = {
  icon: { min: 0.8, max: 1.2, orientation: "square-ish" },
  logo: { min: 1.5, max: Infinity, orientation: "horizontal" },
  hero: { min: 2.0, max: Infinity, orientation: "wide" },
};

function buildQuery(gameTitle: string, assetType: AssetType, withQuotes = true): string {
  const template = QUERY_TEMPLATES[assetType];
  const title = withQuotes ? `"${gameTitle}"` : gameTitle;
  return template.replace('"{title}"', title).replace('{title}', title);
}

function extractSourceName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getAspectRatio(width: number | null, height: number | null): number | null {
  if (width === null || height === null || height === 0) return null;
  return width / height;
}

function matchesAssetType(
  result: AssetSearchResult,
  assetType: AssetType
): boolean {
  const ratio = getAspectRatio(result.width, result.height);
  if (ratio === null) return true; // Unknown dimensions — rank lower but include

  const range = ASPECT_RATIO_RANGES[assetType];
  return ratio >= range.min && ratio <= range.max;
}

function filterByAssetType(
  results: AssetSearchResult[],
  assetType: AssetType
): AssetSearchResult[] {
  const matching = results.filter((r) => matchesAssetType(r, assetType));
  const nonMatching = results.filter((r) => !matchesAssetType(r, assetType));

  if (matching.length >= MIN_RESULTS_BEFORE_RELAX) {
    return matching.slice(0, MAX_RESULTS);
  }

  return [...matching, ...nonMatching].slice(0, MAX_RESULTS);
}

/**
 * Headless BrowserWindow scraper for DuckDuckGo image search.
 */
async function scrapeDdgImages(query: string): Promise<any[]> {
  logger.log(`Launching offscreen BrowserWindow for query: "${query}"`);

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: "temp_ddg_" + Date.now(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=images&iax=images&ia=images`;

  // Set the consent cookie to prevent cookie prompts
  const session = win.webContents.session;
  try {
    await session.cookies.set({
      url: "https://duckduckgo.com",
      name: "consent",
      value: "true",
      domain: ".duckduckgo.com"
    });
  } catch (cookieErr) {
    logger.error("Failed to set DDG consent cookie:", cookieErr);
  }

  return new Promise<any[]>((resolve, reject) => {
    let completed = false;

    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        setImmediate(() => {
          if (!win.isDestroyed()) win.destroy();
        });
        reject(new Error("DuckDuckGo scraper timed out after 15 seconds"));
      }
    }, 15000);

    const cleanup = () => {
      completed = true;
      clearTimeout(timeout);
      setImmediate(() => {
        if (!win.isDestroyed()) win.destroy();
      });
    };

    win.loadURL(searchUrl, {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }).then(async () => {
      // Wait for client-side JS to render and VQD to be available
      await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2000));
      if (completed) return;

      try {
        const html = await win.webContents.executeJavaScript("document.documentElement.outerHTML");
        if (completed) return;

        // Parse VQD token
        const vqdMatch = html.match(/vqd=["']?([^"']+)["']?/);
        let vqd = vqdMatch ? vqdMatch[1] : null;
        if (!vqd) {
          const vqdMatch2 = html.match(/vqd:?["']?([^"']+)["']?/);
          vqd = vqdMatch2 ? vqdMatch2[1] : null;
        }

        if (!vqd) {
          cleanup();
          reject(new Error("Could not extract VQD token from DuckDuckGo page"));
          return;
        }

        logger.log(`Extracted VQD token: ${vqd}. Fetching images JSON...`);

        // Execute fetch inside page context to inherit cookies, user-agent and session context
        const fetchUrl = `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,&p=1`;
        const resultsJson = await win.webContents.executeJavaScript(`
          fetch("${fetchUrl}")
            .then(res => res.json())
            .catch(err => ({ error: err.message }))
        `);

        if (completed) return;

        if (resultsJson.error) {
          cleanup();
          reject(new Error(resultsJson.error));
        } else if (resultsJson.results) {
          cleanup();
          resolve(resultsJson.results);
        } else {
          cleanup();
          resolve([]);
        }
      } catch (jsErr) {
        cleanup();
        reject(jsErr);
      }
    }).catch((loadErr) => {
      // Electron might reject with ERR_ABORTED if there's a quick redirect
      if (loadErr && loadErr.code === "ERR_ABORTED") {
        logger.log("DuckDuckGo page load aborted due to redirect. Proceeding anyway...");
        // Wait and attempt to scrape
        setTimeout(async () => {
          if (completed) return;
          try {
            const html = await win.webContents.executeJavaScript("document.documentElement.outerHTML");
            const vqdMatch = html.match(/vqd=["']?([^"']+)["']?/);
            const vqd = vqdMatch ? vqdMatch[1] : null;
            if (!vqd) {
              cleanup();
              reject(new Error("Could not extract VQD token after load abort"));
              return;
            }
            const fetchUrl = `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,&p=1`;
            const resultsJson = await win.webContents.executeJavaScript(`
              fetch("${fetchUrl}")
                .then(res => res.json())
                .catch(err => ({ error: err.message }))
            `);
            if (completed) return;
            cleanup();
            if (resultsJson.error) {
              reject(new Error(resultsJson.error));
            } else {
              resolve(resultsJson.results || []);
            }
          } catch (retryErr) {
            cleanup();
            reject(retryErr);
          }
        }, 2500);
      } else {
        cleanup();
        reject(loadErr);
      }
    });
  });
}

/**
 * Public API: search for game assets.
 * Attempts quoted query first. If empty, falls back to unquoted query.
 */
export async function searchGameAssets(
  gameTitle: string,
  assetType: AssetType
): Promise<SearchGameAssetsResponse> {
  const title = gameTitle.trim();
  if (!title) {
    return { results: [], query: "" };
  }

  const effectiveTitle = title.length < 3 ? `${title} game` : title;

  // Attempt 1: Quoted Search
  const quotedQuery = buildQuery(effectiveTitle, assetType, true);
  try {
    const rawResults = await scrapeDdgImages(quotedQuery);
    if (rawResults.length > 0) {
      const mappedResults: AssetSearchResult[] = rawResults.map((r) => {
        const fullImageUrl = r.image;
        const thumbnailUrl = r.thumbnail;
        const sourceUrl = r.url || fullImageUrl;
        return {
          id: hashCode(fullImageUrl),
          thumbnailUrl,
          fullImageUrl,
          sourceUrl,
          sourceName: extractSourceName(sourceUrl),
          width: r.width && !isNaN(parseInt(r.width, 10)) ? parseInt(r.width, 10) : null,
          height: r.height && !isNaN(parseInt(r.height, 10)) ? parseInt(r.height, 10) : null,
        };
      });

      const filtered = filterByAssetType(mappedResults, assetType);
      logger.log(`Quoted search found ${filtered.length} matching results for "${quotedQuery}"`);
      return { results: filtered, query: quotedQuery };
    }
  } catch (error) {
    logger.error("DuckDuckGo quoted search failed:", error);
  }

  // Delay to prevent rapid overlapping requests
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Attempt 2: Unquoted Fallback
  const unquotedQuery = buildQuery(effectiveTitle, assetType, false);
  try {
    logger.log(`No results for quoted search, retrying unquoted search for "${unquotedQuery}"`);
    const rawResults = await scrapeDdgImages(unquotedQuery);
    const mappedResults: AssetSearchResult[] = rawResults.map((r) => {
      const fullImageUrl = r.image;
      const thumbnailUrl = r.thumbnail;
      const sourceUrl = r.url || fullImageUrl;
      return {
        id: hashCode(fullImageUrl),
        thumbnailUrl,
        fullImageUrl,
        sourceUrl,
        sourceName: extractSourceName(sourceUrl),
        width: r.width && !isNaN(parseInt(r.width, 10)) ? parseInt(r.width, 10) : null,
        height: r.height && !isNaN(parseInt(r.height, 10)) ? parseInt(r.height, 10) : null,
      };
    });

    const filtered = filterByAssetType(mappedResults, assetType);
    logger.log(`Unquoted search found ${filtered.length} matching results for "${unquotedQuery}"`);
    return { results: filtered, query: unquotedQuery };
  } catch (retryError) {
    logger.error("DuckDuckGo unquoted search failed:", retryError);
    throw new Error("DUCKDUCKGO_IMAGES_SEARCH_FAILED");
  }
}

/**
 * Get query templates (used by frontend for display purposes).
 */
export function getAssetQueryTemplate(assetType: AssetType): string {
  return QUERY_TEMPLATES[assetType];
}
