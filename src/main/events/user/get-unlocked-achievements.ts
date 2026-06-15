import type { GameShop, UserAchievement, UserPreferences } from "@types";
import { registerEvent } from "../register-event";
import { getGameAchievementData } from "@main/services/achievements/get-game-achievement-data";
import { db, gameAchievementsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { AchievementWatcherManager } from "@main/services/achievements/achievement-watcher-manager";

export const getUnlockedAchievements = async (
  objectId: string,
  shop: GameShop,
  useCachedData: boolean
): Promise<UserAchievement[]> => {
  const cachedAchievements = await gameAchievementsSublevel.get(
    levelKeys.game(shop, objectId)
  );

  const userPreferences = await db.get<string, UserPreferences | null>(
    levelKeys.userPreferences,
    {
      valueEncoding: "json",
    }
  );

  const showHiddenAchievementsDescription =
    userPreferences?.showHiddenAchievementsDescription || false;

  const achievementsData = await getGameAchievementData(
    objectId,
    shop,
    useCachedData
  );

  const unlockedAchievements = cachedAchievements?.unlockedAchievements ?? [];

  return achievementsData
    .map((achievementData) => {
      const unlockedAchievementData = unlockedAchievements.find(
        (localAchievement) => {
          return (
            localAchievement.name.toUpperCase() ==
            achievementData.name.toUpperCase()
          );
        }
      );

      const icongray = achievementData.icongray.endsWith("/")
        ? achievementData.icon
        : achievementData.icongray;

      if (unlockedAchievementData) {
        return {
          ...achievementData,
          unlocked: true,
          unlockTime: unlockedAchievementData.unlockTime,
        };
      }

      return {
        ...achievementData,
        unlocked: false,
        unlockTime: null,
        icongray: icongray,
        description:
          !achievementData.hidden || showHiddenAchievementsDescription
            ? achievementData.description
            : undefined,
      };
    })
    .sort((a, b) => {
      if (a.unlocked && !b.unlocked) return -1;
      if (!a.unlocked && b.unlocked) return 1;
      if (a.unlocked && b.unlocked) {
        return b.unlockTime! - a.unlockTime!;
      }
      return Number(a.hidden) - Number(b.hidden);
    });
};

const getUnlockedAchievementsEvent = async (
  _event: Electron.IpcMainInvokeEvent,
  objectId: string,
  shop: GameShop
): Promise<UserAchievement[]> => {
  // Redirect custom games with linked catalogue source
  if (shop === "custom") {
    const gameKey = levelKeys.game(shop, objectId);
    const game = await gamesSublevel.get(gameKey).catch(() => null);
    if (game?.linkedShop && game?.linkedObjectId) {
      await AchievementWatcherManager.firstSyncWithRemoteIfNeeded(
        game.linkedShop as GameShop,
        game.linkedObjectId
      );
      return getUnlockedAchievements(game.linkedObjectId, game.linkedShop as GameShop, false);
    }
  }

  await AchievementWatcherManager.firstSyncWithRemoteIfNeeded(shop, objectId);
  return getUnlockedAchievements(objectId, shop, false);
};

registerEvent("getUnlockedAchievements", getUnlockedAchievementsEvent);
