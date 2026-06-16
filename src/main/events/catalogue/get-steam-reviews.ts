import type { GameShop, SteamReviewsPage, SteamReviewFilters } from "@types";
import { registerEvent } from "../register-event";
import { fetchSteamReviewsPage, searchSteamGame } from "@main/services/steam-charts";

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
    if (shop === "steam") {
      const appId = parseInt(objectId, 10);
      if (isNaN(appId)) return null;
      return await fetchSteamReviewsPage(
        appId,
        filters,
        controller.signal
      );
    }

    const appId = await searchSteamGame(gameTitle);
    if (appId === null) return null;
    return await fetchSteamReviewsPage(appId, filters, controller.signal);
  } finally {
    _event.sender.removeListener("ipc-message-sync", onAbort);
  }
};

registerEvent("getSteamReviews", getSteamReviews);
