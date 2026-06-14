import type { GameShop, SteamPlayerCount } from "@types";
import { registerEvent } from "../register-event";
import {
  getSteamPlayerCountData,
  searchSteamGame,
} from "@main/services/steam-charts";

const getSteamPlayerCount = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  gameTitle: string
): Promise<SteamPlayerCount | null> => {
  // For steam games, use the objectId directly as the app ID
  if (shop === "steam") {
    const appId = parseInt(objectId, 10);
    if (isNaN(appId)) return null;
    return getSteamPlayerCountData(appId);
  }

  // For non-steam games, try to search by name
  const appId = await searchSteamGame(gameTitle);
  if (appId === null) return null;
  return getSteamPlayerCountData(appId);
};

registerEvent("getSteamPlayerCount", getSteamPlayerCount);
