import { ipcMain, shell } from "electron";
import {
  findOwnedGame,
  storeDeepLink,
} from "@main/services/library-sync/owned-game-lookup";

ipcMain.handle("get-owned-game", async (_event, title: string) => {
  const entry = await findOwnedGame(title);
  if (!entry) return null;

  return {
    ...entry,
    storeUrl: storeDeepLink(entry),
  };
});

ipcMain.handle("open-store-for-game", async (_event, storeUrl: string) => {
  await shell.openExternal(storeUrl);
});
