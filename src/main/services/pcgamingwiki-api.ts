import axios from "axios";
import { networkLogger as logger } from "./logger";

export interface PCGamingWikiPage {
  title: string;
  pageid: number;
  extract: string;
  fullurl: string;
}

export interface PCGamingWikiTechnicalInfo {
  resolutionSupport: string[];
  fpsCaps: number[];
  widescreenSupport: boolean;
  ultraWideSupport: boolean;
  hdrSupport: boolean;
  fourKSupport: boolean;
  controllerSupport: string;
  drmInfo: string;
  saveGameLocation: string;
  essentialFixes: Array<{
    title: string;
    description: string;
    url: string;
  }>;
  /**
   * Game engine name mined from PCGamingWiki's infobox ("Engine" row).
   * Best-effort — flips to null when the row isn't present in the article.
   */
  engine: string | null;
}

const BASE_URL = "https://www.pcgamingwiki.com/w/api.php";

export class PCGamingWikiAPI {
  private static readonly CACHE = new Map<string, PCGamingWikiTechnicalInfo>();
  private static readonly CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
  private static readonly CACHE_TIMESTAMPS = new Map<string, number>();

  static async getTechnicalInfo(
    gameTitle: string
  ): Promise<PCGamingWikiTechnicalInfo | null> {
    const cacheKey = gameTitle.toLowerCase().trim();

    const cached = this.CACHE.get(cacheKey);
    const timestamp = this.CACHE_TIMESTAMPS.get(cacheKey);
    if (cached && timestamp && Date.now() - timestamp < this.CACHE_TTL) {
      return cached;
    }

    try {
      const searchResult = await this.searchPage(gameTitle);
      if (!searchResult) {
        return null;
      }

      const pageContent = await this.getPageContent(searchResult.pageid);
      if (!pageContent) {
        return null;
      }

      const info = this.parseTechnicalInfo(pageContent, searchResult.fullurl);
      this.CACHE.set(cacheKey, info);
      this.CACHE_TIMESTAMPS.set(cacheKey, Date.now());
      return info;
    } catch (error) {
      logger.error("PCGamingWiki fetch failed:", error);
      return null;
    }
  }

  static async searchPages(
    gameTitle: string,
    limit = 5
  ): Promise<PCGamingWikiPage[]> {
    try {
      const response = await axios.get(BASE_URL, {
        params: {
          action: "query",
          list: "search",
          srsearch: gameTitle,
          format: "json",
          srlimit: limit,
        },
      });

      const pages = response.data?.query?.search;
      if (!pages || !Array.isArray(pages)) return [];

      return pages.map((page: any) => ({
        title: page.title,
        pageid: page.pageid,
        extract: page.snippet ? page.snippet.replace(/<[^>]*>/g, "") : "",
        fullurl: `https://www.pcgamingwiki.com/wiki/${encodeURIComponent(
          page.title.replace(/ /g, "_")
        )}`,
      }));
    } catch (error) {
      logger.error("PCGamingWiki search pages failed:", error);
      return [];
    }
  }

  private static async searchPage(
    gameTitle: string
  ): Promise<PCGamingWikiPage | null> {
    try {
      const response = await axios.get(BASE_URL, {
        params: {
          action: "query",
          list: "search",
          srsearch: gameTitle,
          format: "json",
          srlimit: 3,
        },
      });

      const pages = response.data?.query?.search;
      if (!pages || pages.length === 0) return null;

      const bestMatch = pages[0];
      return {
        title: bestMatch.title,
        pageid: bestMatch.pageid,
        extract: "",
        fullurl: `https://www.pcgamingwiki.com/wiki/${encodeURIComponent(bestMatch.title.replace(/ /g, "_"))}`,
      };
    } catch {
      return null;
    }
  }

  private static async getPageContent(pageId: number): Promise<string | null> {
    try {
      const response = await axios.get(BASE_URL, {
        params: {
          action: "parse",
          pageid: pageId,
          prop: "text",
          format: "json",
          disabletoc: 1,
        },
      });

      return response.data?.parse?.text?.["*"] ?? null;
    } catch {
      return null;
    }
  }

  private static parseTechnicalInfo(
    htmlContent: string,
    wikiUrl: string
  ): PCGamingWikiTechnicalInfo {
    const info: PCGamingWikiTechnicalInfo = {
      resolutionSupport: [],
      fpsCaps: [],
      widescreenSupport: false,
      ultraWideSupport: false,
      hdrSupport: false,
      fourKSupport: false,
      controllerSupport: "",
      drmInfo: "",
      saveGameLocation: "",
      essentialFixes: [],
      engine: null,
    };

    const text = htmlContent.replace(/<[^>]*>/g, " ");

    // Engine extraction: PCGamingWiki infobox renders the Engine row as
    // `<th>Engine</th><td>Unity</td>` (with optional links). Look for the
    // label, then grab the first non-empty, non-link segment that follows.
    const engineMatch = htmlContent.match(
      /<th[^>]*>\s*Engine\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i
    );
    if (engineMatch) {
      const candidate = engineMatch[1]
        // Drop nested tags + refs/citations PCGW commonly inserts.
        .replace(/<[^>]*>/g, " ")
        .replace(/\s*\[(?:note|cite|source)[^\]]*\]/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      if (candidate.length > 0 && candidate.length < 80) {
        info.engine = candidate;
      }
    }

    if (text.includes("ultra-widescreen") || text.includes("21:9")) {
      info.ultraWideSupport = true;
    }
    if (text.includes("widescreen") || text.includes("16:9")) {
      info.widescreenSupport = true;
    }
    if (
      text.includes("4K") ||
      text.includes("3840") ||
      text.includes("2160p")
    ) {
      info.fourKSupport = true;
    }
    if (text.includes("HDR")) {
      info.hdrSupport = true;
    }

    const fpsMatch = text.match(/(\d+)\s*FPS/gi);
    if (fpsMatch) {
      info.fpsCaps = fpsMatch
        .map((m) => parseInt(m.replace(/\D/g, "")))
        .filter((n) => n > 0 && n <= 360);
    }

    const controllerMatch = text.match(
      /(?:controller support|gamepad support)[^.]*/i
    );
    if (controllerMatch) {
      info.controllerSupport = controllerMatch[0].trim();
    }

    const saveMatch = text.match(
      /(?:save game (?:data )?location|save data location)[^.]*/i
    );
    if (saveMatch) {
      info.saveGameLocation = saveMatch[0].trim();
    }

    info.essentialFixes = [
      {
        title: "PCGamingWiki Article",
        description: "Community fixes and improvements",
        url: wikiUrl,
      },
    ];

    return info;
  }
}
