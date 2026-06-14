import type { GameShop, SteamReviewAnalysis } from "@types";
import { registerEvent } from "../register-event";
import {
  getSteamReviewAnalysisData,
  searchSteamGame,
} from "@main/services/steam-charts";

const getSteamReviewAnalysis = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  gameTitle: string
): Promise<SteamReviewAnalysis | null> => {
  const controller = new AbortController();

  const onAbort = () => controller.abort();
  _event.sender.once("ipc-message-sync", onAbort);

  try {
    if (shop === "steam") {
      const appId = parseInt(objectId, 10);
      if (isNaN(appId)) return null;
      return await getSteamReviewAnalysisData(appId, controller.signal);
    }

    const appId = await searchSteamGame(gameTitle);
    if (appId === null) return null;
    return await getSteamReviewAnalysisData(appId, controller.signal);
  } finally {
    _event.sender.removeListener("ipc-message-sync", onAbort);
  }
};

registerEvent("getSteamReviewAnalysis", getSteamReviewAnalysis);
