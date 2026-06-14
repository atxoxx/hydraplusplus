# Game Website Links Panel — Specification

## Overview

Add a collapsible, tabbed website preview panel to the **renderer** game details page, placed **between the game description and the reviews section**. Each tab embeds an iframe preview of a gaming website relevant to the current game, with the ability to open the site in an external browser.

---

## 1. Placement & Scope

| Aspect                 | Detail                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Target view**        | Renderer only (`src/renderer/src/pages/game-details/`)                                                                                  |
| **Location in layout** | Between the game description section and the reviews section (inside `game-details__description-content` in `game-details-content.tsx`) |
| **Big Picture mode**   | Not in scope                                                                                                                            |

### Layout insertion point (in `game-details-content.tsx`)

```
[DescriptionHeader]
[GallerySlider]
[Description text (collapsible)]
  ↓
[NEW: Website Links Panel]  ← inserted here
  ↓
[GameReviews]
```

---

## 2. Panel Structure

### 2.1 Collapsible Panel

- Uses a collapsible header similar to `SidebarSection` but styled as a full-width horizontal panel (not sidebar card)
- Header shows: section title ("Websites" / translatable), chevron toggle icon
- Expand/collapse with smooth animation (max-height transition)
- Starts **expanded by default** on page load

### 2.2 Tab Bar

- Horizontal tab bar sits below the collapsible header
- Each tab shows: **site icon/logo (16px-20px) + site name text**
- Tabs scroll horizontally when they overflow (with gradient fade indicators on edges if scrolled)
- **Active tab** is visually highlighted with accent color/underline
- Tab order is user-customizable (persisted to LevelDB)

### 2.3 Iframe Preview Area

- Fixed height: **500px** (configurable via CSS variable)
- Shows an embedded iframe of the currently selected site's game page
- Internal scrollbar inside the iframe
- Sandbox attributes: `allow-scripts allow-same-origin` (no `allow-popups`, no `allow-forms` by default)
- Width: fills the available horizontal space

### 2.4 Per-Tab Actions

Each tab, when active, shows:

- An **"Open in Browser"** icon button in the top-right corner of the preview area (or tab bar right side)
- Opens the current site URL in the user's default external browser via `window.electron.openExternal(url)`

---

## 3. Supported Websites (12 sites)

For each site, URLs are auto-constructed from the game's data (`objectId` for Steam App ID, `gameTitle` for name-based search).

| #   | Site              | URL Pattern                                                            | Identifier                         | Iframe Notes                                                                     |
| --- | ----------------- | ---------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| 1   | **Steam Store**   | `https://store.steampowered.com/app/{appid}/`                          | Steam App ID                       | May block iframe via `X-Frame-Options` — use workaround (see §8)                 |
| 2   | **SteamDB**       | `https://steamdb.info/app/{appid}/`                                    | Steam App ID                       | Likely embeddable                                                                |
| 3   | **ProtonDB**      | `https://www.protondb.com/app/{appid}`                                 | Steam App ID                       | Likely embeddable (already linked in sidebar)                                    |
| 4   | **PCGamingWiki**  | `https://www.pcgamingwiki.com/wiki/{slug}`                             | Slugified game name                | Medium reliability — may need search fallback                                    |
| 5   | **Twitch**        | `https://www.twitch.tv/directory/game/{encoded_name}`                  | URL-encoded game name              | May not be embeddable — use workaround                                           |
| 6   | **NexusMods**     | `https://www.nexusmods.com/{game_domain}/`                             | Game-specific domain slug          | Requires game-domain resolution (hardest to auto-generate)                       |
| 7   | **ModDB**         | `https://www.moddb.com/games/{slug}`                                   | Slugified game name                | Likely embeddable                                                                |
| 8   | **GameFAQs**      | `https://gamefaqs.gamespot.com/search?game={encoded_name}`             | Search query fallback              | Direct game page needs platform+ID; use search as primary URL                    |
| 9   | **Metacritic**    | `https://www.metacritic.com/game/{slug}/`                              | Slugified game name                | Medium reliability                                                               |
| 10  | **HowLongToBeat** | `https://howlongtobeat.com/game/{id}`                                  | HLTB numeric ID                    | ID must be resolved via existing API integration; if unavailable, use search URL |
| 11  | **IGDB**          | `https://www.igdb.com/games/{slug}`                                    | Slugified game name                | Medium reliability                                                               |
| 12  | **YouTube**       | `https://www.youtube.com/results?search_query={encoded_name}+gameplay` | URL-encoded game name + "gameplay" | Embeddable                                                                       |

### 3.1 Slug Generation

For sites using slugs, generate from `gameTitle`:

- Lowercase the title
- Replace spaces/special characters with hyphens
- Remove non-alphanumeric characters (except hyphens)
- Trim leading/trailing hyphens

For sites where slug resolution is unreliable (PCGamingWiki, NexusMods, Metacritic, IGDB, GameFAQs), **use a search URL as fallback** if the direct URL returns a 404 or is blocked.

---

## 4. URL Construction Service

Create a new service: `src/renderer/src/services/website-links.service.ts`

```typescript
interface WebsiteLink {
  id: string; // unique slug: 'steam', 'steamdb', etc.
  name: string; // display name (translatable key)
  icon: string; // path to logo asset
  url: string; // constructed URL
  isEmbeddable: boolean; // whether iframe should be attempted
}
```

The service:

- Takes `objectId: string`, `shop: GameShop`, `gameTitle: string`, `shopDetails?: ShopDetailsWithAssets`
- Returns an array of `WebsiteLink` objects
- Uses the Steam App ID from `objectId` when `shop === "steam"`
- For non-Steam games, Steam-specific sites (Steam Store, SteamDB, ProtonDB) still appear but use search URLs or show a "not available" state

### URL construction logic per site:

```
steamStore    → https://store.steampowered.com/app/{objectId}/
                (only when shop === 'steam', else use search)
steamDB       → https://steamdb.info/app/{objectId}/
                (only when shop === 'steam')
protonDB      → https://www.protondb.com/app/{objectId}
                (only when shop === 'steam')
pcgamingwiki  → https://www.pcgamingwiki.com/wiki/{slug(gameTitle)}
                (for all games)
twitch        → https://www.twitch.tv/directory/game/{encodeURIComponent(gameTitle)}
                (for all games)
nexusmods     → https://www.nexusmods.com/games/{slug(gameTitle)}
                (search-based; for all games)
moddb         → https://www.moddb.com/games/{slug(gameTitle)}
                (for all games)
gamefaqs      → https://gamefaqs.gamespot.com/search?game={encodeURIComponent(gameTitle)}
                (search-based; for all games)
metacritic    → https://www.metacritic.com/game/{slug(gameTitle)}/
                (for all games)
howlongtobeat → Use HLTB ID from existing API integration if available,
                else https://howlongtobeat.com/?q={encodeURIComponent(gameTitle)}
igdb          → https://www.igdb.com/games/{slug(gameTitle)}
                (for all games)
youtube       → https://www.youtube.com/results?search_query={encodeURIComponent(gameTitle)}+gameplay
                (for all games)
```

---

## 5. User Preferences (Persistence)

### 5.1 Per-User Settings (stored in LevelDB user preferences)

```typescript
interface WebsiteLinksPreferences {
  enabledSites: string[]; // array of site IDs that are visible
  siteOrder: string[]; // ordered array of site IDs for tab ordering
  lastActiveTabPerGame: Record<string, string>; // gameKey → siteId
}
```

### 5.2 Default Values

- `enabledSites`: all 12 site IDs
- `siteOrder`: ["steam", "steamdb", "protondb", "pcgamingwiki", "twitch", "nexusmods", "moddb", "gamefaqs", "metacritic", "howlongtobeat", "igdb", "youtube"]
- `lastActiveTabPerGame`: empty (defaults to "steam" for all games)

### 5.3 Game Key

`${shop}:${objectId}` — e.g., `"steam:730"` for CS:GO

---

## 6. Default Tab

- **Default active tab** on first visit: **Steam Store** (`steam`)
- On subsequent visits: restore the **last active tab** for that specific game from `lastActiveTabPerGame`
- If the last active tab's site is no longer enabled, fall back to the first enabled tab in `siteOrder`

---

## 7. Loading State

- Show a **skeleton/loading spinner** inside the preview area while the iframe loads
- Skeleton: pulsing placeholder rectangle matching iframe dimensions, with a centered spinner icon
- Replace with actual iframe once loaded (use `onLoad` event)
- If iframe fails to load after 15 seconds, show error state with "Open in Browser" button

---

## 8. Iframe Embedding Workarounds

Many sites block iframe embedding via `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors 'none'`.

### Strategy:

1. **Try direct iframe** first for all sites
2. **Detect load failure**: use a combination of `onError` handler and a timeout (15 seconds)
3. **Fallback UI**: If iframe fails, show:
   - Site logo/icon (centered, large)
   - Site name
   - A brief description of the site
   - A prominent "Open in Browser" button
4. **Alternative approach**: For known blockers (Steam Store), optionally use a **proxy/redirect approach** — the Electron main process can fetch the page and serve it via a `local:` protocol URL, bypassing frame restrictions. Implement as a main process service:
   - `ipcMain.handle('fetch-web-proxy', async (event, url) => { ... })` — fetches HTML, rewrites relative URLs to absolute, serves via `protocol.handle`

---

## 9. Components to Create

```
src/renderer/src/pages/game-details/
└── website-links-panel/
    ├── website-links-panel.tsx       # Main collapsible panel component
    ├── website-links-panel.scss      # Panel styles
    ├── website-links-tab-bar.tsx     # Horizontal scrolling tab bar
    ├── website-links-tab.tsx         # Individual tab component
    ├── website-links-iframe.tsx      # Iframe preview + loading/error states
    └── index.ts                      # Re-export
```

### Assets needed:

```
src/renderer/src/assets/website-logos/
├── steam.svg
├── steamdb.svg
├── protondb.svg
├── pcgamingwiki.svg
├── twitch.svg
├── nexusmods.svg
├── moddb.svg
├── gamefaqs.svg
├── metacritic.svg
├── howlongtobeat.svg
├── igdb.svg
└── youtube.svg
```

---

## 10. Styling Requirements

### Panel Container

- Full width of `game-details__description-content`
- Background: dark, consistent with game details page (`#121212` / `$background-color`)
- Border: 1px solid `rgba(255, 255, 255, 0.08)` (matching `$border-color`)
- Border-radius: 12px
- Box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)
- Margin-top: 1.5 \* $spacing-unit gap from description toggle

### Collapsible Header

- Padding: 2.5 _ $spacing-unit vertical, 2 _ $spacing-unit horizontal
- Chevron icon: rotates 180° when expanded, transition 0.2s ease
- Title text: 14px, bold, $muted-color
- Hover: lighten background slightly

### Tab Bar

- Flex row, horizontal scroll with hidden scrollbar (or slim custom scrollbar)
- Gradient fade on left/right edges when scrolled (linear-gradient transparent → background-color)
- Each tab: padding 8px 16px, gap 8px between icon and text
- Active tab: bottom border 2px accent color (e.g., $brand-teal #16b195)
- Tab hover: background rgba(255, 255, 255, 0.05)
- Tab transition: background 0.15s ease, color 0.15s ease
- Tab icons: 18px width/height, object-fit contain, filter for light-on-dark
- Tab text: 12px, $body-color

### Iframe Area

- Height: 500px
- Width: 100%
- Border: none, top border 1px solid $border-color
- Iframe itself: width 100%, height 100%, border none
- Border-radius (bottom): 0 0 12px 12px
- Overflow: hidden (scrollbar inside iframe)

### Loading Skeleton

- Full 500px height placeholder
- Pulsing gradient animation (matching existing skeleton pattern)
- Centered spinner icon (16px, animated CSS rotation)

### Error / Fallback State

- Centered layout within the 500px area
- Large site logo (48px)
- Site name (16px, bold)
- "Preview unavailable" message (12px, muted)
- "Open in Browser" button (primary theme)

### Open in Browser Button

- Positioned in the top-right of the iframe area (absolute positioned, z-index above iframe)
- Icon button: external link icon (LinkExternalIcon from octicons)
- Tooltip: "Open in browser"
- Sits on a semi-transparent dark background pill

---

## 11. i18n / Translation

Add translation keys to `src/locales/en/translation.json` under `game_details` namespace:

```json
{
  "websites": "Websites",
  "open_in_browser": "Open in browser",
  "preview_unavailable": "Preview unavailable for this site",
  "website_steam": "Steam",
  "website_steamdb": "SteamDB",
  "website_protondb": "ProtonDB",
  "website_pcgamingwiki": "PCGamingWiki",
  "website_twitch": "Twitch",
  "website_nexusmods": "NexusMods",
  "website_moddb": "ModDB",
  "website_gamefaqs": "GameFAQs",
  "website_metacritic": "Metacritic",
  "website_howlongtobeat": "HowLongToBeat",
  "website_igdb": "IGDB",
  "website_youtube": "YouTube"
}
```

(Other language translations to be added later or via community contributions.)

---

## 12. Integration Points

### 12.1 Insert into `game-details-content.tsx`

- Import `WebsiteLinksPanel` component
- Insert `<WebsiteLinksPanel />` between the description section and `<GameReviews>`
- Pass required props: `objectId`, `shop`, `gameTitle`, `shopDetails`

### 12.2 Game Details Context

- No changes needed — all required data is already in `gameDetailsContext`

### 12.3 Redux / User Preferences

- Add `websiteLinksPreferences` to the `UserPreferences` type in `src/types/level.types.ts`
- Add a reducer/slice for website link preferences in the existing preferences slice
- On first load, use defaults

### 12.4 Main Process (if proxy needed)

- Register IPC handler for `fetch-web-proxy` in `src/main/`
- Handle URL fetching with proper headers and response rewriting

---

## 13. Edge Cases & Error Handling

| Scenario                                         | Behavior                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Game has no Steam App ID (custom/non-Steam game) | Steam, SteamDB, ProtonDB tabs still appear but use search URLs or fallback    |
| Iframe blocked by site policy                    | Show fallback card with "Open in Browser" button                              |
| Network offline                                  | Show "No internet connection" message                                         |
| Very long game names                             | Truncate tab text with ellipsis after 20 chars; full name in tooltip          |
| All tabs disabled by user                        | Show message "No websites enabled — customize in settings" with settings link |
| Game title has special characters                | Properly URL-encode for all search URLs                                       |
| Panel collapsed by default                       | Respect user preference; if no preference, default to expanded                |
| Rapid tab switching                              | Debounce iframe src changes (300ms) to avoid excessive network requests       |

---

## 14. Out of Scope

- Big Picture mode implementation (future enhancement)
- Real-time syncing of website preferences across devices
- Custom URL input per game per site
- Website screenshot thumbnails instead of iframes
- Analytics/analytics tracking for which sites users visit
- Content moderation / parental controls for embedded websites
- Mobile/responsive-specific layout changes (tablet only)

---

## 15. Testing Checklist

- [ ] Panel renders between description and reviews
- [ ] Collapse/expand works with smooth animation
- [ ] All 12 tabs render with correct icons and labels
- [ ] Tabs scroll horizontally when overflowed
- [ ] Clicking a tab switches the iframe preview
- [ ] Iframe loads for embeddable sites (ProtonDB, SteamDB)
- [ ] Fallback UI shows for non-embeddable sites (Steam Store)
- [ ] "Open in Browser" button works and opens external browser
- [ ] Loading skeleton appears while iframe loads
- [ ] Last active tab is remembered per game
- [ ] User preferences persist across app restarts
- [ ] Works for Steam games, custom games, and Launchbox games
- [ ] Tab text doesn't overflow with very long game names
- [ ] All 12 sites show for all game types
- [ ] i18n keys resolve correctly
