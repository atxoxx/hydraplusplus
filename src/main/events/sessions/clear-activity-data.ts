import type { GameShop } from "@types";
import { sessionsSublevel, dailyPlaytimeSublevel } from "@main/level";
import { registerEvent } from "../register-event";
import { logger } from "@main/services";

const clearActivityData = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<{ success: boolean; error?: string }> => {
  const prefix = `${shop}:${objectId}:`;
  const errors: string[] = [];

  // Clear sessions
  try {
    const sessionKeysToDelete: string[] = [];
    for await (const [key] of sessionsSublevel.iterator()) {
      if (key.startsWith(prefix)) {
        sessionKeysToDelete.push(key);
      }
    }
    if (sessionKeysToDelete.length > 0) {
      await sessionsSublevel.batch(
        sessionKeysToDelete.map((key) => ({ type: "del" as const, key }))
      );
    }
  } catch (error) {
    logger.error("Failed to clear sessions", error);
    errors.push("Failed to clear session data");
  }

  // Clear daily playtime entries
  try {
    const playtimeKeysToDelete: string[] = [];
    for await (const [key] of dailyPlaytimeSublevel.iterator()) {
      if (key.startsWith(prefix)) {
        playtimeKeysToDelete.push(key);
      }
    }
    if (playtimeKeysToDelete.length > 0) {
      await dailyPlaytimeSublevel.batch(
        playtimeKeysToDelete.map((key) => ({ type: "del" as const, key }))
      );
    }
  } catch (error) {
    logger.error("Failed to clear daily playtime", error);
    errors.push("Failed to clear playtime data");
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join("; ") };
  }

  return { success: true };
};

registerEvent("clearActivityData", clearActivityData);
