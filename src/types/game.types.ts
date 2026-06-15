export type GameShop =
  | "steam"
  | "custom"
  | "launchbox"
  | "epic"
  | "gog"
  | "battle-net"
  | "amazon"
  | "ubisoft"
  | "xbox"
  | "rockstar"
  | "itch-io"
  | "humble";

/** All supported GameShop values. Use this instead of hardcoding arrays. */
export const ALL_SHOPS: GameShop[] = [
  "steam",
  "custom",
  "launchbox",
  "epic",
  "gog",
  "battle-net",
  "amazon",
  "ubisoft",
  "xbox",
  "rockstar",
  "itch-io",
  "humble",
];

/** Non-classics, non-custom shop values (modern PC platforms). */
export const MODERN_SHOPS: GameShop[] = [
  "steam",
  "epic",
  "gog",
  "battle-net",
  "amazon",
  "ubisoft",
  "xbox",
  "rockstar",
  "itch-io",
  "humble",
];

export type ShortcutLocation = "desktop" | "start_menu";

export interface UnlockedAchievement {
  name: string;
  unlockTime: number;
}

export interface SteamAchievement {
  name: string;
  displayName: string;
  description?: string;
  icon: string;
  icongray: string;
  hidden: boolean;
  points?: number;
}

export interface UserAchievement extends SteamAchievement {
  unlocked: boolean;
  unlockTime: number | null;
}
