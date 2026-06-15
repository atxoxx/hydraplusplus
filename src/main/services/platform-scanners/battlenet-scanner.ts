import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";
import { findExecutable, sanitizeId } from "./shared";
import type { PlatformGame, PlatformScanResult } from "@types";

const BATTLENET_DEFAULT_DIRS = [
  String.raw`C:\Program Files (x86)\Battle.net\Games`,
  String.raw`C:\Program Files\Battle.net\Games`,
];

const BATTLENET_KNOWN_GAMES: Array<{
  folder: string;
  title: string;
  exe: string;
}> = [
  { folder: "World of Warcraft", title: "World of Warcraft", exe: "Wow.exe" },
  {
    folder: "World of Warcraft",
    title: "World of Warcraft Classic",
    exe: "WowClassic.exe",
  },
  { folder: "Diablo IV", title: "Diablo IV", exe: "Diablo IV.exe" },
  { folder: "Diablo III", title: "Diablo III", exe: "Diablo III.exe" },
  {
    folder: "Diablo II Resurrected",
    title: "Diablo II: Resurrected",
    exe: "D2R.exe",
  },
  { folder: "Overwatch", title: "Overwatch 2", exe: "Overwatch.exe" },
  { folder: "Hearthstone", title: "Hearthstone", exe: "Hearthstone.exe" },
  {
    folder: "Heroes of the Storm",
    title: "Heroes of the Storm",
    exe: "HeroesOfTheStorm.exe",
  },
  {
    folder: "StarCraft II",
    title: "StarCraft II",
    exe: "SC2Switcher.exe",
  },
  {
    folder: "StarCraft",
    title: "StarCraft: Remastered",
    exe: "StarCraft.exe",
  },
  {
    folder: "Warcraft III",
    title: "Warcraft III: Reforged",
    exe: "Warcraft III.exe",
  },
  {
    folder: "Call of Duty",
    title: "Call of Duty: Modern Warfare",
    exe: "ModernWarfare.exe",
  },
  {
    folder: "Call of Duty",
    title: "Call of Duty: Black Ops Cold War",
    exe: "BlackOpsColdWar.exe",
  },
];

export function scanBattleNetGames(): PlatformScanResult {
  const games: PlatformGame[] = [];
  const errors: string[] = [];

  for (const baseDir of BATTLENET_DEFAULT_DIRS) {
    if (!fs.existsSync(baseDir)) continue;

    for (const known of BATTLENET_KNOWN_GAMES) {
      try {
        const gameDir = path.join(baseDir, known.folder);
        if (!fs.existsSync(gameDir)) continue;

        const resolvedExe = findExecutable(gameDir, 2, known.exe);

        if (resolvedExe) {
          const objectId = `bnet-${sanitizeId(known.title)}`;

          if (!games.some((g) => g.objectId === objectId)) {
            games.push({
              objectId,
              title: known.title,
              shop: "battle-net",
              executablePath: resolvedExe,
              installPath: gameDir,
              iconUrl: null,
            });
          }
        }
      } catch (err) {
        logger.error(`[BattleNetScanner] Failed to scan ${known.folder}:`, err);
      }
    }

    // Scan for unknown subdirectories
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const isKnown = BATTLENET_KNOWN_GAMES.some(
          (k) => k.folder === entry.name
        );
        if (isKnown) continue;

        const gamePath = path.join(baseDir, entry.name);
        const exePath = findExecutable(gamePath, 2);

        if (exePath) {
          const objectId = `bnet-${sanitizeId(entry.name)}`;
          if (!games.some((g) => g.objectId === objectId)) {
            games.push({
              objectId,
              title: entry.name,
              shop: "battle-net",
              executablePath: exePath,
              installPath: gamePath,
              iconUrl: null,
            });
          }
        }
      }
    } catch (err) {
      errors.push(`Failed to scan Battle.net directory: ${baseDir}`);
      logger.error("[BattleNetScanner] Failed to scan dir:", err);
    }
  }

  return { games, errors };
}
