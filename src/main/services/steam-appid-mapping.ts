import type { GameShop, SteamAppIdMapping } from "@types";
import {
  gamesSublevel,
  levelKeys,
  steamAppIdMappingSublevel,
} from "@main/level";

import { logger } from "./logger";
import { searchSteamGame } from "./steam-charts";

/**
 * Build the LevelDB key for a non-Steam game's Steam AppID mapping.
 * Mirrors the convention used by `levelKeys.game(shop, objectId)`.
 */
const buildMappingKey = (shop: GameShop, objectId: string) =>
  levelKeys.steamAppIdMappingKey(shop, objectId);

/**
 * Persist a Steam AppID mapping. Swallows and logs LevelDB errors so callers
 * can fire-and-forget without crashing the originating request.
 */
const persistMapping = (
  key: string,
  mapping: SteamAppIdMapping
): Promise<void> =>
  steamAppIdMappingSublevel.put(key, mapping).catch((err) => {
    logger.error(`Failed to persist Steam AppID mapping ${key}`, err);
  });

/**
 * Resolve the Steam AppID for a game whose native shop is not Steam.
 *
 * Resolution order:
 *   1. Custom games honour their explicit `linkedShop`/`linkedObjectId`
 *      (matches `getGameAssets`, `getGameStats`, `getGameShopDetails`),
 *      recursing into the linked record. This guarantees the *known* AppID
 *      is used instead of an ambiguous-by-title Steam store search.
 *   2. If the resolved shop is "steam", the objectId is the AppID directly.
 *   3. Else, read the persisted mapping from LevelDB. If present, return it.
 *   4. Fall back to a live Steam store search by title, persist the result
 *      (best-effort) so the next visit is instant, and return it.
 *
 * Returns `null` when no AppID can be determined (e.g. local-only game not
 * listed on the Steam store).
 *
 * Note: when step 3 fails (e.g. LevelDB corruption) we intentionally fall
 * through to step 4 instead of returning `null`. This trades a slower, but
 * correct-from-Steam response for fewer false negatives; the failure is
 * logged so it remains diagnosable.
 */
export const getResolvedSteamAppId = async (
  shop: GameShop,
  objectId: string,
  gameTitle: string,
  /**
   * Optional AbortSignal for cancelling a live Steam search initiated on the
   * request that triggered resolution. Only affects step 4; LevelDB reads
   * are local so they cannot be aborted.
   */
  signal?: AbortSignal
): Promise<number | null> => {
  // Step 1 — custom games may redirect to a linked catalogue source.
  // Matches the inline-catch style of `getGameAssets`/`getGameStats`/
  // `getGameShopDetails`/`getUnlockedAchievements`. Recursion trusts that
  // `linkedShop` is itself non-`"custom"` per the existing data model.
  if (shop === "custom") {
    const game = await gamesSublevel
      .get(levelKeys.game(shop, objectId))
      .catch(() => null);
    if (game?.linkedShop && game?.linkedObjectId) {
      return getResolvedSteamAppId(
        game.linkedShop as GameShop,
        game.linkedObjectId,
        gameTitle,
        signal
      );
    }
  }

  if (shop === "steam") {
    const parsed = parseInt(objectId, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  const key = buildMappingKey(shop, objectId);

  try {
    const existing = await steamAppIdMappingSublevel.get(key);
    if (existing?.steamAppId) return existing.steamAppId;
  } catch (err) {
    logger.error(`Failed to read Steam AppID mapping ${key}`, err);
    // Intentional fall-through (see JSDoc above).
  }

  const appId = await searchSteamGame(gameTitle, signal);
  if (appId === null) return null;

  // Best-effort persist; never propagate save errors.
  void persistMapping(key, {
    steamAppId: appId,
    resolvedAt: Date.now(),
    source: "title_search",
  });

  return appId;
};

/**
 * Best-effort one-shot seeder intended to run after a game is added to the
 * library. Skipped for `shop === "steam"` (no mapping needed) and for empty
 * titles. Never throws — all failures are logged.
 */
export const seedSteamAppIdMapping = async (
  shop: GameShop,
  objectId: string,
  gameTitle: string | null | undefined
): Promise<void> => {
  if (shop === "steam" || !gameTitle) return;

  const key = buildMappingKey(shop, objectId);

  try {
    const existing = await steamAppIdMappingSublevel.get(key);
    if (existing?.steamAppId) return;

    const appId = await searchSteamGame(gameTitle);
    if (appId === null) return;

    await persistMapping(key, {
      steamAppId: appId,
      resolvedAt: Date.now(),
      source: "title_search",
    });
  } catch (err) {
    logger.error(`Failed to seed Steam AppID mapping ${key}`, err);
  }
};
