import type { BrowserWindow } from "electron";
import type {
  StoreId,
  StoreStatus,
  StoreGameWithStore,
  StoreGame,
  PlatformGame,
  GameShop,
  SyncResult,
} from "@types";
import { storeGamesSublevel, levelKeys } from "@main/level";
import { BaseStore } from "./store-integrations/base-store";
import { EpicGamesStore } from "./store-integrations/epic-games";
import { GOGStore } from "./store-integrations/gog";
import { AmazonGamesStore } from "./store-integrations/amazon-games";
import { HumbleBundleStore } from "./store-integrations/humble-bundle";
import { UbisoftConnectStore } from "./store-integrations/ubisoft-connect";
import { EAAppStore } from "./store-integrations/ea-app";
import { BattleNetStore } from "./store-integrations/battle-net";
import { XboxGamePassStore } from "./store-integrations/xbox-game-pass";
import { PlatformScanner } from "./platform-scanner";
import { logger } from "./logger";
import { WindowManager } from "./window-manager";

class StoreManager {
  private stores: Map<StoreId, BaseStore> = new Map();
  private syncingStores: Set<StoreId> = new Set();
  private syncListeners: Array<(status: StoreStatus[]) => void> = [];

  constructor() {
    this.stores.set("epic", new EpicGamesStore());
    this.stores.set("gog", new GOGStore());
    this.stores.set("amazon", new AmazonGamesStore());
    this.stores.set("humble", new HumbleBundleStore());
    this.stores.set("ubisoft", new UbisoftConnectStore());
    this.stores.set("ea", new EAAppStore());
    this.stores.set("battle-net", new BattleNetStore());
    this.stores.set("xbox", new XboxGamePassStore());
  }

  getStore(storeId: StoreId): BaseStore | undefined {
    return this.stores.get(storeId);
  }

  getAllStores(): BaseStore[] {
    return Array.from(this.stores.values());
  }

  async getStoreStatuses(): Promise<StoreStatus[]> {
    const statuses: StoreStatus[] = [];

    for (const [storeId, store] of this.stores) {
      const account = await store.loadAccount();
      const gameCount = await this.getGameCount(storeId);
      const lastSync = await this.getLastSync(storeId);
      const isAuthenticated = account?.isAuthenticated ?? false;
      const isExpired =
        isAuthenticated &&
        account?.tokenExpiry != null &&
        Date.now() >= account.tokenExpiry - 60_000;

      statuses.push({
        storeId: storeId as StoreId,
        storeName: store.storeName,
        storeIcon: store.storeIcon,
        isAuthenticated,
        isExpired,
        lastSync,
        gameCount,
        isSyncing: this.syncingStores.has(storeId as StoreId),
      });
    }

    return statuses;
  }

  private async getGameCount(storeId: string): Promise<number> {
    let count = 0;
    const prefix = levelKeys.storeGameKey(storeId, "");

    try {
      for await (const [, storedGame] of storeGamesSublevel.iterator({
        gte: prefix,
        lte: prefix + "\uffff",
        valueEncoding: "json",
      })) {
        if ((storedGame as StoreGame).isOwned) count++;
      }
    } catch {
      // Sublevel not fully populated yet
    }

    return count;
  }

  private async getLastSync(storeId: string): Promise<number | undefined> {
    let maxSync = 0;
    const prefix = levelKeys.storeGameKey(storeId, "");

    try {
      for await (const [, _game] of storeGamesSublevel.iterator({
        gte: prefix,
        lte: prefix + "\uffff",
        valueEncoding: "json",
      })) {
        // No sync_date on StoreGame, use levelDB timestamps as approximation
        maxSync = Date.now();
        break;
      }
    } catch {
      // Ignore
    }

    return maxSync > 0 ? maxSync : undefined;
  }

  async login(storeId: StoreId, parentWindow: BrowserWindow) {
    const store = this.stores.get(storeId);
    if (!store) throw new Error(`Unknown store: ${storeId}`);
    const result = await store.login(parentWindow);

    // Auto-sync on successful login
    if (result.success) {
      this.syncStore(storeId).catch((err) =>
        logger.error(
          `[StoreManager] Auto-sync after login failed for ${storeId}:`,
          err
        )
      );
      this.notifySyncListeners();
    }

    return result;
  }

  async logout(storeId: StoreId) {
    const store = this.stores.get(storeId);
    if (!store) throw new Error(`Unknown store: ${storeId}`);
    return store.logout();
  }

  async syncStore(storeId: StoreId): Promise<SyncResult> {
    const store = this.stores.get(storeId);
    if (!store) throw new Error(`Unknown store: ${storeId}`);
    if (this.syncingStores.has(storeId))
      return {
        success: false,
        gamesSynced: 0,
        error: "Sync already in progress",
      };

    this.syncingStores.add(storeId);
    this.notifySyncListeners();

    try {
      const result = await store.syncLibrary();
      logger.log(
        `[StoreManager] Sync ${storeId}: ${result.gamesSynced} games, ${result.success ? "success" : "failed"}`
      );

      // Import synced games into the main library so they appear in the sidebar
      if (result.success && result.gamesSynced > 0) {
        await this.importSyncedGamesToLibrary(storeId);
      }

      return result;
    } catch (error: any) {
      logger.error(`[StoreManager] Sync ${storeId} failed:`, error);
      return { success: false, gamesSynced: 0, error: error.message };
    } finally {
      this.syncingStores.delete(storeId);
      this.notifySyncListeners();
    }
  }

  /**
   * Imports all store-synced games into the main gamesSublevel so they appear
   * in the sidebar library alongside locally-scanned games.
   */
  private async importSyncedGamesToLibrary(storeId: StoreId): Promise<void> {
    const store = this.stores.get(storeId);
    if (!store) return;

    const storeGames = await store.getStoredGames();
    let imported = 0;

    for (const sg of storeGames) {
      try {
        await PlatformScanner.importGame({
          title: sg.title,
          objectId: sg.storeGameId,
          shop: storeId as GameShop,
          iconUrl: sg.coverImageUrl ?? null,
          executablePath: sg.executablePath ?? null,
          installPath: sg.installPath ?? null,
        } satisfies PlatformGame);
        imported++;
      } catch (err) {
        logger.error(
          `[StoreManager] Failed to import ${sg.title} to library:`,
          err
        );
      }
    }

    if (imported > 0) {
      logger.log(
        `[StoreManager] Imported ${imported} games from ${storeId} into main library`
      );
      WindowManager.sendToAppWindows("on-library-batch-complete");
    }
  }

  /**
   * Auto-syncs all authenticated stores at app startup.
   * Runs in the background, non-blocking.
   */
  async autoSyncOnStartup(): Promise<void> {
    const statuses = await this.getStoreStatuses();
    const authenticated = statuses.filter(
      (s) => s.isAuthenticated && !s.isExpired
    );

    if (authenticated.length === 0) {
      logger.log("[StoreManager] No authenticated stores to auto-sync");
      return;
    }

    logger.log(
      `[StoreManager] Auto-syncing ${authenticated.length} stores: ${authenticated.map((s) => s.storeId).join(", ")}`
    );

    await Promise.allSettled(
      authenticated.map((s) => this.syncStore(s.storeId))
    );
  }

  async syncAllStores(): Promise<void> {
    const statuses = await this.getStoreStatuses();
    const authenticated = statuses
      .filter((s) => s.isAuthenticated)
      .map((s) => s.storeId);

    await Promise.allSettled(
      authenticated.map((storeId) => this.syncStore(storeId))
    );
  }

  async getAllOwnedGames(storeFilter?: StoreId): Promise<StoreGameWithStore[]> {
    const results: StoreGameWithStore[] = [];

    const storeIds = storeFilter
      ? [storeFilter]
      : (Array.from(this.stores.keys()) as StoreId[]);

    for (const storeId of storeIds) {
      const prefix = levelKeys.storeGameKey(storeId, "");
      try {
        for await (const [, game] of storeGamesSublevel.iterator({
          gte: prefix,
          lte: prefix + "\uffff",
          valueEncoding: "json",
        })) {
          const storeGame = game as StoreGame;
          if (storeGame.isOwned) {
            results.push({ ...storeGame, storeId });
          }
        }
      } catch {
        // Ignore
      }
    }

    results.sort((a, b) => a.title.localeCompare(b.title));
    return results;
  }

  async installGame(storeId: StoreId, gameId: string): Promise<void> {
    const store = this.stores.get(storeId);
    if (!store) throw new Error(`Unknown store: ${storeId}`);
    return store.installGame(gameId);
  }

  async launchGame(storeId: StoreId, gameId: string): Promise<void> {
    const store = this.stores.get(storeId);
    if (!store) throw new Error(`Unknown store: ${storeId}`);
    return store.launchGame(gameId);
  }

  /**
   * Publicly expose isTokenValid so callers can check expiry.
   */
  async isTokenValid(storeId: StoreId): Promise<boolean> {
    const store = this.stores.get(storeId);
    if (!store) return false;
    return store.isTokenValid();
  }

  async checkOwnership(gameTitle: string): Promise<StoreGameWithStore[]> {
    const allGames = await this.getAllOwnedGames();
    const normalized = gameTitle.toLowerCase().replace(/[^a-z0-9]/g, "");

    return allGames.filter((game) => {
      const gameNorm = game.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        gameNorm.includes(normalized) ||
        normalized.includes(gameNorm) ||
        levenshteinDistance(gameNorm, normalized) < 5
      );
    });
  }

  onSyncStatusChange(listener: (status: StoreStatus[]) => void) {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  private async notifySyncListeners() {
    const statuses = await this.getStoreStatuses();
    this.syncListeners.forEach((l) => l(statuses));
  }

  /**
   * Publicly expose loadAccount on the base store so PlatformScanner
   * and other services can check authentication status.
   */
  async getAccount(storeId: StoreId) {
    const store = this.stores.get(storeId);
    return store?.loadAccount() ?? null;
  }
}

export const storeManager = new StoreManager();

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) matrix[i][j] = matrix[i - 1][j - 1];
      else
        matrix[i][j] =
          Math.min(matrix[i - 1][j - 1], matrix[i - 1][j], matrix[i][j - 1]) +
          1;
    }
  }
  return matrix[b.length][a.length];
}
