import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";
import { findExecutable } from "./shared";
import type { PlatformGame, PlatformScanResult } from "@types";

const EPIC_MANIFEST_DIRS = [
  String.raw`C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests`,
];

export function scanEpicGames(): PlatformScanResult {
  const games: PlatformGame[] = [];
  const errors: string[] = [];

  for (const dir of EPIC_MANIFEST_DIRS) {
    if (!fs.existsSync(dir)) continue;

    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".item"));
    } catch (err) {
      errors.push(`Failed to read Epic manifests directory: ${dir}`);
      logger.error("[EpicScanner] Failed to read manifests dir:", err);
      continue;
    }

    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const manifest = JSON.parse(content);

        const installLocation: string | undefined = manifest.InstallLocation;
        const displayName: string | undefined =
          manifest.DisplayName ?? manifest.AppName;
        const catalogItemId: string | undefined = manifest.CatalogItemId;

        if (!installLocation || !fs.existsSync(installLocation)) continue;
        if (!displayName) continue;

        const objectId = catalogItemId ?? path.basename(file, ".item");

        const exePath = findExecutable(installLocation, 3);

        games.push({
          objectId,
          title: displayName,
          shop: "epic",
          executablePath: exePath,
          installPath: installLocation,
          iconUrl: null,
        });
      } catch (err) {
        logger.error(`[EpicScanner] Failed to parse ${file}:`, err);
      }
    }
  }

  return { games, errors };
}
