import type { GameShop, SteamReviewSummary } from "@types";
import { registerEvent } from "../register-event";
import { getSteamReviewSummaryData } from "@main/services/steam-charts";
import { getResolvedSteamAppId } from "@main/services/steam-appid-mapping";

const getSteamReviewSummary = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  gameTitle: string
): Promise<SteamReviewSummary | null> => {
  const appId = await getResolvedSteamAppId(shop, objectId, gameTitle);
  if (appId === null) return null;
  return getSteamReviewSummaryData(appId);
};

registerEvent("getSteamReviewSummary", getSteamReviewSummary);
