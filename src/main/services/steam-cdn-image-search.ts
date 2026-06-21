import { HydraApi } from "./hydra-api";
import { networkLogger as logger } from "./logger";
import type { AssetSearchResult } from "./duckduckgo-image-search";

/**
 * Search for game images using Steam's public CDN.
 * Uses the Hydra catalogue API to get the app ID, then constructs
 * known CDN URL patterns for various image types.
 */
export async function searchSteamCDNImages(
  gameTitle: string,
  assetType: "icon" | "logo" | "hero" | "grid" | "banner",
  appId?: string | null
): Promise<AssetSearchResult[]> {
  try {
    let finalAppId = appId;

    if (!finalAppId) {
      // Get app ID from Hydra catalogue search.
      // NOTE: The API returns the array directly, NOT wrapped in { results: [...] }.
      const searchResults = await HydraApi.get<
        Array<{ objectId: string; title: string }>
      >(
        "/catalogue/search/suggestions",
        { query: gameTitle, limit: 1, shop: "steam" },
        { needsAuth: false }
      );

      finalAppId = searchResults?.[0]?.objectId;
    }

    if (!finalAppId) return [];

    const results: AssetSearchResult[] = [];

    // Map asset types to Steam CDN URL patterns
    switch (assetType) {
      case "icon":
      case "grid": {
        // Steam capsule images (600x900 and 231x87 variations)
        const urls = [
          `https://cdn.cloudflare.steamstatic.com/steam/apps/${finalAppId}/header.jpg`,
          `https://cdn.cloudflare.steamstatic.com/steam/apps/${finalAppId}/capsule_616x353.jpg`,
          `https://cdn.cloudflare.steamstatic.com/steam/apps/${finalAppId}/capsule_231x87.jpg`,
        ];
        urls.forEach((url, i) => {
          results.push({
            id: `steamcdn-${assetType}-${finalAppId}-${i}`,
            thumbnailUrl: url,
            fullImageUrl: url,
            sourceUrl: url,
            sourceName: "Steam CDN",
            width: assetType === "icon" ? 231 : 616,
            height: assetType === "icon" ? 87 : 353,
          });
        });
        break;
      }

      case "logo": {
        // Steam logo (horizontal game title artwork)
        const logoUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${finalAppId}/logo.png`;
        results.push({
          id: `steamcdn-logo-${finalAppId}`,
          thumbnailUrl: logoUrl,
          fullImageUrl: logoUrl,
          sourceUrl: logoUrl,
          sourceName: "Steam CDN",
          width: null,
          height: null,
        });
        break;
      }

      case "hero":
      case "banner": {
        // Library hero (1920x620) and header image
        const heroUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${finalAppId}/library_hero.jpg`;
        const headerUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${finalAppId}/header.jpg`;
        results.push({
          id: `steamcdn-hero-${finalAppId}`,
          thumbnailUrl: headerUrl,
          fullImageUrl: heroUrl,
          sourceUrl: heroUrl,
          sourceName: "Steam CDN",
          width: 1920,
          height: 620,
        });
        break;
      }
    }

    return results;
  } catch (error) {
    logger.error("Steam CDN image search failed:", error);
    return [];
  }
}
