import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "../logger";
import { findExecutable, sanitizeId } from "./shared";
import type { PlatformGame, PlatformScanResult } from "@types";

const HUMBLE_DEFAULT_DIRS = [
  String.raw`C:\Program Files (x86)\Humble Bundle`,
  String.raw`C:\Program Files\Humble Bundle`,
];

const HUMBLE_APPDATA_DIR = path.join(
  os.homedir(),
  "AppData",
  "Roaming",
  "Humble Bundle"
);

/** Known Humble library file that may list installed games */
const HUMBLE_LIBRARY_FILES = ["library.json", "installed.json", "games.json"];

export function scanHumbleGames(): PlatformScanResult {
  const games: PlatformGame[] = [];
  const errors: string[] = [];

  const allDirs = [...HUMBLE_DEFAULT_DIRS];
  if (fs.existsSync(HUMBLE_APPDATA_DIR)) {
    allDirs.push(HUMBLE_APPDATA_DIR);
  }

  // Try to parse Humble library JSON files for installed game info
  for (const baseDir of allDirs) {
    for (const libFile of HUMBLE_LIBRARY_FILES) {
      const libPath = path.join(baseDir, libFile);
      if (!fs.existsSync(libPath)) continue;

      try {
        const content = fs.readFileSync(libPath, "utf-8");
        const data = JSON.parse(content);

        // Humble library can be an array or object with games
        const gamesList = Array.isArray(data)
          ? data
          : (data.games ?? data.installed ?? data.items ?? []);

        for (const entry of gamesList) {
          try {
            const installDir: string | undefined =
              entry.installDir ??
              entry.install_location ??
              entry.path ??
              entry.download_dir;
            const title: string | undefined =
              entry.title ?? entry.name ?? entry.game_name ?? entry.human_name;
            const gameId: string | undefined =
              entry.id ?? entry.game_id ?? entry.machine_name;

            if (!installDir || !fs.existsSync(installDir)) continue;
            if (!title) continue;

            const objectId = gameId
              ? `humble-${sanitizeId(String(gameId))}`
              : `humble-${sanitizeId(title)}`;

            if (games.some((g) => g.objectId === objectId)) continue;

            const exePath = findExecutable(installDir, 3);
            if (exePath) {
              games.push({
                objectId,
                title,
                shop: "humble",
                executablePath: exePath,
                installPath: installDir,
                iconUrl: entry.icon ?? null,
              });
            }
          } catch (err) {
            logger.error("[HumbleScanner] Failed to parse entry:", err);
          }
        }
      } catch (err) {
        logger.error(`[HumbleScanner] Failed to parse ${libFile}:`, err);
      }
    }
  }

  // Fallback: scan directories directly for executables
  for (const dir of allDirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const gamePath = path.join(dir, entry.name);
        const exePath = findExecutable(gamePath, 2);
        const objectId = `humble-${sanitizeId(entry.name)}`;

        if (exePath && !games.some((g) => g.objectId === objectId)) {
          games.push({
            objectId,
            title: entry.name,
            shop: "humble",
            executablePath: exePath,
            installPath: gamePath,
            iconUrl: null,
          });
        }
      }
    } catch (err) {
      errors.push(`Failed to scan Humble directory: ${dir}`);
      logger.error("[HumbleScanner] Failed to scan dir:", err);
    }
  }

  return { games, errors };
}
