import { registerEvent } from "../register-event";
import { db, levelKeys } from "@main/level";
import { SteamFamilyScanner } from "@main/services/steam-family-scanner";
import type { UserPreferences, SteamFamilyGame } from "@types";
import { WindowManager } from "@main/services";

const scanSteamFamily = async () => {
  const userPreferences = await db.get<string, UserPreferences | null>(
    levelKeys.userPreferences,
    { valueEncoding: "json" }
  );

  const apiKey = userPreferences?.steamApiKey ?? null;
  if (!apiKey) {
    return {
      ownGames: [],
      familyGames: [],
      localUsers: [],
      discoveredFamilyMembers: [],
      errors: [
        "No Steam Web API key configured. Add your API key in Settings.",
      ],
    };
  }

  const additionalIds = userPreferences?.steamFamilyShareIds ?? [];

  return SteamFamilyScanner.scan(apiKey, additionalIds);
};

const importSteamFamilyGames = async (
  _event: Electron.IpcMainInvokeEvent,
  games: SteamFamilyGame[]
) => {
  let imported = 0;
  const errors: string[] = [];

  for (const game of games) {
    try {
      await SteamFamilyScanner.importGameToLibrary(game);
      imported++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to import ${game.title}: ${message}`);
    }
  }

  WindowManager.sendToAppWindows("on-library-batch-complete");
  return { imported, errors };
};

registerEvent("scanSteamFamily", scanSteamFamily);
registerEvent("importSteamFamilyGames", importSteamFamilyGames);
