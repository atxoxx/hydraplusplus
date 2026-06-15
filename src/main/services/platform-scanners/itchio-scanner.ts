import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "../logger";
import { findExecutable, sanitizeId } from "./shared";
import type { PlatformGame, PlatformScanResult } from "@types";

const ITCH_APPDATA_DIR = path.join(
  os.homedir(),
  "AppData",
  "Roaming",
  "itch",
  "apps"
);

/** Alternative Itch install locations */
const ITCH_ALT_DIRS = [
  path.join(os.homedir(), ".itch", "apps"),
  String.raw`C:\Program Files (x86)\Itch\apps`,
  String.raw`C:\Program Files\Itch\apps`,
];

/** Files to skip that are definitely not games */
const SKIP_FILES = [
  ".itch",
  "itch.exe",
  "itch",
  "Itch",
  "unins000.exe",
  "unins000.dat",
];

export function scanItchIoGames(): PlatformScanResult {
  const games: PlatformGame[] = [];
  const errors: string[] = [];

  const allDirs = [ITCH_APPDATA_DIR, ...ITCH_ALT_DIRS];

  for (const dir of allDirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip system/launcher folders
        if (SKIP_FILES.includes(entry.name)) continue;

        const gamePath = path.join(dir, entry.name);

        // Each folder in the itch apps directory represents a game
        // The folder name is usually "game" or "game-windows" etc.
        const exePath = findExecutable(gamePath, 3);

        if (!exePath) continue;

        // Parse the game title from the folder name
        // itch.io installs typically look like "GameName" or "author-GameName"
        let title = entry.name;
        // Remove author prefix if present (e.g., "developer-GameName" -> "GameName")
        const parts = title.split("-");
        if (parts.length > 1) {
          // The first part might be the author, but it's hard to tell
          // Keep the last part as the most likely game name
          // Actually, itch.io folder naming varies. Try to use the full name.
          // The folder might also have platform suffix like "-windows"
          title = entry.name
            .replace(/-windows$/i, "")
            .replace(/-linux$/i, "")
            .replace(/-mac$/i, "")
            .replace(/-win$/i, "")
            .replace(/-osx$/i, "")
            .trim();
        }

        const objectId = `itch-${sanitizeId(entry.name)}`;

        if (!games.some((g) => g.objectId === objectId)) {
          games.push({
            objectId,
            title: title || entry.name,
            shop: "itch-io",
            executablePath: exePath,
            installPath: gamePath,
            iconUrl: null,
          });
        }
      }
    } catch (err) {
      errors.push(`Failed to scan Itch.io directory: ${dir}`);
      logger.error("[ItchIoScanner] Failed to scan dir:", err);
    }
  }

  return { games, errors };
}
