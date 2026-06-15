import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";
import { findExecutable, sanitizeId } from "./shared";
import type { PlatformGame, PlatformScanResult } from "@types";

const XBOX_DEFAULT_DIRS = [
  String.raw`C:\XboxGames`,
  String.raw`C:\Program Files\WindowsApps`,
];

/** Known system directories/files to skip inside XboxGames */
const SKIP_PATTERNS = [
  "system",
  "windows",
  "microsoft",
  "xbox",
  "xboxlive",
  "gdk",
  ".vscode",
  "redist",
  "vcredist",
  "directx",
];

export function scanXboxGames(): PlatformScanResult {
  const games: PlatformGame[] = [];
  const errors: string[] = [];

  for (const dir of XBOX_DEFAULT_DIRS) {
    if (!fs.existsSync(dir)) continue;

    // On Windows, WindowsApps may have restricted access
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip system-like folder names
        const nameLower = entry.name.toLowerCase();
        if (SKIP_PATTERNS.some((p) => nameLower.includes(p))) continue;

        // XboxGames uses folder naming like "GameName" or "GameName_1.0.0.0_x64"
        const gamePath = path.join(dir, entry.name);

        // Look for a game executable directly or in a subfolder
        let exePath: string | null = null;

        if (nameLower.endsWith(".exe")) {
          // Entry itself might be an executable inside WindowsApps
          exePath = gamePath;
        } else {
          // Scan subdirectories for executables
          exePath = findExecutable(gamePath, 3);
        }

        if (!exePath) continue;

        // Extract a clean title from the folder name
        let title = entry.name;
        // Remove version/target info like "_1.0.0.0_x64" or "_x64"
        title = title.replace(/_\d+\.\d+\.\d+\.\d+_[a-zA-Z0-9_]+$/, "");
        title = title.replace(/_(x64|x86|arm64|neutral)$/i, "");
        // Replace underscores with spaces for readability
        title = title.replace(/_/g, " ").trim();

        // Skip extremely short names (likely not a game folder)
        if (title.length < 3) continue;

        const objectId = `xbox-${sanitizeId(entry.name)}`;

        if (!games.some((g) => g.objectId === objectId)) {
          games.push({
            objectId,
            title,
            shop: "xbox",
            executablePath: exePath,
            installPath: gamePath,
            iconUrl: null,
          });
        }
      }
    } catch (err) {
      errors.push(`Failed to scan Xbox directory: ${dir}`);
      logger.error("[XboxScanner] Failed to scan dir:", err);
    }
  }

  return { games, errors };
}
