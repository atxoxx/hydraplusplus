# Asset Search Feature Specification

## Overview

Add a way for users to search for related game assets (icon, logo, hero) from Google Images directly within the Game Options → Assets panel. The search runs automatically when the assets tab opens, scraping Google Images with auto-tailored queries per asset type.

---

## User Story

As a Hydra user, when I open the Assets tab in the Game Options modal for any game (custom or non-custom), I want to see a panel of automatically-searchable related images from the web so that I can quickly find and apply high-quality icons, logos, and hero images without leaving the app.

---

## Architecture & Data Flow

### Component Tree

```
GameOptionsModal
  └── GameAssetsSettings (modified)
        ├── Asset type tabs (icon / logo / hero) — existing
        └── Split layout (NEW)
              ├── [Left] Search Results Panel (NEW)
              │     ├── Search status (loading / results / error / empty)
              │     ├── Results grid (thumbnails)
              │     ├── Disclaimer text
              │     └── Manual refresh button
              └── [Right] Current Asset Editor (existing)
                    ├── File path text field + browse/restore buttons
                    └── Image preview / drop zone
        └── Preview Modal (NEW)
              ├── Large image preview
              ├── Image metadata (dimensions, source URL)
              └── Apply / Cancel buttons
```

### Data Flow

```
1. User opens Assets tab → GameAssetsSettings mounts
2. useEffect triggers searchIPC(gameTitle, assetType) → IPC → main process
3. Main process scrapes Google Images (axios + cheerio)
4. Results returned to renderer → stored in React state (session cache)
5. Results rendered as thumbnail grid in left panel
6. User clicks thumbnail → Preview modal opens
7. User clicks Apply → image downloaded in main process → copyCustomGameAsset
8. Asset applied to game (existing updateCustomGame / updateGameCustomAssets flow)
```

---

## IPC Interface

### New Event: `searchGameAssets`

**Renderer → Main** (invoke):

```typescript
// Request
interface SearchGameAssetsRequest {
  gameTitle: string;
  assetType: "icon" | "logo" | "hero";
}

// Response
interface SearchGameAssetsResponse {
  results: AssetSearchResult[];
  query: string; // The actual query used
}

interface AssetSearchResult {
  id: string;           // Unique ID for this result (e.g., hash of URL)
  thumbnailUrl: string; // Google thumbnail URL
  fullImageUrl: string; // Full-size image URL (from source website)
  sourceUrl: string;    // The webpage the image appears on
  sourceName: string;   // Domain name of the source
  width: number | null;
  height: number | null;
}
```

**Preload registration** (`src/preload/index.ts`):

```typescript
searchGameAssets: (
  gameTitle: string,
  assetType: "icon" | "logo" | "hero"
): Promise<SearchGameAssetsResponse> =>
  ipcRenderer.invoke("searchGameAssets", gameTitle, assetType),
```

### Reuse Existing Events

- `copyCustomGameAsset` — already exists for storing downloaded images locally
- `updateCustomGame` / `updateGameCustomAssets` — already exist for applying assets to games
- `saveTempFile` / `deleteTempFile` — already exist for temp file handling

---

## Search Query Construction

Queries are auto-tailored per asset type and game title:

| Asset Type | Query Template                         | Example                                       |
| ---------- | -------------------------------------- | --------------------------------------------- |
| icon       | `"{gameTitle}" icon`                   | `"Grand Theft Auto V" icon`                   |
| logo       | `"{gameTitle}" logo png transparent`   | `"Grand Theft Auto V" logo png transparent`   |
| hero       | `"{gameTitle}" banner`                 | `"Grand Theft Auto V" banner`                 |

- The game title is the `game.title` from the current game
- Quotes are included around the game title for exact matching
- For custom games with potentially vague titles, the exact title as entered by the user is used

---

## Scraping Implementation (Main Process)

### Location

New file: `src/main/services/google-image-scraper.ts`

### Dependencies

- `axios` — already in the project (HTTP client)
- `cheerio` — **new dependency** (HTML parsing, similar to jQuery for Node.js)

### Algorithm

1. Construct a Google Images search URL:
   ```
   https://www.google.com/search?tbm=isch&q={encodedQuery}
   ```

2. Fetch the page with appropriate headers:
   ```typescript
   {
     "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...",
     "Accept": "text/html,application/xhtml+xml,...",
     "Accept-Language": "en-US,en;q=0.9",
   }
   ```

3. Parse the HTML with cheerio to extract image data from:
   - `<img>` tags with `src` attributes (thumbnails)
   - Parent `<a>` tags with `href` containing the full image URL and source URL
   - Google's inline JSON data structures if present

4. Filter results by aspect ratio for the asset type:

   | Asset Type | Aspect Ratio Range | Orientation |
   | ---------- | ------------------ | ----------- |
   | icon       | 0.8 – 1.2          | square-ish  |
   | logo       | > 1.5               | horizontal  |
   | hero       | > 2.0               | wide        |

   - Images without dimension metadata are included but ranked lower
   - If fewer than 5 results pass filtering, relax the aspect ratio constraints

5. Return up to 15 results

### Retry Logic

- On failure (HTTP error, HTML parse failure, empty results): retry once after 1-second delay
- If retry also fails: return an error response to the renderer
- The renderer shows an error message with a "Retry" button

### CORS Proxy Fallback

- If direct scraping fails due to Google blocking, attempt via a CORS proxy
- Use `https://api.allorigins.win/raw?url={encodedGoogleUrl}` or similar
- This is a second retry attempt before finally failing

---

## Session Cache

- Results are cached in the renderer using a `useRef` or `useState` at the component level
- Cache key: `${gameId}:${assetType}`
- Cache is cleared when:
  - The GameOptionsModal is closed (component unmounts)
  - User clicks a manual "Refresh" button
  - User switches to a different game (new modal instance)

---

## UI Design

### Split Layout

The existing `GameAssetsSettings` component is modified to use a two-column layout:

```
┌──────────────────────────────────────────────────────────────┐
│  [Icon]  [Logo]  [Hero]          ← asset type tabs (existing) │
├─────────────────────────┬────────────────────────────────────┤
│  Search Results         │  Current Asset                      │
│                         │                                    │
│  ┌────┐ ┌────┐ ┌────┐  │  ┌──────────────────────────────┐  │
│  │    │ │    │ │    │  │  │ Select icon                    │  │
│  └────┘ └────┘ └────┘  │  │                    [Browse]   │  │
│  ┌────┐ ┌────┐ ┌────┐  │  └──────────────────────────────┘  │
│  │    │ │    │ │    │  │                                    │
│  └────┘ └────┘ └────┘  │  ┌──────────────────────────────┐  │
│  ┌────┐ ┌────┐ ┌────┐  │  │                              │  │
│  │    │ │    │ │    │  │  │      Icon Preview             │  │
│  └────┘ └────┘ └────┘  │  │          (or)                │  │
│  ┌────┐ ┌────┐ ┌────┐  │  │      Drop Zone               │  │
│  │    │ │    │ │    │  │  │                              │  │
│  └────┘ └────┘ └────┘  │  └──────────────────────────────┘  │
│  ┌────┐                 │                                    │
│  │    │  (up to 15)     │  Resolution info: 256x256          │
│  └────┘                 │                                    │
│                         │                                    │
│  Images sourced from    │                                    │
│  the web. Respect       │                                    │
│  copyright.             │                                    │
├─────────────────────────┴────────────────────────────────────┤
│  [🔄 Refresh search]                                         │
└──────────────────────────────────────────────────────────────┘
```

### Search States

1. **Loading**: Show a skeleton grid (placeholder shimmer boxes) + "Searching..." text
2. **Results**: Show the thumbnail grid with up to 15 results
3. **Empty**: Show "No images found for [query]" with a suggestion to try different keywords or use the browse button
4. **Error**: Show "Search failed. [Retry]" with the error details collapsed

### Thumbnail Grid

- 3 columns of thumbnails
- Each thumbnail: ~100px square, `object-fit: cover`, with a subtle border
- Hover: border highlight + subtle scale (1.05)
- Click: opens the preview modal
- Thumbnails use the Google thumbnail URL (loads faster)

### Disclaimer

Small muted text at the bottom of the search panel:

> "Images sourced from the web. Respect copyright."

### Refresh Button

- A small button at the bottom of the search panel: "🔄 Refresh search"
- Clears the session cache and re-scrapes
- Only shown when results are already loaded (not during loading or error states)

---

## Preview Modal

### Trigger

User clicks a thumbnail in the search results grid.

### Modal Content

```
┌─────────────────────────────────────────────┐
│  Preview — Icon                     [✕]      │
├─────────────────────────────────────────────┤
│                                             │
│         ┌─────────────────────────┐         │
│         │                         │         │
│         │    Full-size preview    │         │
│         │    (scaled to fit)      │         │
│         │                         │         │
│         └─────────────────────────┘         │
│                                             │
│  Dimensions: 512 × 512                      │
│  Source: example.com                        │
│                                             │
│  Resolution info: Recommended 256×256      │
│                                             │
├─────────────────────────────────────────────┤
│                     [Cancel]    [Apply]     │
└─────────────────────────────────────────────┘
```

### Modal Behavior

- Full-size image loaded from `fullImageUrl` (not the Google cached thumbnail)
- Show a loading spinner while the full image loads
- Show image dimensions (if available from search result metadata)
- **Apply button**: Downloads the full image, copies it via `copyCustomGameAsset`, then triggers the existing asset update flow
- **Cancel / X**: Closes the modal, returns to the search results grid
- After successful apply: close the modal, show a success toast, update the right panel preview

---

## Applying an Asset

When the user clicks **Apply** in the preview modal:

1. Send the `fullImageUrl` to the main process
2. Main process downloads the image to a temp file (using existing `saveTempFile` or similar)
3. Call the existing `copyCustomGameAsset` IPC to copy it to the managed assets directory
4. Return the `local:` path to the renderer
5. Renderer updates `assetPaths` state and triggers the existing `pendingUpdateMessage` flow
6. The existing `updateCustomGame` / `updateGameCustomAssets` is called (reusing logic already in `GameAssetsSettings`)

---

## Game Type Handling

### Non-Custom Games (steam, launchbox)

- The existing default assets from `shopDetails` are preserved
- Applied assets set `customIconUrl` / `customLogoImageUrl` / `customHeroImageUrl` via `updateGameCustomAssets`
- "Restore default" button (existing) still works to revert

### Custom Games

- Assets are set directly on the game via `updateCustomGame`
- Same flow, different IPC call — already handled by existing code

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/main/services/google-image-scraper.ts` | Google Images scraping logic |
| `src/main/events/catalogue/search-game-assets.ts` | IPC event handler (main process side) |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/renderer/src/pages/game-details/modals/game-assets-settings.tsx` | Major: add search panel, results grid, preview modal, split layout, session cache |
| `src/renderer/src/pages/game-details/modals/game-assets-settings.scss` | Major: new split layout styles, search grid, preview modal, state styles |
| `src/preload/index.ts` | Add `searchGameAssets` IPC bridge |
| `src/main/events/index.ts` | Register new event (if needed) |
| `src/renderer/src/declaration.d.ts` | Add type for `searchGameAssets` |
| `src/locales/en/translation.json` | Add new i18n keys |
| All locale files (`src/locales/*/translation.json`) | Add new i18n keys (English-only initially, others default to English) |

---

## New i18n Keys

```
{
  "edit_game_modal_search_assets": "Search related assets",
  "edit_game_modal_searching": "Searching...",
  "edit_game_modal_no_results": "No images found for",
  "edit_game_modal_search_error": "Search failed. Please try again.",
  "edit_game_modal_search_retry": "Retry",
  "edit_game_modal_refresh_search": "Refresh search",
  "edit_game_modal_source": "Source",
  "edit_game_modal_dimensions": "Dimensions",
  "edit_game_modal_apply": "Apply",
  "edit_game_modal_cancel": "Cancel",
  "edit_game_modal_preview": "Preview",
  "edit_game_modal_disclaimer": "Images sourced from the web. Respect copyright.",
  "edit_game_modal_applying": "Applying...",
  "edit_game_modal_downloading_image": "Downloading image...",
  "edit_game_modal_image_applied": "{{type}} updated successfully!"
}
```

---

## New npm Dependency

- `cheerio` — HTML parsing for Google Images scraping
  - Install: `yarn add cheerio`
  - TypeScript types: included (`cheerio` ships types)

---

## Edge Cases & Error Handling

### Network Errors
- No internet: Show "No internet connection" message
- Timeout (>10s): Show "Search timed out" with retry button
- HTTP error (4xx/5xx): Show "Search failed" with retry button

### Google-Specific Issues
- CAPTCHA page: Detect and show "Google requires verification. Please try again later."
- Rate limiting: Show "Too many searches. Please wait a moment."
- HTML structure change: Falling back gracefully — if cheerio parsing returns 0 results, show "No images found"

### Image Loading Errors
- Broken thumbnail URL (`onError`): Show a placeholder icon instead
- Full image fails to load in modal: Show "Image could not be loaded"
- Invalid image format after download: Validate MIME type before applying

### Asset Type Switching
- When user switches tabs (icon → logo → hero), if the new type has NOT been searched yet, auto-trigger search
- If the new type HAS been searched (in cache), show cached results immediately

### Game Title Edge Cases
- Very short titles (<3 chars): Still search but append "game" keyword
- Titles with special characters: Properly URL-encode
- Empty title (shouldn't happen but defensive): Show "Please provide a game title"

### Concurrent Requests
- If user rapidly switches asset types, cancel any in-flight search requests
- Use an AbortController or cancel mechanism

### File Size
- Images >10MB: Warn user before downloading
- Images <1KB: Likely invalid, skip

---

## Non-Functional Requirements

### Performance
- Search results should display within 5 seconds (typical)
- Thumbnail grid should lazy-load images (using `loading="lazy"`)
- Modal full-image load should show a spinner within 200ms

### Accessibility
- All buttons have `aria-label` attributes
- Thumbnails have `alt` text ("Search result for {gameTitle} {assetType}")
- Keyboard navigation: Tab through thumbnails, Enter to open preview, Escape to close modal
- Focus trap within the preview modal

### Security
- Image downloads happen in the main process (sandboxed)
- Validate image MIME types before writing to disk
- Sanitize URLs before fetching
- Follow redirects (max 5) to avoid redirect loops

---

## Testing Considerations

### Unit Tests (future)
- `google-image-scraper.ts`: Test query construction, HTML parsing, aspect ratio filtering
- `GameAssetsSettings`: Test session cache logic, state transitions

### Manual Testing
1. Open a non-custom game with known assets → Assets tab → Verify search auto-runs
2. Switch asset types → Verify new search triggers / cache returns
3. Click a result → Preview modal → Apply → Verify asset is applied
4. Refresh search → Verify new results load
5. Disconnect internet → Open assets tab → Verify error state
6. Custom game with vague title → Verify search still works
7. Rapid tab switching → Verify no memory leaks or stale results
