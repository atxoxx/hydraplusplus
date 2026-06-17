import type { GameShop, SteamReviewsPage, SteamReviewFilters } from "@types";
import { registerEvent } from "../register-event";
import { fetchSteamReviewsPage } from "@main/services/steam-charts";
import { getResolvedSteamAppId } from "@main/services/steam-appid-mapping";

const getSteamReviews = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  gameTitle: string,
  filters: SteamReviewFilters
): Promise<SteamReviewsPage | null> => {
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
    return await fetchSteamReviewsPage(appId, filters, controller.signal);
  } finally {
    _event.sender.removeListener("ipc-message-sync", onAbort);
  }
};

registerEvent("getSteamReviews", getSteamReviews);
