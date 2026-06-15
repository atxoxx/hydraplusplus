# Multi-Platform Game Import — Specification

**Date:** June 15, 2026  
**Status:** Draft  
**Inspired by:** [PlayniteExtensions Libraries](https://github.com/JosefNemec/PlayniteExtensions/tree/master/source/Libraries) and [SteamFamilyLibrary](https://github.com/Antaneyes/SteamFamilyLibrary)

---

## 1. Overview

Add the ability for Hydra to detect, import, and display games from other gaming platforms (Steam, Epic, GOG, Battle.net, etc.) — both locally installed games (via file system scanning) and owned-but-not-installed games (via platform APIs). Integrate these games cleanly into the existing library and catalogue with proper filtering, visual distinction, and launch capabilities. Also support Steam Family Sharing to import games owned by family members.

---

## 2. Supported Platforms

All 10 platforms from the PlayniteExtensions Libraries suite will be supported:

| Platform         | GameShop value                     | Detection method                               |
| ---------------- | ---------------------------------- | ---------------------------------------------- |
| Steam            | `steam` (already exists; enhanced) | File scan (`steamapps/common`) + Steam Web API |
| Epic Games       | `epic`                             | File scan (Epic manifest `.item` files)        |
| GOG Galaxy       | `gog`                              | File scan (registry + GOG folders) + GOG API   |
| Battle.net       | `battle-net`                       | File scan (Battle.net game folders)            |
| Amazon Games     | `amazon`                           | File scan (Amazon Games library folders)       |
| Ubisoft Connect  | `ubisoft`                          | File scan (Ubisoft registry + folders)         |
| Xbox / Game Pass | `xbox`                             | File scan (WindowsApps / XboxGames folders)    |
| Rockstar Games   | `rockstar`                         | File scan (Rockstar Games Launcher folders)    |
| Itch.io          | `itch-io`                          | File scan (Itch.io app folders)                |
| Humble Games     | `humble`                           | File scan (Humble app folders)                 |

---

## 3. Data Model Changes

### 3.1 GameShop Extension

Extend the `GameShop` union type from:

```ts
type GameShop = "steam" | "custom" | "launchbox";
```

to:

```ts
type GameShop =
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
```

### 3.2 New Fields on Game Type

Add the following optional fields to the `Game` interface in `src/types/level.types.ts`:

```ts
/** Which platform source the game was imported from (epic, gog, etc.) */
source?: GameShop | null;

/** Whether this game was auto-imported (true) or manually added (false) */
autoImported?: boolean;

/** For Steam Family Share: the SteamID64 of the family member who owns the game */
steamFamilyOwnerId?: string | null;

/** For Steam Family Share: display name of the family member who owns the game */
steamFamilyOwnerName?: string | null;
```

### 3.3 Per-Platform Configuration

New user preferences sublevel or fields:

```ts
interface PlatformScanConfig {
  enabled: boolean;
  /** Paths to scan for installed games (platform-specific defaults + user overrides) */
  scanPaths: string[];
  /** API key if the platform requires one */
  apiKey?: string | null;
  /** Whether to scan for installed games */
  scanInstalled: boolean;
  /** Whether to fetch owned games via API */
  fetchOwned: boolean;
  /** For Steam: SteamID64s of family members for family share */
  familyShareIds?: string[];
}
```

Store as `platformScanConfigs: Record<GameShop, PlatformScanConfig>` in user preferences.

---

## 4. Detection & Import Mechanisms

### 4.1 File System Scanning (Installed Games)

For each platform, scan known installation directories. The scanner runs on app startup (configurable) and/or on-demand via a "Scan for games" button.

**Platform-specific scan locations (Windows — need macOS/Linux equivalents):**

| Platform        | Scan locations                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Steam           | `C:\Program Files (x86)\Steam\steamapps\common`, `D:\SteamLibrary\steamapps\common`, plus all Steam Library Folders from `libraryfolders.vdf` |
| Epic            | `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item` — parse JSON manifest for install location                                      |
| GOG             | Registry: `HKLM\Software\GOG.com\Games\*`, `HKLM\Software\WOW6432Node\GOG.com\Games\*` — each has `path` and `gameName`                       |
| Battle.net      | `C:\Program Files (x86)\Battle.net\Games\*`, `C:\Program Files (x86)\World of Warcraft\*` etc. — scan for `.exe` and `.build.info` files      |
| Amazon Games    | `C:\Program Files\WindowsApps\AmazonGames\*`, `%LOCALAPPDATA%\Amazon Games\*`                                                                 |
| Ubisoft Connect | Registry: `HKLM\Software\Ubisoft\Launcher\Installs\*` — each has `InstallDir`                                                                 |
| Xbox            | `C:\XboxGames\*`, `C:\Program Files\WindowsApps\*` (limited access — may need special handling)                                               |
| Rockstar        | `C:\Program Files\Rockstar Games\*`, `%PROGRAMDATA%\Rockstar Games\Launcher\*`                                                                |
| Itch.io         | `%APPDATA%\itch\apps\*` — each folder is a game                                                                                               |
| Humble          | `%APPDATA%\Humble Bundle\*`, `C:\Program Files (x86)\Humble Bundle\*`                                                                         |

### 4.2 API-Based (Owned but Not Installed)

| Platform | API                                 | Notes                                                                                |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| Steam    | `IPlayerService/GetOwnedGames`      | Requires Steam Web API key + user's SteamID64. Returns all owned games with playtime |
| GOG      | GOG API (via token from GOG Galaxy) | Read token from local GOG Galaxy data                                                |
| Epic     | Epic Games Launcher local data      | Parse local manifest data for owned game entitlements                                |
| Others   | Primarily file-scan based           | Most other launchers don't expose easy APIs for owned games                          |

### 4.3 Steam Family Share Detection

- Read local Steam config files to discover the user's SteamID64 and family sharing members
- Parse `%PROGRAMFILES(x86)%/Steam/config/config.vdf` for `SteamOwnerID` and family sharing info
- Alternatively, read `%PROGRAMFILES(x86)%/Steam/userdata/*/config/localconfig.vdf` for shared library info
- For each family member, call `IPlayerService/GetOwnedGames` with their SteamID64
- Import those games with `steamFamilyOwnerId` and `steamFamilyOwnerName` fields populated
- Games owned by family members appear in the catalogue only (see Section 6)

### 4.4 Import Flow

1. Scan runs (auto or manual trigger)
2. Discovered games are collected into a results set
3. **First run or if preference set to "wizard"**: Show a discovery modal listing all found games with:
   - Checkbox per game (all checked by default)
   - Platform icon, title, install path
   - "Import selected" and "Skip" buttons
   - "Always auto-import" preference checkbox
4. **If preference set to "auto"**: Silently add all discovered games to library
5. For API-discovered (not installed) games: add to catalogue search index, not to library

---

## 5. Library UI Changes

### 5.1 Category Filter Redesign

**Current:** `All | PC | Classics` tabs

**New:** `All | [Platform Dropdown] | Classics` tabs

- The "PC" tab is replaced by a platform dropdown (styled like the existing SelectField)
- Dropdown options: Steam, Epic, GOG, Battle.net, Amazon, Ubisoft, Xbox, Rockstar, Itch.io, Humble
- Dropdown includes an "All PC" option (selected by default) that shows all non-classics shops
- Selecting a specific platform filters to `game.shop === selectedPlatform`
- The "Classics" tab remains unchanged (filters to `game.shop === "launchbox"`)

### 5.2 Installation Status Tabs

New secondary tabs within the library for filtering by installation status:

`All | Installed | Not Installed`

- **All**: Default view, no install filter applied
- **Installed**: Shows games where `executablePath` is set **and** the file exists on disk
- **Not Installed**: Shows games where `executablePath` is null/undefined or the file no longer exists

These status tabs compose with the category/platform filter (i.e., they work as intersecting filters).

### 5.3 Platform Filter for Classics

The existing `PlatformFilter` (dropdown for PS1, PS2, etc.) continues to work for Classics. It also gains platform-based filtering for the new platforms when "All" category is selected — showing platform options like: "Steam", "Epic", "GOG", "PS1", "PS2", etc. combined.

### 5.4 Game Card Visual Distinction

Each `LibraryGameCard` and `LibraryGameCardLarge` gets a thin colored left border (3-4px) based on platform:

| Platform           | Color                                     |
| ------------------ | ----------------------------------------- |
| Steam              | `#1b2838` (Steam dark blue)               |
| Epic               | `#313131` (Epic dark)                     |
| GOG                | `#8a3ab9` (GOG purple)                    |
| Battle.net         | `#009ae4` (Battle.net blue)               |
| Amazon Games       | `#ff9900` (Amazon orange)                 |
| Ubisoft Connect    | `#3d1d6a` (Ubisoft purple)                |
| Xbox               | `#107c10` (Xbox green)                    |
| Rockstar           | `#f7b500` (Rockstar yellow)               |
| Itch.io            | `#fa5c5c` (Itch.io red)                   |
| Humble             | `#cb277e` (Humble pink)                   |
| lauchbox/Classics  | Keep existing gradient style              |
| custom             | No border (default)                       |
| Steam Family Share | Steam blue + subtle "shared" icon overlay |

### 5.5 Platform Badge on Cards

In addition to the colored border, each game card shows a small **platform icon** (16×16px) in one corner (bottom-right or top-right overlay). The icon is the platform's recognizable logo/icon.

### 5.6 Sort Options

Add a new sort option: `"source"` — sorts games by their platform source, then alphabetically within each source. The existing sort options remain unchanged.

---

## 6. Catalogue Integration

### 6.1 Platform Filters in Catalogue

Add a new `"Platform"` filter section to the catalogue filter sidebar (alongside existing Tags, Genres, Publishers, etc.):

- **Section title:** "Platform"
- **Items:** Checkboxes for Steam, Epic, GOG, Battle.net, Amazon, Ubisoft, Xbox, Rockstar, Itch.io, Humble, Classics (launchbox)
- **Behavior:** Selecting a platform filters catalogue results to games available on that platform
- API-discovered (not installed) games from each platform appear here

### 6.2 Platform Filter Chips

When a platform filter is active, it shows as a filter chip in the active filters bar (alongside existing tag/genre chips). The chip uses the platform's brand color orb and shows the platform name.

### 6.3 Platform in Search Results

Each `CatalogueSearchResult` already has a `shop` field (`GameShop`). The search results already show download source chips; platform info is displayed similarly as a small colored badge next to the title.

---

## 7. Launch Behavior

### 7.1 Direct Launch (Primary)

When a game has a valid `executablePath`, launch it directly (current behavior for Steam games downloaded via Hydra). This works for DRM-free games from any platform.

### 7.2 Launcher Protocol (Fallback)

If direct launch fails OR the game requires the launcher for DRM, use platform-specific protocols:

| Platform   | Protocol                                                            |
| ---------- | ------------------------------------------------------------------- |
| Steam      | `steam://rungameid/{appId}`                                         |
| Epic       | `com.epicgames.launcher://apps/{appName}?action=launch`             |
| GOG        | `goggalaxy://openGameView/{gameId}`                                 |
| Battle.net | `battlenet://{gameCode}` (e.g., `battlenet://WTCG` for Hearthstone) |
| Ubisoft    | `uplay://launch/{gameId}`                                           |
| Xbox       | `xbox://` or `msxbox://` protocol                                   |
| Others     | Fall back to direct `.exe` launch                                   |

The launch logic should:

1. Check if `executablePath` exists and is valid
2. Try direct launch
3. If direct launch fails (exit code non-zero, or process exits immediately), show an error and offer to launch via platform protocol
4. If the game is from a family share and executable doesn't exist locally, show "Game not installed — owned by [family member name]. Ask them to install it."

---

## 8. Metadata & Assets

### 8.1 Platform API Metadata Fetching

For each imported game, fetch metadata from the platform's API/store:

- **Steam**: Use existing `getGameShopDetails` flow — already fetches icons, covers, backgrounds from Steam store
- **Epic**: Parse Epic manifest data which includes app names; fetch additional metadata from Epic Games Store API or scrape store pages
- **GOG**: Use GOG API (`https://api.gog.com/products/{gameId}`) for covers and metadata
- **Other platforms**: Fetch from their respective store pages or use a generic fallback

### 8.2 Generic Fallback

If platform API is unavailable, use a generic placeholder:

- Show the game title centered on a dark background as the cover
- Use a generic "gamepad" or platform logo as the icon
- Store assets using the existing `gamesShopAssetsSublevel` pattern

---

## 9. Settings & Configuration

### 9.1 Settings Page Section

Add a new "Platform Import" section in the Hydra settings page:

```
┌─ Platform Import ─────────────────────────────────┐
│ ☑ Enable game import from other platforms          │
│                                                    │
│ ┌─ Steam ───────────────────────────────────────┐  │
│ │ ☑ Scan for installed Steam games              │  │
│ │ ☐ Fetch owned Steam games (API key required)  │  │
│ │ Steam Web API Key: [________________]         │  │
│ │ ☑ Auto-detect Steam Family Share              │  │
│ │ Additional scan paths:                        │  │
│ │   C:\Games\Steam                    [✕]       │  │
│ │   [+ Add path]                                │  │
│ └───────────────────────────────────────────────┘  │
│                                                    │
│ ┌─ Epic Games ──────────────────────────────────┐  │
│ │ ☑ Scan for installed Epic games               │  │
│ │ Additional scan paths: [none]                 │  │
│ └───────────────────────────────────────────────┘  │
│                                                    │
│ ... (one section per enabled platform) ...         │
│                                                    │
│ Import preference:                                 │
│   ○ Show discovery wizard for new games            │
│   ○ Auto-import all discovered games               │
└────────────────────────────────────────────────────┘
```

### 9.2 API Key Setup Prompt

When a user enables a platform that requires an API key (Steam), show an inline prompt:

- "A Steam Web API key is required. Get yours at: https://steamcommunity.com/dev/apikey"
- Text field to paste the key
- "Skip for now" button that keeps file scanning enabled but disables API features

---

## 10. Deduplication Strategy

If a game is already in the library (e.g., downloaded via Hydra) and also detected from a platform scan:

- **Keep both entries** as separate library items
- Each entry shows its source (Hydra download vs. Steam import)
- Users can manually remove either entry
- Both entries update independently (downloads, playtime, etc.)

This avoids complex merge logic and gives the user control.

---

## 11. Implementation Phases

### Phase 1: Foundation

- [ ] Extend `GameShop` type with all new platform values
- [ ] Add new fields to `Game` interface (`source`, `autoImported`, `steamFamilyOwnerId`, `steamFamilyOwnerName`)
- [ ] Create `PlatformScanConfig` type and storage
- [ ] Update all existing type usages to handle new `GameShop` values gracefully

### Phase 2: Steam Enhancement

- [ ] Extract Steam Family Share detection from local Steam config
- [ ] Integrate `IPlayerService/GetOwnedGames` API for owned games
- [ ] Integrate family member game fetching
- [ ] Add API key management for Steam
- [ ] Update scan-installed-games to support Steam specifically (already partially exists)

### Phase 3: Platform Scanners

- [ ] Implement Epic manifest scanner
- [ ] Implement GOG registry/scanner
- [ ] Implement Battle.net scanner
- [ ] Implement Amazon Games scanner
- [ ] Implement Ubisoft Connect scanner
- [ ] Implement Xbox scanner
- [ ] Implement Rockstar scanner
- [ ] Implement Itch.io scanner
- [ ] Implement Humble scanner

### Phase 4: API Integration

- [ ] GOG API integration for owned games
- [ ] Epic local entitlement data parsing
- [ ] Platform protocol launch handlers

### Phase 5: UI

- [ ] Category filter redesign (platform dropdown)
- [ ] Installation status tabs (All / Installed / Not Installed)
- [ ] Platform-colored borders on game cards
- [ ] Platform badge icons on game cards
- [ ] Discovery wizard modal
- [ ] Catalogue platform filter section
- [ ] Settings page for platform import configuration
- [ ] i18n for all new strings

### Phase 6: Polish

- [ ] Metadata fetching from platform APIs
- [ ] Generic fallback assets
- [ ] "Scan for games" manual trigger button
- [ ] Progress indicator during scan
- [ ] Notification on scan completion

---

## 12. File Change Map

| File                                                         | Changes                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `src/types/game.types.ts`                                    | Extend `GameShop` union                                                              |
| `src/types/level.types.ts`                                   | Add `source`, `autoImported`, `steamFamilyOwnerId`, `steamFamilyOwnerName` to `Game` |
| `src/types/index.ts`                                         | Add `PlatformScanConfig` type                                                        |
| `src/main/events/library/scan-installed-games.ts`            | Major rework — multi-platform scanning                                               |
| `src/main/services/`                                         | New files: `platform-scanner.ts` (main orchestrator), per-platform scanner files     |
| `src/main/level/sublevels/`                                  | New sublevel for platform scan config                                                |
| `src/renderer/src/pages/library/category-filter.tsx`         | Redesign — replace PC tab with platform dropdown                                     |
| `src/renderer/src/pages/library/library.tsx`                 | Add installation status tabs, update filter logic                                    |
| `src/renderer/src/pages/library/library-game-card.tsx`       | Add platform border + badge                                                          |
| `src/renderer/src/pages/library/library-game-card-large.tsx` | Add platform border + badge                                                          |
| `src/renderer/src/pages/catalogue/`                          | Add platform filter section                                                          |
| `src/renderer/src/features/catalogue-search.ts`              | Add platform filter state                                                            |
| `src/main/events/catalogue/`                                 | Add catalogue platform filtering                                                     |
| `src/renderer/src/components/`                               | New: `platform-icon.tsx`, `discovery-wizard-modal.tsx`                               |
| `src/renderer/src/pages/settings/`                           | New section for platform import config                                               |
| `src/main/services/steam.ts`                                 | Add family share detection                                                           |
| `src/locales/en/translation.json`                            | New translation keys                                                                 |
| `src/preload/index.ts`                                       | New IPC methods for platform scanning                                                |
| `src/renderer/src/declaration.d.ts`                          | New type declarations                                                                |

---

## 13. Open Questions / Future Considerations

1. **macOS/Linux paths**: The scan paths above are Windows-specific. Need equivalent paths for macOS and Linux.
2. **Xbox Game Pass DRM**: Xbox games have heavy DRM — direct executable launch may not work. Need special handling.
3. **Performance**: Scanning all platforms on startup could be slow. Consider background scanning with incremental results.
4. **Store page integration**: Should clicking an imported game open its store page on the platform's store?
5. **Re-scan interval**: How often should auto-scan run? On every app launch? Once per day?

---

## 14. i18n Key List (New Keys Needed)

```
library:
  category_platform_all: "All PC"
  filter_installed: "Installed"
  filter_not_installed: "Not Installed"
  filter_all: "All"
  scan_for_games: "Scan for games"
  platform_steam: "Steam"
  platform_epic: "Epic Games"
  platform_gog: "GOG Galaxy"
  platform_battle_net: "Battle.net"
  platform_amazon: "Amazon Games"
  platform_ubisoft: "Ubisoft Connect"
  platform_xbox: "Xbox"
  platform_rockstar: "Rockstar Games"
  platform_itch_io: "Itch.io"
  platform_humble: "Humble"
  steam_family_owner: "Owned by {name}"
  discovery_modal_title: "Games Discovered"
  discovery_modal_description: "{count} games found across your platforms. Select which ones to add."
  import_selected: "Import selected"
  skip_import: "Skip"
  auto_import_label: "Always auto-import future discoveries"
  scanning_platforms: "Scanning for games..."

catalogue:
  platform_filter: "Platform"

settings:
  platform_import: "Platform Import"
  enable_platform_import: "Enable game import from other platforms"
  api_key_required: "API key required"
  get_api_key: "Get your API key at"
  scan_installed_games: "Scan for installed games"
  fetch_owned_games: "Fetch owned games via API"
  additional_scan_paths: "Additional scan paths"
  add_path: "Add path"
  config_per_platform: "{platform} settings"
  import_preference: "Import preference"

notifications:
  scan_games_complete_title: "Game scan complete"
  scan_games_complete_description: "Found {count} new games across your platforms"
  scan_games_no_results_title: "No games found"
  scan_games_no_results_description: "No new games were discovered"
```
