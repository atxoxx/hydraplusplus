import { registerEvent } from "../register-event";
import { gamesSublevel, gamesShopAssetsSublevel, levelKeys } from "@main/level";
import { randomUUID } from "node:crypto";
import type { GameShop } from "@types";
import { seedSteamAppIdMapping } from "@main/services/steam-appid-mapping";

const addCustomGameToLibrary = async (
  _event: Electron.IpcMainInvokeEvent,
  title: string,
  executablePath: string,
  iconUrl?: string,
  logoImageUrl?: string,
  libraryHeroImageUrl?: string,
  libraryImageUrl?: string,
  coverImageUrl?: string,
  linkedShop?: GameShop | null,
  linkedObjectId?: string | null
) => {
  const objectId = randomUUID();
  const shop: GameShop = "custom";
  const gameKey = levelKeys.game(shop, objectId);

  const existingGames = await gamesSublevel.iterator().all();
  const existingGame = existingGames.find(
    ([_key, game]) => game.executablePath === executablePath && !game.isDeleted
  );

  if (existingGame) {
    throw new Error(
      "A game with this executable path already exists in your library"
    );
  }

  const assets = {
    updatedAt: Date.now(),
    objectId,
    shop,
    title,
    iconUrl: iconUrl || null,
    libraryHeroImageUrl: libraryHeroImageUrl || "",
    libraryImageUrl: libraryImageUrl || iconUrl || "",
    logoImageUrl: logoImageUrl || "",
    logoPosition: null,
    coverImageUrl: coverImageUrl || iconUrl || "",
    downloadSources: [],
  };
  await gamesShopAssetsSublevel.put(gameKey, assets);

  const game = {
    title,
    iconUrl: iconUrl || null,
    logoImageUrl: logoImageUrl || null,
    libraryHeroImageUrl: libraryHeroImageUrl || null,
    objectId,
    shop,
    remoteId: null,
    isDeleted: false,
    playTimeInMilliseconds: 0,
    lastTimePlayed: null,
    addedToLibraryAt: new Date(),
    executablePath,
    executablePathUpdatedAt: new Date(),
    launchOptions: null,
    linkedShop: linkedShop ?? null,
    linkedObjectId: linkedObjectId ?? null,
    favorite: false,
    automaticCloudSync: false,
    hasManuallyUpdatedPlaytime: false,
    acquisitionSource: "manual",
  };

  await gamesSublevel.put(gameKey, game);

  // Best-effort: pre-resolve a Steam AppID so reviews work the first time
  // the user opens the reviews tab. Fire-and-forget — network failures
  // must not roll back the custom-game add.
  void seedSteamAppIdMapping(shop, objectId, title);

  return game;
};

registerEvent("addCustomGameToLibrary", addCustomGameToLibrary);
