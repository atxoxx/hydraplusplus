import type { StoreGame, StoreId } from "@types";
import { storeManager } from "@main/services/store-manager";

export interface OwnedGameEntry {
  storeGameId: string;
  title: string;
  store: StoreId;
  coverImageUrl: string | null;
  storeUrl: string | null;
  installed: boolean;
  source: "owned" | "gamepass";
  /** Epic: the appName required by com.epicgames.launcher://apps/<appName> */
  appName?: string;
  /** Xbox: the productId for ms-windows-store://pdp/?productid=... */
  productId?: string;
}

/**
 * Search all connected stores for a matching game by title.
 * Returns the best match across all stores.
 */
export async function findOwnedGame(
  title: string
): Promise<OwnedGameEntry | null> {
  if (!title) return null;

  try {
    const allGames = await storeManager.getAllOwnedGames();

    const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Find best match: prefer exact title match, then fuzzy match
    let bestMatch: (StoreGame & { storeId: StoreId }) | null = null;
    let bestScore = 0;

    for (const game of allGames) {
      if (!game.isOwned && !game.extraData?.source) continue;

      const gameNorm = game.title.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Exact match after normalization
      if (gameNorm === normalized) {
        bestMatch = game;
        break;
      }

      // Substring match
      if (gameNorm.includes(normalized) || normalized.includes(gameNorm)) {
        const score =
          Math.min(gameNorm.length, normalized.length) /
          Math.max(gameNorm.length, normalized.length);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = game;
        }
      }
    }

    if (!bestMatch) return null;

    const extraData = (bestMatch.extraData ?? {}) as Record<string, unknown>;

    return {
      storeGameId: bestMatch.storeGameId,
      title: bestMatch.title,
      store: bestMatch.storeId as StoreId,
      coverImageUrl: bestMatch.coverImageUrl ?? null,
      storeUrl: bestMatch.storeUrl ?? null,
      installed: bestMatch.isInstalled ?? false,
      source: (extraData.source as "owned" | "gamepass") ?? "owned",
      appName: extraData.appName as string | undefined,
      productId: extraData.productId as string | undefined,
    };
  } catch {
    return null;
  }
}

/** Generate the store deep-link URL to trigger install/launch */
export function storeDeepLink(entry: OwnedGameEntry): string {
  switch (entry.store) {
    case "epic":
      // Epic launcher requires appName, not catalogItemId.
      return `com.epicgames.launcher://apps/${entry.appName ?? entry.storeGameId}?action=${
        entry.installed ? "launch" : "install"
      }`;
    case "xbox":
      return `ms-windows-store://pdp/?productid=${entry.productId ?? entry.storeGameId}`;
    case "ubisoft":
      return `uplay://install/${entry.storeGameId}`;
    case "gog":
      return `goggalaxy://openGame/${entry.storeGameId}`;
    case "ea":
      return `origin2://game/launch?offerIds=${entry.storeGameId}`;
    case "battle-net":
      return `battlenet://${entry.storeGameId}`;
    default:
      return entry.storeUrl ?? "";
  }
}
