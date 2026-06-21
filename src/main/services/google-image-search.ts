import axios, { AxiosError } from "axios";
import { networkLogger as logger } from "./logger";
import type {
  AssetSearchResult,
  AssetType,
  SearchGameAssetsResponse,
} from "./duckduckgo-image-search";

const MAX_RESULTS = 40;
const MIN_RESULTS_BEFORE_RELAX = 10;

const QUERY_TEMPLATES: Record<AssetType, string> = {
  icon: '"{title}" icon',
  logo: '"{title}" logo png transparent',
  hero: '"{title}" banner',
};

const ASPECT_RATIO_RANGES: Record<AssetType, { min: number; max: number }> = {
  icon: { min: 0.8, max: 1.2 },
  logo: { min: 1.5, max: Infinity },
  hero: { min: 2.0, max: Infinity },
};

const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function buildQuery(
  gameTitle: string,
  assetType: AssetType,
  withQuotes = true
): string {
  const template = QUERY_TEMPLATES[assetType];
  const title = withQuotes ? `"${gameTitle}"` : gameTitle;
  return template.replace('"{title}"', title).replace("{title}", title);
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

function extractSourceName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getAspectRatio(
  width: number | null,
  height: number | null
): number | null {
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

function parseResultItem(arr: any[]): AssetSearchResult | null {
  let thumbnailElement: [string, number, number] | null = null;
  let fullImageElement: [string, number, number] | null = null;
  let sourceElement: [string, string] | null = null;

  for (const elem of arr) {
    if (Array.isArray(elem)) {
      if (elem.length >= 3 && typeof elem[0] === "string") {
        const h = parseInt(String(elem[1]), 10);
        const w = parseInt(String(elem[2]), 10);
        if (!isNaN(h) && !isNaN(w) && h > 0 && w > 0) {
          if (elem[0].startsWith("https://encrypted-tbn")) {
            thumbnailElement = [elem[0], h, w];
          } else if (elem[0].startsWith("http")) {
            fullImageElement = [elem[0], h, w];
          }
        }
      } else if (
        elem.length >= 2 &&
        typeof elem[0] === "string" &&
        typeof elem[1] === "string"
      ) {
        if (elem[0].startsWith("http")) {
          sourceElement = [elem[0], elem[1]];
        }
      }
    }
  }

  if (thumbnailElement && fullImageElement) {
    const fullImageUrl = fullImageElement[0];
    return {
      id: hashCode(fullImageUrl),
      thumbnailUrl: thumbnailElement[0],
      fullImageUrl: fullImageUrl,
      sourceUrl: sourceElement ? sourceElement[0] : fullImageUrl,
      sourceName: sourceElement
        ? sourceElement[1]
        : extractSourceName(fullImageUrl),
      width: fullImageElement[2],
      height: fullImageElement[1],
    };
  }

  return null;
}

function parseGoogleImagesHtml(html: string): AssetSearchResult[] {
  const results: AssetSearchResult[] = [];
  const seenUrls = new Set<string>();

  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;

  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    const scriptContent = scriptMatch[1];
    if (!scriptContent.includes("AF_initDataCallback")) continue;

    const callbackRegex = /AF_initDataCallback\(([\s\S]*?)\);/g;
    let callbackMatch;
    while ((callbackMatch = callbackRegex.exec(scriptContent)) !== null) {
      const payloadStr = callbackMatch[1].trim();
      if (!payloadStr.includes("ds:1")) continue;

      const dataIndex = payloadStr.indexOf("data:");
      if (dataIndex === -1) continue;

      const arrayStart = payloadStr.indexOf("[", dataIndex);
      if (arrayStart === -1) continue;

      let bracketCount = 0;
      let arrayEnd = -1;
      for (let i = arrayStart; i < payloadStr.length; i++) {
        if (payloadStr[i] === "[") bracketCount++;
        else if (payloadStr[i] === "]") {
          bracketCount--;
          if (bracketCount === 0) {
            arrayEnd = i + 1;
            break;
          }
        }
      }

      if (arrayEnd === -1) continue;
      const arrayStr = payloadStr.substring(arrayStart, arrayEnd);

      try {
        const parsedArray = new Function(`return ${arrayStr}`)();
        if (!Array.isArray(parsedArray)) continue;

        const traverse = (val: any) => {
          if (Array.isArray(val)) {
            const item = parseResultItem(val);
            if (item) {
              if (!seenUrls.has(item.fullImageUrl)) {
                seenUrls.add(item.fullImageUrl);
                results.push(item);
              }
              return;
            }
            for (const subVal of val) {
              traverse(subVal);
            }
          } else if (val && typeof val === "object") {
            for (const key of Object.keys(val)) {
              traverse(val[key]);
            }
          }
        };

        traverse(parsedArray);
      } catch (err) {
        logger.error(
          "Failed to parse Google Images AF_initDataCallback array:",
          err
        );
      }
    }
  }

  return results;
}

async function runSingleQuery(query: string): Promise<AssetSearchResult[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&safe=off`;

  try {
    const response = await axios.get<string>(url, {
      headers: {
        "User-Agent": CHROME_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.google.com/",
      },
      timeout: 10000,
    });

    const html = response.data || "";
    return parseGoogleImagesHtml(html);
  } catch (err) {
    const ax = err as AxiosError;
    logger.error(
      `Google Images fetch failed (${ax.code ?? "unknown"}):`,
      ax.message
    );
    return [];
  }
}

async function runBingQuery(query: string): Promise<AssetSearchResult[]> {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&safeSearch=Off`;

  try {
    const response = await axios.get<string>(url, {
      headers: {
        "User-Agent": CHROME_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.bing.com/",
      },
      timeout: 10000,
    });

    const html = response.data || "";
    const results: AssetSearchResult[] = [];
    const regex = /<a\b[^>]*class="iusc"[^>]*>/g;
    let match;

    while ((match = regex.exec(html)) !== null) {
      const tag = match[0];
      const hrefMatch = tag.match(/href="([^"]+)"/);
      const mMatch = tag.match(/m="([^"]+)"/);

      if (!hrefMatch || !mMatch) continue;

      const href = hrefMatch[1].replace(/&amp;/g, "&");
      const rawJson = mMatch[1].replace(/&quot;/g, '"');

      let m: any = {};
      try {
        m = JSON.parse(rawJson);
      } catch (e) {
        continue;
      }

      let width: number | null = null;
      let height: number | null = null;

      const wMatch = href.match(/[?&]expw=(\d+)/);
      const hMatch = href.match(/[?&]exph=(\d+)/);
      if (wMatch) width = parseInt(wMatch[1], 10);
      if (hMatch) height = parseInt(hMatch[1], 10);

      const sourceUrl = m.purl || m.murl || "";
      let sourceName = "Bing";
      if (sourceUrl) {
        try {
          sourceName = new URL(sourceUrl).hostname.replace(/^www\./, "");
        } catch (e) {
          sourceName = m.pub || "Bing";
        }
      }

      results.push({
        id: hashCode(m.murl || ""),
        thumbnailUrl: m.turl || "",
        fullImageUrl: m.murl || "",
        sourceUrl: sourceUrl,
        sourceName: sourceName,
        width,
        height,
      });
    }

    return results;
  } catch (err) {
    const ax = err as AxiosError;
    logger.error(
      `Bing Images fallback fetch failed (${ax.code ?? "unknown"}):`,
      ax.message
    );
    return [];
  }
}

async function withBackoff<T>(
  fn: () => Promise<T>,
  attempts = 2,
  baseDelayMs = 600
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i + 1 < attempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

export async function searchGoogleImages(
  gameTitle: string,
  assetType: AssetType
): Promise<SearchGameAssetsResponse> {
  const title = gameTitle.trim();
  if (!title) return { results: [], query: "" };

  const effectiveTitle = title.length < 3 ? `${title} game` : title;

  // Attempt 1: quoted query (Google)
  const quotedQuery = buildQuery(effectiveTitle, assetType, true);
  try {
    const results = await withBackoff(() => runSingleQuery(quotedQuery));
    if (results.length > 0) {
      const filtered = filterByAssetType(results, assetType);
      logger.log(
        `Google Images quoted search returned ${filtered.length} results for "${quotedQuery}"`
      );
      return { results: filtered, query: quotedQuery };
    }
  } catch (error) {
    logger.error("Google Images quoted search failed:", error);
  }

  // Small delay to prevent rate limit
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Attempt 2: unquoted fallback (Google)
  const unquotedQuery = buildQuery(effectiveTitle, assetType, false);
  try {
    const results = await withBackoff(() => runSingleQuery(unquotedQuery), 2);
    if (results.length > 0) {
      const filtered = filterByAssetType(results, assetType);
      logger.log(
        `Google Images unquoted search returned ${filtered.length} results for "${unquotedQuery}"`
      );
      return { results: filtered, query: unquotedQuery };
    }
  } catch (error) {
    logger.error("Google Images unquoted search failed:", error);
  }

  // Fallback: Bing Images
  logger.warn(
    `Google Images returned 0 results for "${unquotedQuery}". Falling back to Bing Images...`
  );
  try {
    const results = await runBingQuery(unquotedQuery);
    if (results.length > 0) {
      const filtered = filterByAssetType(results, assetType);
      logger.log(
        `Bing Images fallback search returned ${filtered.length} results for "${unquotedQuery}"`
      );
      return { results: filtered, query: unquotedQuery };
    }
  } catch (error) {
    logger.error("Bing Images fallback search failed:", error);
  }

  return { results: [], query: unquotedQuery };
}
