import { registerEvent } from "../register-event";
import { gamesSublevel, gamesShopAssetsSublevel, levelKeys } from "@main/level";
import { randomUUID } from "node:crypto";
import type { Game, GameShop } from "@types";

interface BulkGameEntry {
  title: string;
  executablePath: string;
  iconUrl?: string;
  logoImageUrl?: string;
  libraryHeroImageUrl?: string;
  libraryImageUrl?: string;
  coverImageUrl?: string;
  linkedShop?: GameShop | null;
  linkedObjectId?: string | null;
}

interface BulkAddResult {
  success: true;
  games: Game[];
  errors: { title: string; executablePath: string; error: string }[];
}

const bulkAddCustomGamesToLibrary = async (
  _event: Electron.IpcMainInvokeEvent,
  entries: BulkGameEntry[]
): Promise<BulkAddResult> => {
  const addedGames: Game[] = [];
  const errors: { title: string; executablePath: string; error: string }[] = [];

  for (const entry of entries) {
    try {
      const objectId = randomUUID();
      const shop: GameShop = "custom";
      const gameKey = levelKeys.game(shop, objectId);

      // Check for duplicate executable paths
      const existingGames = await gamesSublevel.iterator().all();
      const existingGame = existingGames.find(
        ([_key, game]) =>
          game.executablePath === entry.executablePath && !game.isDeleted
      );

      if (existingGame) {
        errors.push({
          title: entry.title,
          executablePath: entry.executablePath,
          error:
            "A game with this executable path already exists in your library",
        });
        continue;
      }

      // Save shop assets
      const assets = {
        updatedAt: Date.now(),
        objectId,
        shop,
        title: entry.title,
        iconUrl: entry.iconUrl || null,
        libraryHeroImageUrl: entry.libraryHeroImageUrl || "",
        libraryImageUrl: entry.libraryImageUrl || entry.iconUrl || "",
        logoImageUrl: entry.logoImageUrl || "",
        logoPosition: null,
        coverImageUrl: entry.coverImageUrl || entry.iconUrl || "",
        downloadSources: [],
      };
      await gamesShopAssetsSublevel.put(gameKey, assets);

      // Save game record
      const game: Game = {
        title: entry.title,
        iconUrl: entry.iconUrl || null,
        logoImageUrl: entry.logoImageUrl || null,
        libraryHeroImageUrl: entry.libraryHeroImageUrl || null,
        objectId,
        shop,
        remoteId: null,
        isDeleted: false,
        playTimeInMilliseconds: 0,
        lastTimePlayed: null,
        addedToLibraryAt: new Date(),
        executablePath: entry.executablePath,
    executablePathUpdatedAt: new Date(),
    launchOptions: null,
    linkedShop: entry.linkedShop ?? null,
    linkedObjectId: entry.linkedObjectId ?? null,
    favorite: false,
        automaticCloudSync: false,
        hasManuallyUpdatedPlaytime: false,
      };

      await gamesSublevel.put(gameKey, game);
      addedGames.push(game);
    } catch (error) {
      errors.push({
        title: entry.title,
        executablePath: entry.executablePath,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { success: true, games: addedGames, errors };
};

registerEvent("bulkAddCustomGamesToLibrary", bulkAddCustomGamesToLibrary);
