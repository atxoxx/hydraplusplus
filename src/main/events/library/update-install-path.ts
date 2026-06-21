import { registerEvent } from "../register-event";
import { getDirectorySize } from "../helpers/get-directory-size";
import { gamesSublevel, levelKeys } from "@main/level";
import { logger } from "@main/services";
import type { GameShop } from "@types";

const updateInstallPath = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  installPath: string | null
) => {
  const gameKey = levelKeys.game(shop, objectId);

  const game = await gamesSublevel.get(gameKey).catch(() => null);
  if (!game) return;

  // Update immediately without size so UI responds fast
  await gamesSublevel.put(gameKey, {
    ...game,
    installPath: installPath || null,
  });

  // Calculate size in background and update later
  if (installPath) {
    try {
      const installedSizeInBytes = await getDirectorySize(installPath);
      const currentGame = await gamesSublevel.get(gameKey).catch(() => null);
      if (!currentGame) return;

      await gamesSublevel.put(gameKey, {
        ...currentGame,
        installedSizeInBytes,
      });
    } catch (err) {
      logger.error(`Failed to calculate game size from install path: ${err}`);
    }
  }
};

registerEvent("updateInstallPath", updateInstallPath);
