import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "../logger";
import { findExecutable, sanitizeId } from "./shared";
import type { PlatformGame, PlatformScanResult } from "@types";

const AMAZON_DEFAULT_DIRS = [
  String.raw`C:\Program Files\WindowsApps\AmazonGames`,
  String.raw`C:\Program Files\Amazon Games`,
  String.raw`C:\Program Files (x86)\Amazon Games`,
];

const AMAZON_LOCALAPPDATA_DIR = path.join(
  os.homedir(),
  "AppData",
  "Local",
  "Amazon Games",
  "Library"
);

/** Known Amazon Games launcher executables (for detection) */
const LAUNCHER_EXES = ["Amazon Games.exe", "Amazon Games Launcher.exe"];

export function scanAmazonGames(): PlatformScanResult {
  const games: PlatformGame[] = [];
  const errors: string[] = [];

  const allDirs = [...AMAZON_DEFAULT_DIRS];
  if (fs.existsSync(AMAZON_LOCALAPPDATA_DIR)) {
    allDirs.push(AMAZON_LOCALAPPDATA_DIR);
  }

  // Also check library.json if it exists in LocalAppData
  const libraryJsonPath = path.join(
    os.homedir(),
    "AppData",
    "Local",
    "Amazon Games",
    "Library",
    "library.json"
  );

  if (fs.existsSync(libraryJsonPath)) {
    try {
      const content = fs.readFileSync(libraryJsonPath, "utf-8");
      const library = JSON.parse(content);

      // The library.json may have a "games" array or be an object with game info
      const gamesArray = Array.isArray(library)
        ? library
        : library.games ?? library.installed ?? [];

      for (const entry of gamesArray) {
        try {
          const installPath: string | undefined =
            entry.installDir ?? entry.installLocation ?? entry.path;
          const title: string | undefined =
            entry.title ?? entry.name ?? entry.gameTitle;
          const gameId: string | undefined =
            entry.id ?? entry.gameId ?? entry.appId;

          if (!installPath || !fs.existsSync(installPath)) continue;
          if (!title) continue;

          const objectId = gameId
            ? `amazon-${sanitizeId(String(gameId))}`
            : `amazon-${sanitizeId(title)}`;

          if (games.some((g) => g.objectId === objectId)) continue;

          const exePath = findExecutable(installPath, 3);
          games.push({
            objectId,
            title,
            shop: "amazon",
            executablePath: exePath,
            installPath,
            iconUrl: entry.iconUrl ?? null,
          });
        } catch (err) {
          logger.error("[AmazonScanner] Failed to parse library entry:", err);
        }
      }
    } catch (err) {
      errors.push("Failed to parse Amazon Games library.json");
      logger.error("[AmazonScanner] Failed to parse library.json:", err);
    }
  }

  // Scan default directories as a fallback
  for (const dir of allDirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip if the folder name looks like a launcher/system folder
        if (
          LAUNCHER_EXES.some((le) =>
            entry.name.toLowerCase().includes(le.toLowerCase().split(".")[0])
          )
        ) {
          continue;
        }

        const gamePath = path.join(dir, entry.name);
        const exePath = findExecutable(gamePath, 2);
        const objectId = `amazon-${sanitizeId(entry.name)}`;

        if (exePath && !games.some((g) => g.objectId === objectId)) {
          games.push({
            objectId,
            title: entry.name,
            shop: "amazon",
            executablePath: exePath,
            installPath: gamePath,
            iconUrl: null,
          });
        }
      }
    } catch (err) {
      errors.push(`Failed to scan Amazon Games directory: ${dir}`);
      logger.error("[AmazonScanner] Failed to scan dir:", err);
    }
  }

  return { games, errors };
}
