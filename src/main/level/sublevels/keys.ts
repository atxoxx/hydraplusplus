import type { GameShop } from "@types";

export const levelKeys = {
  games: "games",
  game: (shop: GameShop, objectId: string) => `${shop}:${objectId}`,
  user: "user",
  auth: "auth",
  themes: "themes",
  gameShopAssets: "gameShopAssets",
  gameStatsCache: "gameStatsAssets",
  gameShopCache: "gameShopCache",
  gameShopCacheItem: (shop: GameShop, objectId: string, language: string) =>
    `${shop}:${objectId}:${language}`,
  gameAchievements: "gameAchievements",
  downloads: "downloads",
  downloadLayoutState: "downloadLayoutState",
  userPreferences: "userPreferences",
  language: "language",
  screenState: "screenState",
  rpcPassword: "rpcPassword",
  downloadSources: "downloadSources",
  downloadSourcesCheckBaseline: "downloadSourcesCheckBaseline", // When we last started the app
  downloadSourcesSinceValue: "downloadSourcesSinceValue", // The 'since' value API used (for modal comparison)
  localNotifications: "localNotifications",
  commonRedistPassed: "commonRedistPassed", // Whether common redistributables preflight has passed
  emulators: "emulators",
  ps2MemoryCardSaves: "ps2MemoryCardSaves",
  ps2MemoryCardSave: (cardFilePath: string, folderName: string) =>
    `${cardFilePath}::${folderName}`,
  ps1MemoryCardSaves: "ps1MemoryCardSaves",
  ps1MemoryCardSave: (cardFilePath: string, identifier: string) =>
    `${cardFilePath}::${identifier}`,
  dailyPlaytime: "dailyPlaytime",
  dailyPlaytimeEntry: (shop: GameShop, objectId: string, date: string) =>
    `${shop}:${objectId}:${date}`,
  sessions: "sessions",
  session: (shop: GameShop, objectId: string, sessionId: string) =>
    `${shop}:${objectId}:${sessionId}`,
  watchlist: "watchlist",
  watchlistEntry: (shop: GameShop, objectId: string) => `${shop}:${objectId}`,
  metadataCache: "metadataCache",
  metadataCacheEntry: (shop: string, objectId: string) => `${shop}:${objectId}`,
  crackwatchCache: "crackwatchCache",
  newsFeeds: "newsFeeds",
  newsReadState: "newsReadState",
  steamAppIdMapping: "steamAppIdMapping",
  steamAppIdMappingKey: (shop: GameShop, objectId: string) =>
    `${shop}:${objectId}`,
};
