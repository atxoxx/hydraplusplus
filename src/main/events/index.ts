import { appVersion, defaultDownloadsPath, isStaging } from "@main/constants";
import { envConfig } from "@main/env-config";
import { ipcMain } from "electron";

import "./auth";
import "./auth/steam-login";
import "./autoupdater";
import "./big-picture";
import "./catalogue";
import "./cloud-save";
import "./download-sources";
import "./friends";
import "./hardware";
import "./library";
import "./leveldb";
import "./misc";
import "./notifications";
import "./profile";
import "./themes";
import "./torrenting";
import "./user";
import "./user-preferences";
import "./watchlist";
import "./library/transfer-game-files";
import "./emulators";
import "./itad-giveaways";
import "./news";
import "./sessions/get-game-sessions";
import "./sessions/clear-activity-data";
import "./metadata/fetch-game-metadata";
import "./library/set-game-user-status";
import "./library/save-game-metadata";
import "./playtime";
import "./library/get-owned-game";
import "./store";

import { isPortableVersion } from "@main/helpers";

ipcMain.handle("ping", () => "pong");
ipcMain.handle("getVersion", () => appVersion);
ipcMain.handle("isStaging", () => isStaging);
ipcMain.handle("isPortableVersion", () => isPortableVersion());
ipcMain.handle("getDefaultDownloadsPath", () => defaultDownloadsPath);
ipcMain.handle("getCloudIframeUrl", () => {
  if (!envConfig.checkoutUrl) return null;
  return new URL("/cloud", envConfig.checkoutUrl).toString();
});
