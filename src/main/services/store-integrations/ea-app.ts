import { BrowserWindow, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { BaseStore } from "./base-store";
import type { StoreGame, AuthResult, SyncResult } from "@types";

/**
 * EA App directories where games may be installed.
 * EA lets users choose install locations, so we scan common paths.
 */
const EA_GAME_DIRS = [
  "C:\\Program Files\\EA Games",
  "C:\\Program Files (x86)\\EA Games",
  "C:\\Program Files\\Electronic Arts",
  "C:\\Program Files (x86)\\Electronic Arts",
  "C:\\Program Files (x86)\\Origin Games",
  "C:\\Program Files\\Origin Games",
  "C:\\ProgramData\\Origin\\LocalContent",
];

const SKIP_DIRS = new Set([
  "ea app",
  "ea desktop",
  "origin",
  "redist",
  "vcredist",
  "directx",
  "_installer",
  "_commonredist",
  "support",
  "installer",
]);

function scanEAGames(): StoreGame[] {
  const games: StoreGame[] = [];
  const foundDirs = new Set<string>();

  for (const baseDir of EA_GAME_DIRS) {
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
        const objectId = `ea-${entry.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}`;

        games.push({
          storeGameId: objectId,
          title: entry.name,
          isOwned: true,
          isInstalled: true,
          installPath,
          executablePath: executable ?? null,
          extraData: {
            folderName: entry.name,
          },
        });
      }
    } catch {
      // Permission errors — skip
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

export class EAAppStore extends BaseStore {
  readonly storeId = "ea" as const;
  readonly storeName = "EA App";
  readonly storeIcon = "ea";
  readonly authMethod = "browser" as const;

  async login(parentWindow: BrowserWindow): Promise<AuthResult> {
    return new Promise((resolve) => {
      const loginWindow = new BrowserWindow({
        width: 800,
        height: 700,
        parent: parentWindow,
        modal: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      loginWindow.loadURL("https://www.ea.com/login", {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      });
      let resolved = false;

      loginWindow.webContents.on(
        "did-navigate",
        async (_event: Electron.Event, url: string) => {
          if (resolved) return;

          const isPostLogin =
            url.includes("ea.com/myaccount") ||
            url.includes("origin.com/account") ||
            (url.includes("ea.com/") && !url.includes("/login"));

          if (!isPostLogin) return;

          resolved = true;
          loginWindow.close();

          const account = {
            storeId: this.storeId,
            displayName: "EA User",
            accountId: "local",
            isAuthenticated: true,
          };

          await this.saveAccount(account);
          resolve({ success: true, account });
        }
      );

      loginWindow.on("closed", () => {
        if (!resolved) {
          resolve({ success: false, error: "Login window closed by user" });
        }
      });
    });
  }

  async logout(): Promise<void> {
    await this.clearStoredTokens();
  }

  async isTokenValid(): Promise<boolean> {
    const account = await this.loadAccount();
    return account?.isAuthenticated === true;
  }

  async refreshAuth(): Promise<boolean> {
    return this.isTokenValid();
  }

  async syncLibrary(): Promise<SyncResult> {
    // EA does not expose a public API. Scan the file system for installed games.
    try {
      const games = scanEAGames();
      await this.saveGames(games);
      this.log(`Synced ${games.length} games from local EA directories`);
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
    shell.openExternal(`origin2://game/download?offerId=${gameId}`);
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
            `EA App launch via spawn failed: ${error.message}. Falling back to shell.openPath.`
          );
          shell.openPath(game.executablePath!);
        });

        processRef.unref();
      } catch (error: any) {
        this.logError(
          `EA App launch spawn sync failed: ${error.message}. Falling back to shell.openPath.`
        );
        shell.openPath(game.executablePath);
      }
      return;
    }

    shell.openExternal(
      `origin2://game/launch?offerIds=${gameId}&autoDownload=0`
    );
  }
}
