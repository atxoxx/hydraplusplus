import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { BrowserWindow } from "electron";
import { shell } from "electron";
import { BaseStore } from "./base-store";
import type { StoreGame, AuthResult, SyncResult } from "@types";

/**
 * Ubisoft Connect integration using LOCAL data scanning (Playnite approach).
 * Ubisoft does NOT expose a public OAuth API for third-party apps.
 * Instead, we detect installed games via the Registry and Ubisoft Connect's local cache.
 */

const UBISOFT_REG_KEY =
  "HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs";

const UBISOFT_CACHE_DIRS = [
  path.join(os.homedir(), "AppData", "Local", "Ubisoft Game Launcher"),
  path.join(
    os.homedir(),
    "AppData",
    "Local",
    "Programs",
    "Ubisoft",
    "Ubisoft Game Launcher"
  ),
];

const UBISOFT_GAME_DIRS = [
  "C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games",
  "C:\\Program Files\\Ubisoft\\Ubisoft Game Launcher\\games",
  "C:\\Program Files (x86)\\Ubisoft\\Ubisoft Connect\\games",
  "C:\\Program Files\\Ubisoft\\Ubisoft Connect\\games",
  "C:\\Program Files (x86)\\Ubisoft",
  "C:\\Program Files\\Ubisoft",
];

const SKIP_DIRS = new Set([
  "ubisoft game launcher",
  "ubisoft connect",
  "ubisoft connect launcher",
]);

interface UbisoftRegEntry {
  name: string;
  installDir: string;
  executable: string;
}

function queryRegistry(keyPath: string): Map<string, UbisoftRegEntry> {
  const result = new Map<string, UbisoftRegEntry>();

  try {
    const output = execSync(`reg query "${keyPath}" /s 2>nul`, {
      encoding: "utf8",
      timeout: 5000,
    });

    const lines = output.split(/\r?\n/);
    let currentName = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect subkey name: HKEY_LOCAL_MACHINE\...\Installs\<GameId>
      const subkeyMatch = trimmed.match(
        /Installs\\(.+?)(?:\s+REG_SZ|\s+REG_DWORD|\s*$)/
      );
      if (subkeyMatch && !trimmed.includes("REG_")) {
        currentName = subkeyMatch[1];
        continue;
      }

      if (!currentName) continue;

      const valueMatch = trimmed.match(/\s+(.+?)\s+REG_SZ\s+(.+)$/);
      if (valueMatch) {
        const [, key, value] = valueMatch;
        let entry = result.get(currentName);
        if (!entry) {
          entry = { name: currentName, installDir: "", executable: "" };
          result.set(currentName, entry);
        }
        if (key === "InstallDir") entry.installDir = value;
        if (key === "Executable" || key === "Exe") entry.executable = value;
      }
    }
  } catch {
    // Registry key not found — Ubisoft Connect not installed
  }

  return result;
}

function scanFileSystem(): StoreGame[] {
  const games: StoreGame[] = [];
  const foundDirs = new Set<string>();

  for (const baseDir of UBISOFT_GAME_DIRS) {
    if (!fs.existsSync(baseDir)) continue;

    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const nameLower = entry.name.toLowerCase();
        if (SKIP_DIRS.has(nameLower)) continue;
        if (entry.name.startsWith(".")) continue;

        const installPath = path.join(baseDir, entry.name);
        if (foundDirs.has(installPath)) continue;
        foundDirs.add(installPath);

        const executable = findExe(installPath);
        const slug = entry.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        games.push({
          storeGameId: `ubisoft-${slug}`,
          title: entry.name,
          isOwned: true,
          isInstalled: true,
          installPath,
          executablePath: executable ?? null,
          extraData: {
            folderName: entry.name,
            slug,
          },
        });
      }
    } catch {
      // Permission errors, skip
    }
  }

  return games;
}

function findExe(dirPath: string): string | null {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
        return path.join(dirPath, entry.name);
      }
    }
    // Recurse one level
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const subExe = findExe(path.join(dirPath, entry.name));
        if (subExe) return subExe;
      }
    }
  } catch {
    // skip
  }
  return null;
}

function isUbisoftConnectInstalled(): boolean {
  // Check registry
  try {
    execSync(`reg query "${UBISOFT_REG_KEY}" 2>nul`, {
      encoding: "utf8",
      timeout: 3000,
    });
    return true;
  } catch {
    // Check cache dirs
  }
  for (const dir of UBISOFT_CACHE_DIRS) {
    if (fs.existsSync(dir)) return true;
  }
  // Check game dirs
  for (const dir of UBISOFT_GAME_DIRS) {
    if (fs.existsSync(dir)) return true;
  }
  return false;
}

export class UbisoftConnectStore extends BaseStore {
  readonly storeId = "ubisoft" as const;
  readonly storeName = "Ubisoft Connect";
  readonly storeIcon = "ubisoft";
  readonly authMethod = "client" as const;

  async login(_parentWindow: BrowserWindow): Promise<AuthResult> {
    const installed = isUbisoftConnectInstalled();

    if (!installed) {
      return {
        success: false,
        error:
          "Ubisoft Connect not detected. Please install Ubisoft Connect and log in first.",
      };
    }

    const account = {
      storeId: this.storeId,
      displayName: "Ubisoft Connect",
      accountId: "local",
      isAuthenticated: true,
    };

    await this.saveAccount(account);
    return { success: true, account };
  }

  async logout(): Promise<void> {
    await this.clearStoredTokens();
  }

  async isTokenValid(): Promise<boolean> {
    return isUbisoftConnectInstalled();
  }

  async refreshAuth(): Promise<boolean> {
    return isUbisoftConnectInstalled();
  }

  async syncLibrary(): Promise<SyncResult> {
    if (!isUbisoftConnectInstalled()) {
      await this.logSync({
        success: false,
        gamesSynced: 0,
        error: "Ubisoft Connect not detected",
      });
      return {
        success: false,
        gamesSynced: 0,
        error: "Ubisoft Connect not detected",
      };
    }

    try {
      const registryEntries = queryRegistry(UBISOFT_REG_KEY);
      const fileSystemGames = scanFileSystem();

      // Merge registry entries with file system scans
      const gamesMap = new Map<string, StoreGame>();

      for (const game of fileSystemGames) {
        gamesMap.set(game.storeGameId, game);
      }

      for (const [, entry] of registryEntries) {
        const slug = entry.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const storeGameId = `ubisoft-${slug}`;

        if (gamesMap.has(storeGameId)) {
          // Enrich existing entry
          const existing = gamesMap.get(storeGameId)!;
          if (!existing.installPath && entry.installDir) {
            existing.installPath = entry.installDir;
          }
          if (!existing.executablePath && entry.executable) {
            existing.executablePath = path.join(
              entry.installDir,
              entry.executable
            );
          }
        } else {
          // New entry from registry
          gamesMap.set(storeGameId, {
            storeGameId,
            title: entry.name,
            isOwned: true,
            isInstalled: !!entry.installDir,
            installPath: entry.installDir || null,
            executablePath: entry.installDir
              ? path.join(entry.installDir, entry.executable || "")
              : null,
            extraData: {
              folderName: entry.name,
              slug,
            },
          });
        }
      }

      const games = Array.from(gamesMap.values());
      await this.saveGames(games);
      this.log(`Synced ${games.length} games from local Ubisoft data`);
      await this.logSync({ success: true, gamesSynced: games.length });
      return { success: true, gamesSynced: games.length };
    } catch (error: any) {
      await this.logSync({
        success: false,
        gamesSynced: 0,
        error: error.message,
      });
      return { success: false, gamesSynced: 0, error: error.message };
    }
  }

  async getOwnedGames(): Promise<StoreGame[]> {
    return this.getStoredGames();
  }

  async installGame(gameId: string): Promise<void> {
    const games = await this.getStoredGames();
    const game = games.find((g) => g.storeGameId === gameId);

    // Ubisoft Connect must handle installs — open the launcher
    shell.openExternal("uplay://");
    this.log(`Requested Ubisoft install for: ${game?.title ?? gameId}`);
  }

  async launchGame(gameId: string): Promise<void> {
    const games = await this.getStoredGames();
    const game = games.find((g) => g.storeGameId === gameId);

    if (game?.executablePath && fs.existsSync(game.executablePath)) {
      const workingDirectory = path.dirname(game.executablePath);
      try {
        const processRef = spawn(game.executablePath, [], {
          shell: false,
          detached: true,
          stdio: "ignore",
          cwd: workingDirectory,
          env: process.env,
        });

        let errorFired = false;
        processRef.on("error", (error) => {
          if (errorFired) return;
          errorFired = true;
          this.logError(
            `Ubisoft Connect launch via spawn failed: ${error.message}. Falling back to shell.openPath.`
          );
          shell.openPath(game.executablePath!);
        });

        processRef.unref();
      } catch (error: any) {
        this.logError(
          `Ubisoft Connect launch spawn sync failed: ${error.message}. Falling back to shell.openPath.`
        );
        shell.openPath(game.executablePath);
      }
      return;
    }

    // Fallback: open Ubisoft Connect launcher
    shell.openExternal("uplay://");
    this.log(`Requested Ubisoft launch for: ${game?.title ?? gameId}`);
  }
}
