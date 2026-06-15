import { registerEvent } from "../register-event";
import { PlatformScanner } from "@main/services/platform-scanner";
import { WindowManager } from "@main/services";
import type { PlatformGame } from "@types";

const scanPlatforms = async () => {
  return PlatformScanner.scanAll();
};

const importPlatformGames = async (
  _event: Electron.IpcMainInvokeEvent,
  games: PlatformGame[]
) => {
  const result = await PlatformScanner.importPlatformGames(games);
  WindowManager.sendToAppWindows("on-library-batch-complete");
  return result;
};

registerEvent("scanPlatforms", scanPlatforms);
registerEvent("importPlatformGames", importPlatformGames);
