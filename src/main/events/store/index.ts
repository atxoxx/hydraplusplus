import { BrowserWindow, ipcMain } from "electron";
import { storeManager } from "@main/services/store-manager";
import { WindowManager } from "@main/services/window-manager";
import type { StoreId } from "@types";

/* Register store IPC handlers */

ipcMain.handle("stores:get-statuses", async () => {
  return storeManager.getStoreStatuses();
});

ipcMain.handle("stores:login", async (_event, storeId: StoreId) => {
  try {
    const window = WindowManager.mainWindow!;
    return await storeManager.login(storeId, window);
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("stores:logout", async (_event, storeId: StoreId) => {
  await storeManager.logout(storeId);
  return { success: true };
});

ipcMain.handle("stores:sync", async (_event, storeId: StoreId) => {
  try {
    const result = await storeManager.syncStore(storeId);
    return {
      success: result.success,
      gamesSynced: result.gamesSynced,
      error: result.error,
    };
  } catch (error: any) {
    return { success: false, gamesSynced: 0, error: error.message };
  }
});

ipcMain.handle("stores:sync-all", async () => {
  await storeManager.syncAllStores();
  return { success: true };
});

ipcMain.handle("stores:get-games", async (_event, storeId?: StoreId) => {
  return storeManager.getAllOwnedGames(storeId);
});

ipcMain.handle(
  "stores:install-game",
  async (_event, storeId: StoreId, gameId: string) => {
    try {
      await storeManager.installGame(storeId, gameId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
);

ipcMain.handle(
  "stores:launch-game",
  async (_event, storeId: StoreId, gameId: string) => {
    try {
      await storeManager.launchGame(storeId, gameId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
);

ipcMain.handle("stores:check-ownership", async (_event, gameTitle: string) => {
  return storeManager.checkOwnership(gameTitle);
});

// Forward sync status updates to all windows
storeManager.onSyncStatusChange((statuses) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("stores:sync-status-update", statuses);
    }
  }
});

// Auto-sync connected stores when the main window is ready
// Use a small delay to let the window load first
setTimeout(() => {
  storeManager.autoSyncOnStartup().catch(() => {
    // Best-effort; failures are logged internally
  });
}, 3000);
