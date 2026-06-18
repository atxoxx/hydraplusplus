import type { BrowserWindow } from "electron";
import { shell } from "electron";
import type {
  StoreGame,
  StoreAccount,
  AuthResult,
  SyncResult,
  StoreId,
  AuthMethod,
} from "@types";

export type { StoreGame, StoreAccount, AuthResult, SyncResult, StoreId };
import {
  storeAccountsSublevel,
  storeGamesSublevel,
  syncHistorySublevel,
  levelKeys,
} from "@main/level";
import { v4 as uuid } from "uuid";
import { logger } from "../logger";

export abstract class BaseStore {
  abstract readonly storeId: StoreId;
  abstract readonly storeName: string;
  abstract readonly storeIcon: string;
  abstract readonly authMethod: AuthMethod;

  protected account: StoreAccount | null = null;

  /* ------------------------------------------------------------------ */
  /*  Must-implement lifecycle hooks                                     */
  /* ------------------------------------------------------------------ */

  abstract login(parentWindow: BrowserWindow): Promise<AuthResult>;
  abstract logout(): Promise<void>;
  abstract syncLibrary(): Promise<SyncResult>;
  abstract getOwnedGames(): Promise<StoreGame[]>;
  abstract isTokenValid(): Promise<boolean>;
  abstract refreshAuth(): Promise<boolean>;

  /* ------------------------------------------------------------------ */
  /*  Optional install / launch hooks (override for URI-scheme stores)   */
  /* ------------------------------------------------------------------ */

  async installGame(_gameId: string): Promise<void> {
    throw new Error(`${this.storeName} does not support direct install`);
  }

  async launchGame(_gameId: string, _installPath?: string): Promise<void> {
    throw new Error(`${this.storeName} does not support direct launch`);
  }

  async uninstallGame(_gameId: string): Promise<void> {
    throw new Error(`${this.storeName} does not support direct uninstall`);
  }

  /* ------------------------------------------------------------------ */
  /*  LevelDB helpers                                                    */
  /* ------------------------------------------------------------------ */

  protected async saveAccount(account: StoreAccount): Promise<void> {
    const key = levelKeys.storeAccountsKey(account.storeId);
    await storeAccountsSublevel.put(key, account);
    this.account = account;
  }

  async loadAccount(): Promise<StoreAccount | null> {
    try {
      const key = levelKeys.storeAccountsKey(this.storeId);
      const account = await storeAccountsSublevel.get(key);
      return account ?? null;
    } catch {
      return null;
    }
  }

  protected async saveGames(games: StoreGame[]): Promise<void> {
    // Safeguard: if sync returned 0 games, don't wipe the existing library.
    // An empty result likely indicates an API anomaly, not a genuinely empty account.
    if (games.length === 0) {
      this.log(
        "Sync returned 0 games – skipping save to keep existing library"
      );
      return;
    }

    const batch = storeGamesSublevel.batch();

    // Mark all existing games for this store as not owned so stale entries
    // that no longer appear in the library get cleaned up.
    const existingKeys: string[] = [];
    for await (const [key] of storeGamesSublevel.iterator({
      gte: levelKeys.storeGameKey(this.storeId, ""),
      lte: levelKeys.storeGameKey(this.storeId, "\uffff"),
    })) {
      existingKeys.push(key);
    }

    for (const game of games) {
      const key = levelKeys.storeGameKey(this.storeId, game.storeGameId);
      batch.put(key, game);
    }

    // Remove keys that are no longer in the synced set
    const syncedKeys = new Set(
      games.map((g) => levelKeys.storeGameKey(this.storeId, g.storeGameId))
    );
    for (const oldKey of existingKeys) {
      if (!syncedKeys.has(oldKey)) {
        batch.del(oldKey);
      }
    }

    await batch.write();
  }

  protected async clearStoredTokens(): Promise<void> {
    const account = await this.loadAccount();
    if (account) {
      account.isAuthenticated = false;
      account.accessToken = null;
      account.refreshToken = null;
      account.tokenExpiry = undefined;
      await this.saveAccount(account);
    }
  }

  async getStoredGames(): Promise<StoreGame[]> {
    const games: StoreGame[] = [];
    const prefix = levelKeys.storeGameKey(this.storeId, "");

    for await (const [, game] of storeGamesSublevel.iterator({
      gte: prefix,
      lte: prefix + "\uffff",
    })) {
      if (game.isOwned) {
        games.push(game);
      }
    }

    return games;
  }

  /* ------------------------------------------------------------------ */
  /*  Sync history logging                                               */
  /* ------------------------------------------------------------------ */

  protected async logSync(result: SyncResult): Promise<void> {
    const entry = {
      id: uuid(),
      storeId: this.storeId,
      syncType: "library" as const,
      status: result.success ? ("success" as const) : ("failed" as const),
      gamesSynced: result.gamesSynced,
      errorMessage: result.error ?? null,
      startedAt: Date.now(),
      completedAt: Date.now(),
    };

    const key = levelKeys.syncHistoryKey(this.storeId, entry.id);
    await syncHistorySublevel.put(key, entry);
  }

  /* ------------------------------------------------------------------ */
  /*  Fallback: open external store page                                 */
  /* ------------------------------------------------------------------ */

  protected openStorePage(url: string): void {
    shell.openExternal(url);
  }

  /* ------------------------------------------------------------------ */
  /*  Logging shortcut                                                   */
  /* ------------------------------------------------------------------ */

  protected log(message: string, data?: unknown): void {
    logger.log(`[${this.storeName}] ${message}`, data ?? "");
  }

  protected logError(message: string, error?: unknown): void {
    logger.error(`[${this.storeName}] ${message}`, error ?? "");
  }
}
