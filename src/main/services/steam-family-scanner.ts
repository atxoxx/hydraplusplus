import fs from "node:fs";
import path from "node:path";

import { getSteamLocation } from "./steam";
import { SteamWebApi } from "./steam-web-api";
import {
  getSteamUsersFromConfig,
  getSteamLibraryFolders,
  getSteamFamilyMembers,
  parseVdfFile,
} from "./steam-vdf-parser";
import { findExecutable } from "./platform-scanners/shared";
import { logger } from "./logger";
import { gamesSublevel, levelKeys } from "@main/level";
import { createGame } from "./library-sync";
import { AchievementWatcherManager } from "./achievements/achievement-watcher-manager";
import type { Game, SteamFamilyGame, SteamFamilyScanResult } from "@types";

const MAX_RECURSION_DEPTH = 3;

export class SteamFamilyScanner {
  /**
   * Performs a full scan: discovers local Steam users, family members,
   * fetches owned games via API, and checks local install status.
   */
  static async scan(
    apiKey: string,
    additionalFamilyIds: string[] = [],
    includeFreeGames = true
  ): Promise<SteamFamilyScanResult> {
    const errors: string[] = [];
    const ownGames: SteamFamilyGame[] = [];
    const familyGames: SteamFamilyGame[] = [];

    const steamPath = await getSteamLocation().catch(() => null);
    if (!steamPath) {
      return {
        ownGames: [],
        familyGames: [],
        localUsers: [],
        discoveredFamilyMembers: [],
        errors: ["Steam installation not found"],
      };
    }

    const localUsers = getSteamUsersFromConfig(steamPath);
    const libraryFolders = getSteamLibraryFolders(steamPath).map((f) => f.path);
    const discoveredFamily = getSteamFamilyMembers(steamPath);

    // Determine the primary user
    const primaryUser = localUsers.find((u) => u.mostRecent) ?? localUsers[0];

    // Collect all SteamIDs to fetch
    const allSteamIds = new Set<string>();
    if (primaryUser) allSteamIds.add(primaryUser.steamId64);
    for (const member of discoveredFamily) allSteamIds.add(member.steamId64);
    for (const sid of additionalFamilyIds) allSteamIds.add(sid);

    const uniqueIds = [...allSteamIds];

    for (const steamId64 of uniqueIds) {
      try {
        const games = await SteamWebApi.getOwnedGames(
          steamId64,
          apiKey,
          includeFreeGames
        );

        const isOwn = steamId64 === primaryUser?.steamId64;
        const ownerName = resolveOwnerName(
          steamId64,
          localUsers,
          discoveredFamily
        );

        for (const game of games) {
          const appId = game.appid;
          const installResult = findInstalledGame(libraryFolders, appId);

          const steamGame: SteamFamilyGame = {
            appId,
            title: game.name,
            iconUrl: game.img_icon_url
              ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appId}/${game.img_icon_url}.jpg`
              : null,
            ownerSteamId64: steamId64,
            ownerName,
            playtimeMinutes: game.playtime_forever,
            isOwnGame: isOwn,
            isInstalled: installResult.installed,
            executablePath: installResult.exePath,
          };

          if (isOwn) {
            ownGames.push(steamGame);
          } else {
            familyGames.push(steamGame);
          }
        }

        logger.info(
          `[SteamFamily] Fetched ${games.length} games for ${steamId64} (${ownerName})`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to fetch games for ${steamId64}: ${message}`);
        logger.error(`[SteamFamily] ${errors[errors.length - 1]}`);
      }
    }

    return {
      ownGames,
      familyGames,
      localUsers,
      discoveredFamilyMembers: discoveredFamily,
      errors,
    };
  }

  /**
   * Imports a discovered game into the Hydra library.
   */
  static async importGameToLibrary(game: SteamFamilyGame): Promise<void> {
    const shop = "steam" as const;
    const objectId = String(game.appId);
    const gameKey = levelKeys.game(shop, objectId);
    const existingGame = await gamesSublevel.get(gameKey);

    if (existingGame) {
      const updated: Game = {
        ...existingGame,
        title: game.title,
        objectId,
        shop,
        iconUrl: game.iconUrl ?? existingGame.iconUrl,
        libraryHeroImageUrl: existingGame.libraryHeroImageUrl,
        logoImageUrl: existingGame.logoImageUrl,
        playTimeInMilliseconds: existingGame.playTimeInMilliseconds,
        lastTimePlayed: existingGame.lastTimePlayed,
        remoteId: null,
        isDeleted: false,
        source: "steam",
        autoImported: true,
        steamFamilyOwnerId: game.isOwnGame ? null : game.ownerSteamId64,
        steamFamilyOwnerName: game.isOwnGame ? null : game.ownerName,
        executablePath: game.isInstalled
          ? (game.executablePath ?? existingGame.executablePath)
          : existingGame.executablePath,
      };

      await gamesSublevel.put(gameKey, updated);
    } else {
      const newGame: Game = {
        title: game.title,
        objectId,
        shop,
        iconUrl: game.iconUrl,
        libraryHeroImageUrl: null,
        logoImageUrl: null,
        playTimeInMilliseconds: 0,
        lastTimePlayed: null,
        remoteId: null,
        isDeleted: false,
        source: "steam",
        autoImported: true,
        steamFamilyOwnerId: game.isOwnGame ? null : game.ownerSteamId64,
        steamFamilyOwnerName: game.isOwnGame ? null : game.ownerName,
        executablePath: game.isInstalled ? (game.executablePath ?? null) : null,
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
}

// --- Helpers ---

function resolveOwnerName(
  steamId64: string,
  localUsers: Array<{ steamId64: string; personaName: string }>,
  discoveredFamily: Array<{ steamId64: string; personaName: string }>
): string {
  return (
    localUsers.find((u) => u.steamId64 === steamId64)?.personaName ??
    discoveredFamily.find((m) => m.steamId64 === steamId64)?.personaName ??
    `Steam User ${steamId64.slice(-4)}`
  );
}

interface InstallResult {
  installed: boolean;
  /** Path to the game executable if found */
  exePath: string | null;
}

/**
 * Checks if a Steam game is installed by parsing its ACF manifest file.
 * Falls back to folder name scan if manifest parsing fails.
 */
function findInstalledGame(
  libraryFolders: string[],
  appId: number
): InstallResult {
  for (const libFolder of libraryFolders) {
    const manifestPath = path.join(
      libFolder,
      "steamapps",
      `appmanifest_${appId}.acf`
    );

    if (!fs.existsSync(manifestPath)) continue;

    // Parse ACF manifest for the exact install directory
    const acf = parseVdfFile(manifestPath);
    const installDir =
      acf?.AppState &&
      typeof acf.AppState === "object" &&
      "installdir" in acf.AppState
        ? String(acf.AppState.installdir)
        : null;

    if (!installDir) continue;

    const gamePath = path.join(libFolder, "steamapps", "common", installDir);

    if (fs.existsSync(gamePath)) {
      const exePath = findExecutable(gamePath, MAX_RECURSION_DEPTH);
      return { installed: true, exePath };
    }
  }

  return { installed: false, exePath: null };
}
