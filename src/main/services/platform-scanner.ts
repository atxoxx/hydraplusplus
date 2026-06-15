import { gamesSublevel, levelKeys } from "@main/level";
import { createGame } from "./library-sync";
import { AchievementWatcherManager } from "./achievements/achievement-watcher-manager";
import { scanEpicGames } from "./platform-scanners/epic-scanner";
import { scanGogGames } from "./platform-scanners/gog-scanner";
import { scanBattleNetGames } from "./platform-scanners/battlenet-scanner";
import { scanAmazonGames } from "./platform-scanners/amazon-scanner";
import { scanUbisoftGames } from "./platform-scanners/ubisoft-scanner";
import { scanXboxGames } from "./platform-scanners/xbox-scanner";
import { scanRockstarGames } from "./platform-scanners/rockstar-scanner";
import { scanItchIoGames } from "./platform-scanners/itchio-scanner";
import { scanHumbleGames } from "./platform-scanners/humble-scanner";
import type {
  Game,
  PlatformGame,
  AllPlatformsScanResult,
} from "@types";
import { logger } from "./logger";

export class PlatformScanner {
  /**
   * Runs all platform scanners and returns combined results.
   */
  static scanAll(): AllPlatformsScanResult {
    return {
      epic: scanEpicGames(),
      gog: scanGogGames(),
      "battle-net": scanBattleNetGames(),
      amazon: scanAmazonGames(),
      ubisoft: scanUbisoftGames(),
      xbox: scanXboxGames(),
      rockstar: scanRockstarGames(),
      "itch-io": scanItchIoGames(),
      humble: scanHumbleGames(),
    };
  }

  /**
   * Imports a single discovered platform game into the Hydra library.
   */
  static async importGame(game: PlatformGame): Promise<void> {
    const gameKey = levelKeys.game(game.shop, game.objectId);
    const existingGame = await gamesSublevel.get(gameKey);

    if (existingGame) {
      const updated: Game = {
        ...existingGame,
        title: game.title,
        objectId: game.objectId,
        shop: game.shop,
        isDeleted: false,
        source: game.shop,
        autoImported: true,
        executablePath:
          game.executablePath ?? existingGame.executablePath,
      };

      await gamesSublevel.put(gameKey, updated);
    } else {
      const newGame: Game = {
        title: game.title,
        objectId: game.objectId,
        shop: game.shop,
        iconUrl: game.iconUrl,
        libraryHeroImageUrl: null,
        logoImageUrl: null,
        playTimeInMilliseconds: 0,
        lastTimePlayed: null,
        remoteId: null,
        isDeleted: false,
        source: game.shop,
        autoImported: true,
        executablePath: game.executablePath,
      };

      await gamesSublevel.put(gameKey, newGame);
    }

    const savedGame = await gamesSublevel.get(gameKey);
    if (savedGame) {
      await createGame(savedGame).catch(() => {});
      AchievementWatcherManager.firstSyncWithRemoteIfNeeded(
        savedGame.shop,
        savedGame.objectId
      );
    }
  }

  /**
   * Imports all games from a platform scan result.
   */
  static async importPlatformGames(
    games: PlatformGame[]
  ): Promise<{ imported: number; errors: string[] }> {
    let imported = 0;
    const errors: string[] = [];

    for (const game of games) {
      try {
        await PlatformScanner.importGame(game);
        imported++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to import ${game.title}: ${message}`);
        logger.error(`[PlatformScanner] Import error: ${message}`);
      }
    }

    return { imported, errors };
  }
}
