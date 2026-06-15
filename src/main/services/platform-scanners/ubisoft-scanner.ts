import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";
import { findExecutable, sanitizeId } from "./shared";
import type { PlatformGame, PlatformScanResult } from "@types";

const UBISOFT_DEFAULT_DIRS = [
  String.raw`C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\games`,
  String.raw`C:\Program Files\Ubisoft\Ubisoft Game Launcher\games`,
  String.raw`C:\Program Files (x86)\Ubisoft\Ubisoft Connect\games`,
  String.raw`C:\Program Files\Ubisoft\Ubisoft Connect\games`,
];

const UBISOFT_INSTALL_DIRS = [
  String.raw`C:\Program Files (x86)\Ubisoft`,
  String.raw`C:\Program Files\Ubisoft`,
];

/** Known Ubisoft game subdirectories that may appear */
const SKIP_DIRS = [
  "Ubisoft Game Launcher",
  "Ubisoft Connect",
  "Ubisoft Connect Launcher",
];

export function scanUbisoftGames(): PlatformScanResult {
  const games: PlatformGame[] = [];
  const errors: string[] = [];

  // First pass: scan known game directories
  for (const dir of UBISOFT_DEFAULT_DIRS) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (SKIP_DIRS.some((s) => entry.name.includes(s))) continue;

        const gamePath = path.join(dir, entry.name);
        const exePath = findExecutable(gamePath, 2);
        const objectId = `ubisoft-${sanitizeId(entry.name)}`;

        if (exePath && !games.some((g) => g.objectId === objectId)) {
          games.push({
            objectId,
            title: entry.name,
            shop: "ubisoft",
            executablePath: exePath,
            installPath: gamePath,
            iconUrl: null,
          });
        }
      }
    } catch (err) {
      errors.push(`Failed to scan Ubisoft directory: ${dir}`);
      logger.error("[UbisoftScanner] Failed to scan dir:", err);
    }
  }

  // Second pass: scan the broader Ubisoft install dirs for game folders
  for (const dir of UBISOFT_INSTALL_DIRS) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip known non-game folders
        if (
          SKIP_DIRS.some((s) => entry.name.includes(s)) ||
          entry.name.startsWith(".")
        ) {
          continue;
        }

        // Skip folders already found in the first pass
        const foundId = `ubisoft-${sanitizeId(entry.name)}`;
        if (games.some((g) => g.objectId === foundId)) continue;

        const gamePath = path.join(dir, entry.name);
        const exePath = findExecutable(gamePath, 2);

        if (exePath) {
          games.push({
            objectId: foundId,
            title: entry.name,
            shop: "ubisoft",
            executablePath: exePath,
            installPath: gamePath,
            iconUrl: null,
          });
        }
      }
    } catch (err) {
      // Permission errors are expected for some subdirectories
      logger.debug("[UbisoftScanner] Could not scan directory:", dir);
    }
  }

  return { games, errors };
}
