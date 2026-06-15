import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";
import { findExecutable, sanitizeId } from "./shared";
import type { PlatformGame, PlatformScanResult } from "@types";

const ROCKSTAR_DEFAULT_DIRS = [
  String.raw`C:\Program Files\Rockstar Games`,
  String.raw`C:\Program Files (x86)\Rockstar Games`,
];

const ROCKSTAR_PROGRAMDATA_DIR = String.raw`C:\ProgramData\Rockstar Games\Launcher`;

/** Known Rockstar game folder names (common installations) */
const KNOWN_GAMES: Array<{ folder: string; title: string }> = [
  { folder: "Grand Theft Auto V", title: "Grand Theft Auto V" },
  { folder: "Grand Theft Auto IV", title: "Grand Theft Auto IV" },
  {
    folder: "Grand Theft Auto: San Andreas",
    title: "Grand Theft Auto: San Andreas",
  },
  { folder: "Red Dead Redemption 2", title: "Red Dead Redemption 2" },
  { folder: "Red Dead Online", title: "Red Dead Online" },
  { folder: "L.A. Noire", title: "L.A. Noire" },
  { folder: "Max Payne 3", title: "Max Payne 3" },
  { folder: "Bully", title: "Bully: Scholarship Edition" },
  { folder: "Manhunt 2", title: "Manhunt 2" },
  { folder: "Midnight Club II", title: "Midnight Club II" },
  { folder: "Table Tennis", title: "Rockstar Table Tennis" },
];

export function scanRockstarGames(): PlatformScanResult {
  const games: PlatformGame[] = [];
  const errors: string[] = [];

  const allDirs = [...ROCKSTAR_DEFAULT_DIRS];
  if (fs.existsSync(ROCKSTAR_PROGRAMDATA_DIR)) {
    allDirs.push(ROCKSTAR_PROGRAMDATA_DIR);
  }

  for (const baseDir of allDirs) {
    if (!fs.existsSync(baseDir)) continue;

    // First, check known game folders
    for (const known of KNOWN_GAMES) {
      try {
        const knownPath = path.join(baseDir, known.folder);
        if (!fs.existsSync(knownPath)) continue;

        const objectId = `rockstar-${sanitizeId(known.folder)}`;
        if (games.some((g) => g.objectId === objectId)) continue;

        const exePath = findExecutable(knownPath, 2);

        if (exePath) {
          games.push({
            objectId,
            title: known.title,
            shop: "rockstar",
            executablePath: exePath,
            installPath: knownPath,
            iconUrl: null,
          });
        }
      } catch (err) {
        logger.error(
          `[RockstarScanner] Failed to scan ${known.folder}:`,
          err
        );
      }
    }

    // Scan for unknown game folders
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip known folders already scanned
        const isKnown = KNOWN_GAMES.some((k) => k.folder === entry.name);
        if (isKnown) continue;

        // Skip launcher/system folders
        const nameLower = entry.name.toLowerCase();
        if (
          nameLower.includes("launcher") ||
          nameLower.includes("social club")
        ) {
          continue;
        }

        const gamePath = path.join(baseDir, entry.name);
        const exePath = findExecutable(gamePath, 2);
        const objectId = `rockstar-${sanitizeId(entry.name)}`;

        if (exePath && !games.some((g) => g.objectId === objectId)) {
          games.push({
            objectId,
            title: entry.name,
            shop: "rockstar",
            executablePath: exePath,
            installPath: gamePath,
            iconUrl: null,
          });
        }
      }
    } catch (err) {
      errors.push(`Failed to scan Rockstar directory: ${baseDir}`);
      logger.error("[RockstarScanner] Failed to scan dir:", err);
    }
  }

  return { games, errors };
}
