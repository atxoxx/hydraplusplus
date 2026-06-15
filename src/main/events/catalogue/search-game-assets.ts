import { registerEvent } from "../register-event";
import { searchGameAssets } from "@main/services/google-image-scraper";
import type { AssetType } from "@main/services/google-image-scraper";

const searchGameAssetsEvent = async (
  _event: Electron.IpcMainInvokeEvent,
  gameTitle: string,
  assetType: AssetType
) => {
  return searchGameAssets(gameTitle, assetType);
};

registerEvent("searchGameAssets", searchGameAssetsEvent);
