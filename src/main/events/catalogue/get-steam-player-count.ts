import type { GameShop, SteamPlayerCount } from "@types";
import { registerEvent } from "../register-event";
import { getSteamPlayerCountData } from "@main/services/steam-charts";
import { getResolvedSteamAppId } from "@main/services/steam-appid-mapping";

const getSteamPlayerCount = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  gameTitle: string
): Promise<SteamPlayerCount | null> => {
  const appId = await getResolvedSteamAppId(shop, objectId, gameTitle);
  if (appId === null) return null;
  return getSteamPlayerCountData(appId);
};

registerEvent("getSteamPlayerCount", getSteamPlayerCount);
