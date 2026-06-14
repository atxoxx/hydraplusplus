export interface SteamGenre {
  id: string;
  name: string;
}

export interface SteamCategory {
  id: number;
  description: string;
}

export interface SteamScreenshot {
  id: number;
  path_thumbnail: string;
  path_full: string;
}

export interface SteamVideoSource {
  max: string;
  "480": string;
}

export interface SteamMovie {
  id: number;
  dash_av1?: string;
  dash_h264?: string;
  hls_h264?: string;
  mp4?: SteamVideoSource;
  webm?: SteamVideoSource;
  thumbnail: string;
  name: string;
  highlight: boolean;
}

export interface SteamAppDetails {
  name: string;
  steam_appid: number;
  detailed_description: string;
  about_the_game: string;
  short_description: string;
  developers: string[];
  publishers: string[];
  genres: SteamGenre[];
  movies?: SteamMovie[];
  supported_languages: string;
  controller_support?: "full" | "partial";
  categories?: SteamCategory[];
  screenshots?: SteamScreenshot[];
  pc_requirements: {
    minimum: string;
    recommended: string;
  };
  mac_requirements: {
    minimum: string;
    recommended: string;
  };
  linux_requirements: {
    minimum: string;
    recommended: string;
  };
  release_date: {
    coming_soon: boolean;
    date: string;
  };
  content_descriptors: {
    ids: number[];
  };
}

export interface SteamShortcut {
  appid: number;
  appname: string;
  Exe: string;
  StartDir: string;
  icon: string;
  ShortcutPath: string;
  LaunchOptions: string;
  IsHidden: boolean;
  AllowDesktopConfig: boolean;
  AllowOverlay: boolean;
  OpenVR: boolean;
  Devkit: boolean;
  DevkitGameID: string;
  DevkitOverrideAppID: boolean;
  LastPlayTime: number;
  FlatpakAppID: string;
}

export interface CreateSteamShortcutOptions {
  openVr?: boolean;
}

export interface SteamPlayerCount {
  currentPlayers: number;
  allTimePeak: number | null;
  trend24h: number | null;
  trend7d: number | null;
  timestamp: number;
}

export interface SteamReviewSummary {
  reviewScoreDescriptor: string;
  totalPositive: number;
  totalNegative: number;
  totalReviews: number;
  reviewScore: number;
  recentReviewScoreDescriptor: string | null;
  recentPositive: number | null;
  recentNegative: number | null;
  recentTotal: number | null;
  recentReviewScore: number | null;
}

export interface SteamReviewHistoryPoint {
  date: string;
  positive: number;
  negative: number;
  total: number;
}

export interface SteamPlayerHistoryPoint {
  date: string;
  players: number;
}

export interface SteamReviewAnalysis {
  summary: SteamReviewSummary;
  history: SteamReviewHistoryPoint[];
  languageBreakdown: { language: string; count: number }[];
  playerHistory: SteamPlayerHistoryPoint[];
}
