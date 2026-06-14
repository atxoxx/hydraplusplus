import type { GameShop, SteamReviewSummary } from "@types";
import { registerEvent } from "../register-event";
import {
  getSteamReviewSummaryData,
  searchSteamGame,
} from "@main/services/steam-charts";

const getSteamReviewSummary = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  gameTitle: string
): Promise<SteamReviewSummary | null> => {
  if (shop === "steam") {
    const appId = parseInt(objectId, 10);
    if (isNaN(appId)) return null;
    return getSteamReviewSummaryData(appId);
  }

  const appId = await searchSteamGame(gameTitle);
  if (appId === null) return null;
  return getSteamReviewSummaryData(appId);
};

registerEvent("getSteamReviewSummary", getSteamReviewSummary);
