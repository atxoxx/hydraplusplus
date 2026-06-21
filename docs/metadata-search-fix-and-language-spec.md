# Metadata Search Fix & Language Selection Spec

## Overview

Two-part feature request:

1. **Bug Fix**: After applying metadata from the search modal to a game, the fields in the Metadata General and Description sections of the Game Options modal do not reflect the updated values — they remain stale.
2. **New Feature**: Add a language selector dropdown to the metadata search modal so users can search for metadata in specific languages (inspired by Playnite).

---

## Part 1: Fix — Stale Metadata Fields After Search Apply

### Current Behavior (Bug)

1. User opens Game Options modal → Metadata tab → clicks "Download Metadata"
2. Metadata search modal opens, searches, selects a result
3. User checks desired fields, clicks "Apply Selected"
4. Modal closes, `onMetadataApplied` callback fires → calls `updateGame()` from context
5. `updateGame()` fetches the updated game from LevelDB and sets it
6. The Game Options modal's `MetadataGeneralSection` and `MetadataDescriptionSection` are still visible underneath (the search modal was rendered as a separate overlay via `MetadataSearchModal` in `game-options-modal.tsx`)
7. **BUG**: `MetadataGeneralSection` still shows the old (pre-apply) values

### Root Cause

In `src/renderer/src/pages/game-details/modals/game-options-modal/metadata-general-section.tsx`:

```tsx
// Line ~99-101
useEffect(() => {
  setState(initializeState(game, shopDetails));
}, [game.shop, game.objectId, shopDetails]);
```

The dependency array only includes `game.shop`, `game.objectId`, and `shopDetails`. After metadata is applied via search, the game object is refreshed with new metadata, but `shop` and `objectId` haven't changed — so the `useEffect` never re-runs and the component keeps showing stale state from the initial render.

A similar issue may exist in `MetadataDescriptionSection`:

```tsx
// Line ~35-37
useEffect(() => {
  setDescription(getDescription(game, shopDetails));
}, [game, shopDetails]);
```

Here the dependency includes `game` itself, which should work if the game object reference changes after `updateGame()`. However, timing issues or reference equality may still cause problems.

### Fix

Change the `MetadataGeneralSection`'s re-initialization `useEffect` to include the game object or the relevant metadata fields in the dependency array:

```tsx
// metadata-general-section.tsx
useEffect(() => {
  setState(initializeState(game, shopDetails));
}, [
  game.shop,
  game.objectId,
  shopDetails,
  game.title,
  game.releaseDate,
  game.genres,
  game.developers,
  game.publishers,
  game.tags,
  game.userStatus,
]);
```

Or more simply:

```tsx
useEffect(() => {
  setState(initializeState(game, shopDetails));
}, [game.shop, game.objectId, shopDetails, game]);
```

**Note**: The `useMemo` for `hasChanges` and `original` in `MetadataGeneralSection` also calls `initializeState(game, shopDetails)` — this should naturally update since it depends on `state` and `game`.

For `MetadataDescriptionSection`, verify that the game object reference actually changes after `updateGame()`. If not, consider using specific metadata field dependencies or a key prop based on a version/timestamp.

### Verification Steps

1. Open Game Options for any game → Metadata → General tab
2. Note current title/genres/developers
3. Click "Download Metadata" → search for a different game → select result → check fields → "Apply Selected"
4. The Metadata General tab fields should now show the updated values
5. User can further edit and click "Save Changes" (as confirmed: auto-populate + require save)

---

## Part 2: Language Selection in Metadata Search

### Requirements

- **Location**: Dropdown in the metadata search modal, next to the search bar or source tabs
- **Scope**: All metadata search sources (Steam, Catalogue/IGDB, VNDB, SteamGridDB, PCGamingWiki, IGN)
- **Supported languages**: Major languages only (curated subset — see below)
- **Default value**: Hydra's current UI language (auto-detected from `i18n.language`)
- **Persistence**: Persist across sessions (store in `UserPreferences` in LevelDB)

### Language Subset

A curated list of major languages (matching common Steam/IGDB language support):

| Label               | Code (Steam) | IGDB locale |
| ------------------- | ------------ | ----------- |
| English             | `english`    | `en`        |
| French              | `french`     | `fr`        |
| German              | `german`     | `de`        |
| Spanish             | `spanish`    | `es`        |
| Italian             | `italian`    | `it`        |
| Portuguese (Brazil) | `brazilian`  | `pt-BR`     |
| Russian             | `russian`    | `ru`        |
| Japanese            | `japanese`   | `ja`        |
| Korean              | `korean`     | `ko`        |
| Simplified Chinese  | `schinese`   | `zh-CN`     |
| Traditional Chinese | `tchinese`   | `zh-TW`     |
| Polish              | `polish`     | `pl`        |
| Dutch               | `dutch`      | `nl`        |
| Turkish             | `turkish`    | `tr`        |

### UI Design

The language dropdown should be placed in the metadata search modal, in the `metadata-search-modal__search-row` area, positioned between the source tabs and the search input. It should be a compact dropdown/select component.

Layout:

```
[Source Tabs: All | Steam | SteamGridDB | PCGamingWiki | IGN | VNDB]
[  Language: [English ▼]  ]  [Search input........................] [🔍]
```

### Data Flow

1. **User selects language** from dropdown → stored in `UserPreferences.metadataSearchLanguage`
2. **When search is triggered**: Language is passed to IPC handler `searchGameMetadata` as a new 4th parameter
3. **Backend updates**: The `searchGameMetadata` IPC handler and all downstream search/enrichment functions use the provided language instead of hardcoded `"english"`

### Backend Changes Required

#### 1. IPC Handler (`src/main/events/metadata/fetch-game-metadata.ts`)

Add `language` parameter to the `searchGameMetadata` handler:

```ts
ipcMain.handle(
  "searchGameMetadata",
  async (
    _event,
    query: string,
    source: string,
    shop?: string,
    language?: string   // NEW
  ): Promise<MetadataSearchResult[]> => {
```

Pass `language` down to all search functions.

#### 2. Search Aggregator (`src/main/services/metadata-search-aggregator.ts`)

Change hardcoded `"english"` to accept a language parameter:

- `searchAllSources(query, limit, language?)`
- `searchSteamFirst(query, limit, language?)`
- `enrichSteamCandidate(appId, language)` — already uses `getSteamAppDetails(appId, language)`, just needs wiring
- `searchSteamStoreSafe(query, limit, language)` — change `l: "english"` to `l: language || "english"`

#### 3. Other Sources

- **VNDB** (`searchVnDb`): VNDB API does not support language filtering for metadata — no change needed (results are always in English/Japanese)
- **SteamGridDB** (`searchSteamGridDB`): No language support — no change needed
- **PCGamingWiki** (`searchPCGamingWiki`): No language filtering in their API — no change needed
- **IGN** (`searchIGN`): No language filtering — no change needed

#### 4. Catalogue Search

The catalogue endpoint (`/catalogue/search/suggestions`) may need to accept a `language` query parameter so IGDB-backed results return localized names/descriptions. If the backend doesn't support this yet, pass the language and the backend can implement it in the future (non-blocking for this feature).

#### 5. Preload Bridge (`src/preload/index.ts`)

Update the `searchGameMetadata` signature to accept optional `language`:

```ts
searchGameMetadata: (
    query: string,
    source: string,
    shop?: string,
    language?: string  // NEW
) => ipcRenderer.invoke("searchGameMetadata", query, source, shop, language),
```

#### 6. Renderer Type Declarations (`src/renderer/src/declaration.d.ts`)

```ts
searchGameMetadata: (
  query: string,
  source: string,
  shop?: string,
  language?: string // NEW
) => Promise<MetadataSearchResult[]>;
```

### Frontend Changes Required

#### 1. UserPreferences Type (`src/types/level.types.ts`)

Add new field:

```ts
export interface UserPreferences {
  // ... existing fields ...
  /** Language code for metadata search (e.g. "english", "french"). Falls back to UI language if null. */
  metadataSearchLanguage?: string | null;
}
```

#### 2. MetadataSearchModal (`src/renderer/src/components/metadata-search-modal/metadata-search-modal.tsx`)

- Import language preference from Redux store or LevelDB
- Add a `<select>` dropdown component in the search row
- Map Hydra UI language → Steam language codes (reuse `getSteamLanguage` helper)
- Pass selected language to `window.electron.searchGameMetadata()`
- Wire the dropdown onChange to persist the preference

#### 3. Language Persistence

Store the preference via the existing user preferences mechanism. The metadata search modal should read the saved preference on mount and fall back to the UI language if not set.

### SCSS Changes

Add styling for the language dropdown in `metadata-search-modal.scss`:

- Inline with the search bar
- Matches existing dark theme styling
- Compact width (~120-140px)

---

## Files to Modify

### Bug Fix

- `src/renderer/src/pages/game-details/modals/game-options-modal/metadata-general-section.tsx` — Fix dependency array
- `src/renderer/src/pages/game-details/modals/game-options-modal/metadata-description-section.tsx` — Verify/fix dependency array

### Language Feature

- `src/renderer/src/components/metadata-search-modal/metadata-search-modal.tsx` — Add language dropdown UI and wiring
- `src/renderer/src/components/metadata-search-modal/metadata-search-modal.scss` — Style the dropdown
- `src/preload/index.ts` — Update IPC bridge signature
- `src/renderer/src/declaration.d.ts` — Update type declaration
- `src/main/events/metadata/fetch-game-metadata.ts` — Accept and forward language parameter
- `src/main/services/metadata-search-aggregator.ts` — Use language parameter instead of hardcoded "english"
- `src/types/level.types.ts` — Add `metadataSearchLanguage` to `UserPreferences`

### New Translation Keys (i18n)

Keys to add to `src/locales/*/translation.json` (under `game_details` namespace):

- `metadata_search_language`: "Search Language" (dropdown label)
- Language option labels can reuse existing locale names or be hardcoded as proper nouns

---

## Edge Cases

1. **Empty/null language**: Fall back to `"english"` (current behavior)
2. **Invalid language code**: Gracefully fall back to `"english"`
3. **Language not supported by source**: Each source independently decides how to handle — Steam uses `l` param, Catalogue passes to backend, others ignore
4. **Modal reopened**: Language selection persists from stored preference
5. **Auto-search on open**: Uses the stored language preference (not hardcoded to UI language)
6. **Switching source tabs**: Language selector remains unchanged (it's source-agnostic)

---

## Out of Scope

- Per-source language selection (one dropdown for all sources)
- Auto-translating metadata results
- Language filtering for image/asset searches
- Backend catalogue API changes (pass language param, backend can implement later)
- Changing the game page language itself
