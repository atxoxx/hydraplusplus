import type { GameShop, SteamReviewAnalysis } from "@types";
import { registerEvent } from "../register-event";
import { getSteamReviewAnalysisData } from "@main/services/steam-charts";
import { getResolvedSteamAppId } from "@main/services/steam-appid-mapping";

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
    const appId = await getResolvedSteamAppId(
      shop,
      objectId,
      gameTitle,
      controller.signal
    );
    if (appId === null) return null;
    return await getSteamReviewAnalysisData(appId, controller.signal);
  } finally {
    _event.sender.removeListener("ipc-message-sync", onAbort);
  }
};

registerEvent("getSteamReviewAnalysis", getSteamReviewAnalysis);
