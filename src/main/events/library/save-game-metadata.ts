import { ipcMain } from "electron";
import { gamesSublevel, levelKeys } from "@main/level";
import type { Game, GameShop } from "@types";
import { networkLogger as logger } from "@main/services/logger";

export interface SaveGameMetadataPayload {
  shop: string;
  objectId: string;
  metadata: {
    description?: string | null;
    genres?: string[] | null;
    developers?: string[] | null;
    publishers?: string[] | null;
    tags?: string[] | null;
    releaseDate?: string | null;
    userStatus?: string | null;
    installedSizeInBytes?: number | null;
  };
}

ipcMain.handle(
  "saveGameMetadata",
  async (_event, payload: SaveGameMetadataPayload) => {
    try {
      const { shop, objectId, metadata } = payload;
      const gameKey = levelKeys.game(shop as GameShop, objectId);

      const game = await gamesSublevel.get(gameKey).catch(() => null);

      if (!game) {
        throw new Error(`Game not found: ${shop}:${objectId}`);
      }

      const updated: Game = { ...game };

      if ("description" in metadata) {
        updated.description = metadata.description ?? null;
      }
      if ("genres" in metadata) {
        updated.genres = metadata.genres ?? null;
      }
      if ("developers" in metadata) {
        updated.developers = metadata.developers ?? null;
      }
      if ("publishers" in metadata) {
        updated.publishers = metadata.publishers ?? null;
      }
      if ("tags" in metadata) {
        updated.tags = metadata.tags ?? null;
      }
      if ("releaseDate" in metadata) {
        updated.releaseDate = metadata.releaseDate ?? null;
      }
      if ("userStatus" in metadata) {
        const status = metadata.userStatus;
        if (status === "none" || status === null) {
          updated.userStatus = null;
          updated.userStatusUpdatedAt = null;
        } else {
          // Migrate legacy "to_play" → "plan_to_play"
          const normalized = status === "to_play" ? "plan_to_play" : status;
          updated.userStatus = normalized as Game["userStatus"];
          updated.userStatusUpdatedAt = new Date();
        }
      }
      if ("installedSizeInBytes" in metadata) {
        updated.installedSizeInBytes = metadata.installedSizeInBytes ?? null;
      }

      await gamesSublevel.put(gameKey, updated);

      return { ok: true, game: updated };
    } catch (error) {
      logger.error("saveGameMetadata failed:", error);
      return { ok: false, error: String(error) };
    }
  }
);
