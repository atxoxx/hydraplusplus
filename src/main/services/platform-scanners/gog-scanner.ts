import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";
import { findExecutable, sanitizeId } from "./shared";
import type { PlatformGame, PlatformScanResult } from "@types";

const GOG_DEFAULT_DIRS = [
  String.raw`C:\Program Files (x86)\GOG Galaxy\Games`,
  String.raw`C:\GOG Games`,
  String.raw`C:\Program Files (x86)\GalaxyClient\Games`,
];

export function scanGogGames(): PlatformScanResult {
  const games: PlatformGame[] = [];
  const errors: string[] = [];

  for (const dir of GOG_DEFAULT_DIRS) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const gamePath = path.join(dir, entry.name);
        const exePath = findExecutable(gamePath, 2);

        const alreadyFound = games.some(
          (g) =>
            g.installPath &&
            gamePath.toLowerCase() === g.installPath.toLowerCase()
        );

        if (!alreadyFound && exePath) {
          games.push({
            objectId: `gog-${sanitizeId(entry.name)}`,
            title: entry.name,
            shop: "gog",
            executablePath: exePath,
            installPath: gamePath,
            iconUrl: null,
          });
        }
      }
    } catch (err) {
      errors.push(`Failed to scan GOG directory: ${dir}`);
      logger.error("[GogScanner] Failed to scan dir:", err);
    }
  }

  return { games, errors };
}
