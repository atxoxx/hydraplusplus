import type { Downloader } from "@shared";
import type {
  GameShop,
  SteamAchievement,
  UnlockedAchievement,
} from "./game.types";
import type { DownloadStatus } from "./download.types";
import type { ClassicsDisc } from "./emulator.types";
import type { UserGameStatus } from "./metadata.types";
import type { PlaytimeMapping } from "./how-long-to-beat.types";

export type SubscriptionStatus = "active" | "pending" | "cancelled";

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  plan: { id: string; name: string };
  expiresAt: string | null;
  paymentMethod: "pix" | "paypal";
}

export interface Auth {
  accessToken: string;
  refreshToken: string;
  tokenExpirationTimestamp: number;
  workwondersJwt: string;
}

export interface User {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  backgroundImageUrl: string | null;
  subscription: Subscription | null;
}

export interface Game {
  title: string;
  iconUrl: string | null;
  libraryHeroImageUrl: string | null;
  logoImageUrl: string | null;
  customIconUrl?: string | null;
  customLogoImageUrl?: string | null;
  customHeroImageUrl?: string | null;
  originalIconPath?: string | null;
  originalLogoPath?: string | null;
  originalHeroPath?: string | null;
  customOriginalIconPath?: string | null;
  customOriginalLogoPath?: string | null;
  customOriginalHeroPath?: string | null;
  playTimeInMilliseconds: number;
  unsyncedDeltaPlayTimeInMilliseconds?: number;
  lastTimePlayed: Date | null;
  addedToLibraryAt?: Date | null;
  objectId: string;
  shop: GameShop;
  remoteId: string | null;
  collectionIds?: string[];
  isDeleted: boolean;
  winePrefixPath?: string | null;
  protonPath?: string | null;
  executablePath?: string | null;
  executablePathUpdatedAt?: Date | null;
  launchOptions?: string | null;
  autoRunMangohud?: boolean | null;
  autoRunGamemode?: boolean | null;
  favorite?: boolean;
  isPinned?: boolean;
  achievementCount?: number;
  unlockedAchievementCount?: number;
  pinnedDate?: Date | null;
  automaticCloudSync?: boolean;
  hasManuallyUpdatedPlaytime?: boolean;
  newDownloadOptionsCount?: number;
  installedSizeInBytes?: number | null;
  installerSizeInBytes?: number | null;
  steamShortcutAppId?: number;
  platform?: string | null;
  discs?: ClassicsDisc[];
  selectedDiscPath?: string | null;
  dontAskDiscSelection?: boolean;
  /** Which platform source the game was imported from */
  source?: GameShop | null;
  /** Whether this game was auto-imported from a platform scan */
  autoImported?: boolean;
  /** SteamID64 of the family member who owns this game (Steam Family Share) */
  steamFamilyOwnerId?: string | null;
  /** Display name of the family member who owns this game (Steam Family Share) */
  steamFamilyOwnerName?: string | null;
  /** When a custom game is linked to a catalogue entry, the original shop (e.g. "steam") */
  linkedShop?: GameShop | null;
  /** When a custom game is linked to a catalogue entry, the original objectId */
  linkedObjectId?: string | null;
  /** How the game was acquired (hydra_catalogue, manual, steam_scan, etc.) */
  acquisitionSource?: string | null;
  /** Whether the game is on the user's watchlist */
  watched?: boolean;
  /** User-defined game status tag */
  userStatus?: UserGameStatus | null;
  /** When the user status was last changed */
  userStatusUpdatedAt?: Date | null;
  /** User-edited game description (overrides store description) */
  description?: string | null;
  /** User-defined genres (array of genre names, overrides store genres) */
  genres?: string[] | null;
  /** User-defined developers (overrides store developers) */
  developers?: string[] | null;
  /** User-defined publishers (overrides store publishers) */
  publishers?: string[] | null;
  /** User-defined tags (free-form tags) */
  tags?: string[] | null;
  /** User-defined release date (ISO date string, e.g. "2024-03-15") */
  releaseDate?: string | null;
  /** Manual override of the auto-matched playtime provider for this game. */
  playtimeMapping?: PlaytimeMapping | null;
}

export type WatchlistPriority = "must-play" | "want" | "later";

export interface WatchlistEntry {
  shop: GameShop;
  objectId: string;
  title: string;
  addedAt: string; // ISO date string
  priority: WatchlistPriority;
  notes: string;
  /** Download source IDs available when this game was added to the watchlist */
  initialDownloadSources: string[];
  /** Game image URL (libraryImageUrl from catalogue search result) */
  libraryImageUrl: string | null;
}

export interface Download {
  shop: GameShop;
  objectId: string;
  uri: string;
  folderName: string | null;
  downloadPath: string;
  progress: number;
  downloader: Downloader;
  bytesDownloaded: number;
  fileSize: number | null;
  shouldSeed: boolean;
  status: DownloadStatus | null;
  queued: boolean;
  pinnedToHero?: boolean;
  timestamp: number;
  extracting: boolean;
  extractionProgress?: number;
  automaticallyExtract: boolean;
  automaticallyDeleteArchiveFiles: boolean;
  fileIndices?: number[];
  selectedFilesSize?: number | null;
}

export interface DownloadLayoutState {
  version: 1;
  queueOrder: string[];
  pausedOrder: string[];
}

export interface GameAchievement {
  achievements: SteamAchievement[];
  unlockedAchievements: UnlockedAchievement[];
  updatedAt: number | undefined;
  language: string | undefined;
}

export type AchievementCustomNotificationPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface DownloadDirectoryPreference {
  path: string;
  createdAt: string;
  source: "manual" | "auto";
}

export interface UserPreferences {
  downloadsPath?: string | null;
  downloadDirectories?: DownloadDirectoryPreference[];
  optionalDownloadsPaths?: string[];
  ggDealsApiKey?: string | null;
  language?: string;
  realDebridApiToken?: string | null;
  premiumizeApiToken?: string | null;
  allDebridApiToken?: string | null;
  torBoxApiToken?: string | null;
  preferQuitInsteadOfHiding?: boolean;
  runAtStartup?: boolean;
  startMinimized?: boolean;
  launchToLibraryPage?: boolean;
  launchInBigPicture?: boolean;
  disableNsfwAlert?: boolean;
  enableAutoInstall?: boolean;
  seedAfterDownloadComplete?: boolean;
  showHiddenAchievementsDescription?: boolean;
  showDownloadSpeedInMegabits?: boolean;
  downloadNotificationsEnabled?: boolean;
  repackUpdatesNotificationsEnabled?: boolean;
  achievementNotificationsEnabled?: boolean;
  achievementCustomNotificationsEnabled?: boolean;
  achievementCustomNotificationPosition?: AchievementCustomNotificationPosition;
  achievementSoundVolume?: number;
  friendRequestNotificationsEnabled?: boolean;
  friendStartGameNotificationsEnabled?: boolean;
  showDownloadSpeedInMegabytes?: boolean;
  extractFilesByDefault?: boolean;
  deleteArchiveFilesAfterExtractionByDefault?: boolean;
  enableSteamAchievements?: boolean;
  autoplayGameTrailers?: boolean;
  hideToTrayOnGameStart?: boolean;
  enableNewDownloadOptionsBadges?: boolean;
  createStartMenuShortcut?: boolean;
  maxDownloadSpeedBytesPerSecond?: number | null;
  defaultProtonPath?: string | null;
  autoRunMangohud?: boolean;
  autoRunGamemode?: boolean;
  hideClassicsBookmark?: boolean;
  classicsUseHeroLayout?: boolean;
  /** Steam Web API key for fetching owned games and family share */
  steamApiKey?: string | null;
  /** SteamID64 of the logged-in Steam user */
  steamLoginUserId?: string | null;
  /** Display name of the logged-in Steam user */
  steamLoginUsername?: string | null;
  /** Steam web API access token obtained via BrowserWindow login */
  steamLoginAccessToken?: string | null;
  /** ISO timestamp when the access token was obtained */
  steamLoginTokenObtainedAt?: string | null;
  /** ISO timestamp of the last successful Steam sync */
  steamLastSyncAt?: string | null;
  /** SteamID64s of family sharing members to scan */
  steamFamilyShareIds?: string[];
  /** Per-platform scan configuration (keyed by GameShop) */
  platformScanConfigs?: Record<
    string,
    {
      enabled: boolean;
      scanPaths: string[];
      apiKey?: string | null;
      scanInstalled: boolean;
      fetchOwned: boolean;
      familyShareIds?: string[];
    }
  >;
  /** Import discovery preference: "wizard" to show modal, "auto" to auto-import */
  importDiscoveryPreference?: "wizard" | "auto";
  /** Show playtime badge on sidebar game items */
  sidebarShowPlaytimeBadge?: boolean;
  /** Show achievements badge on sidebar game items */
  sidebarShowAchievementsBadge?: boolean;
  /** Show friends badge on sidebar game items */
  sidebarShowFriendsBadge?: boolean;
  /** Show the News tab in the top navigation (default true) */
  sidebarShowNewsTab?: boolean;
  /** Show only unread articles in the News tab (default true) */
  newsShowOnlyUnread?: boolean;
  /** User-selected accent color (hex string, e.g. "#4a9eff"). Falls back to #4a9eff when null/undefined. */
  accentColor?: string | null;
  /** Language code for metadata search (e.g. "english", "french"). Falls back to UI language if null. */
  metadataSearchLanguage?: string | null;
  /** Hardware monitoring configuration */
  hardwareMonitorConfig?: {
    enabled: boolean;
    pollingIntervalMs: number;
    alertsEnabled: boolean;
    fpsAlertThreshold: number;
    cpuTempAlertThreshold: number;
    gpuTempAlertThreshold: number;
    cpuUsageAlertThreshold: number;
    ramUsageAlertThresholdMB: number;
  };
}

export interface ScreenState {
  x?: number;
  y?: number;
  height: number;
  width: number;
  isMaximized: boolean;
}
