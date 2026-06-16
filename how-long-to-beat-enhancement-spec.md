# HowLongToBeat Card Enhancement — Specification

> Upgrade the existing HowLongToBeat card on the Hydra game details page so
> that playtime data is **automatically fetched** across multiple providers
> (HowLongToBeat, Backlogged, IGDB/Steam fields), with a **modern compact
> layout**, an inline **Extend** toggle that reveals hidden categories, and
> an **Edit** picker with a **typeahead search** for re-assigning the game
> to a different provider when the auto-match is wrong.

---

## 1. Goal

The current implementation has three real shortcomings:

1. **Matching is Hydra-API-only.** A user's game is matched to HLTB once on
   the cloud side; if the match is wrong there is no in-app way to fix it.
   The renderer surfaces `HowLongToBeatCategory[]` (`title`, `duration`,
   `accuracy`) pulled from `/games/{shop}/{objectId}/how-long-to-beat` and
   nothing else.
2. **No alternate providers.** If a game has no HLTB entry, the card is
   silently hidden — there's no fallback to Backlogged, IGDB playtime
   fields, or Steam average-playtime statistics.
3. **Limited interactivity.** You can submit your playtime but you cannot
   expand the card to see hidden columns (Solo, Speedrun, 100%), pick a
   different provider, or override the matching.

This feature fixes all three while reflowing the visual layout for the
Overview dashboard.

---

## 2. New capabilities at a glance

| Feature                  | Description                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Multi-provider fetch     | Hydra API + new Radar → HowLongToBeat, Radar → Backlogged, Radar → IGDB/Steam stats. Routed through Electron main-process.   |
| On-load auto-fetch       | When the game page mounts and no acknowledgement is stored, the card immediately attempts a fetch across providers.          |
| Modern compact layout    | Hero-style header with provider logo + chip, dominant "Main Story" duration, and a tidy action row.                          |
| Inline Extend toggle     | Expand the card to reveal Solo / Main + Sides / Completionist / 100%, accuracy bars, platform splits, submit status.         |
| Edit picker modal        | Reassign provider + game: search box with typeahead, provider dropdown, list of matches, confidence chip, Save button.       |
| Manual-add empty state   | When nothing matches, the card renders "No playtime data found" + "Search manually" CTA that opens the Edit picker.          |
| Persisted manual mapping | Storing `{provider, externalId}` on the `Game` record lets future page visits skip matching and fetch directly from the API. |
| Provider-aware Submit    | "Submit my playtime" only shows when the linked provider offers submission (today: HLTB); hidden for Backlogged, etc.        |
| Local library cache      | The Edit picker's typeahead surfaces previously chosen entries from the user's library above the live provider results.      |
| Best-match selection     | Auto-match picks the highest similarity if present; always exposes a "Not the right game?" hint to open the Edit picker.     |

---

## 3. Providers

Three providers are wired up initially:

| Provider          | Source                                              | Data shape                                            | Submit support    | Search method               |
| ----------------- | --------------------------------------------------- | ----------------------------------------------------- | ----------------- | --------------------------- |
| **HowLongToBeat** | `howlongtobeat.com/api` (proxy via new service)     | `Main / Main+Extras / Completionist / 100%` plus Solo | ✅ Yes (existing) | Text search + game id       |
| **Backlogged**    | `backloggd.com` scraping/lookup (proxy via service) | `Main / Completionist / Co-op` with community counts  | ❌ No             | Text search returning slugs |
| **IGDB / Steam**  | IGDB time-to-beat + Steam playtime forever field    | Average / Median playtime                             | ❌ No             | Catalogue lookup by appId   |

> **Out of scope this change:** RetroAchievements, PCGamingWiki, raw Steam
> review-derived hours. They are not providers in this round.

Each provider is encapsulated behind a common interface so the renderer
treats them uniformly.

---

## 4. Affected files

### 4.1 New files

| File                                                                                | Purpose                                                  |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/main/services/playtime-providers/types.ts`                                     | Common provider interface (`search`, `fetchById`)        |
| `src/main/services/playtime-providers/how-long-to-beat-provider.ts`                 | HLTB API adapter (replaces direct Hydra cloud call)      |
| `src/main/services/playtime-providers/backlogged-provider.ts`                       | Backlogged search + slugs                                |
| `src/main/services/playtime-providers/igdb-steam-provider.ts`                       | IGDB + Steam stats aggregator                            |
| `src/main/services/playtime-providers/playtime-aggregator.ts`                       | Multi-provider fan-out, similarity ranking, dedup        |
| `src/main/services/playtime-providers/cache.ts`                                     | Provider response cache (TTL 24h per query)              |
| `src/main/events/playtime/search-playtime-games.ts`                                 | IPC handler: typeahead search across selected provider   |
| `src/main/events/playtime/fetch-playtime-data.ts`                                   | IPC handler: full fetch by `{provider, externalId}`      |
| `src/main/events/playtime/auto-match-playtime.ts`                                   | IPC handler: best-match across providers                 |
| `src/main/events/playtime/save-game-playtime-mapping.ts`                            | IPC handler: persist `{provider, externalId}` on Game    |
| `src/shared/playtime/provider-meta.ts`                                              | Provider logos, display names, slug → logo mapping       |
| `src/renderer/src/pages/game-details/dashboard-cards/how-long-to-beat-card-v2.tsx`  | New compact card (default)                               |
| `src/renderer/src/pages/game-details/dashboard-cards/how-long-to-beat-card-v2.scss` | Styles                                                   |
| `src/renderer/src/components/playtime-edit-modal/playtime-edit-modal.tsx`           | Edit picker modal w/ typeahead search                    |
| `src/renderer/src/components/playtime-edit-modal/playtime-edit-modal.scss`          | Edit picker styles                                       |
| `src/renderer/src/components/playtime-edit-modal/use-playtime-typeahead.ts`         | Debounced typeahead hook (live provider + library cache) |
| `src/renderer/src/hooks/use-playtime-data.ts`                                       | Renderer hook orchestrating auto-fetch + state           |

### 4.2 Modified files

| File                                                                            | Change                                                                  |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/types/how-long-to-beat.types.ts`                                           | Add `PlaytimeProvider`, `PlaytimeGameData`, `PlaytimeMapping`           |
| `src/types/level.types.ts`                                                      | Add `playtimeMapping?: PlaytimeMapping` to `Game`                       |
| `src/types/index.ts`                                                            | Re-export new types                                                     |
| `src/main/level/sublevels/index.ts`                                             | (no change)                                                             |
| `src/main/events/index.ts`                                                      | Register new IPC handlers                                               |
| `src/preload/index.ts`                                                          | Expose new IPC bridges                                                  |
| `src/renderer/src/declaration.d.ts`                                             | Declare new preload methods                                             |
| `src/renderer/src/pages/game-details/tabs/overview-tab.tsx`                     | Use new `usePlaytimeData` hook + new card component                     |
| `src/renderer/src/pages/game-details/sidebar/sidebar.tsx`                       | Use new compact card in sidebar OR keep sidebar unchanged per wireframe |
| `src/renderer/src/pages/game-details/dashboard-cards/how-long-to-beat-card.tsx` | Replace internals -> thin wrapper that delegates to the new component   |
| `src/renderer/src/pages/game-details/game-details-skeleton.tsx`                 | Update HLTB skeleton to match new layout                                |
| `src/locales/en/translation.json`                                               | Add the new translation keys below                                      |

### 4.3 Untouched (Big Picture)

- `src/big-picture/src/components/pages/game/how-long-to-beat/*` — keeps the
  current implementation this round. Renderer-only is the agreed scope.

---

## 5. Data model

### 5.1 Common provider interface (`src/main/services/playtime-providers/types.ts`)

```ts
export type PlaytimeProviderId = "howlongtobeat" | "backlogged" | "igdb_steam";

export interface PlaytimeProvider {
  id: PlaytimeProviderId;
  displayName: string;
  logoUrl: string; // local asset shared from src/shared/playtime/provider-meta.ts
  supportsSubmit: boolean;
  search(query: string, signal?: AbortSignal): Promise<PlaytimeSearchResult[]>;
  fetchById(providerGameId: string): Promise<PlaytimeGameData>;
}

export interface PlaytimeSearchResult {
  provider: PlaytimeProviderId;
  providerGameId: string; // HLTB numeric id, Backlogged slug, IGDB slug
  title: string;
  releaseYear: number | null;
  platforms: string[];
  imageUrl: string | null;
  similarityScore: number; // 0-1 (also used in auto-match ranking)
  // Already-collated fastest fields for "guess" scenarios:
  estimatedSeconds: number | null;
}

export interface PlaytimeCategory {
  title: string; // "Main Story", "Main + Sides", "Completionist", "100%", "Solo", "Speedrun", "Co-op"
  duration: string; // "40 Hours"
  accuracy: string; // "00" through "05"
  durationSeconds: number; // parsed convenience
}

export interface PlaytimeGameData {
  provider: PlaytimeProviderId;
  providerGameId: string;
  title: string;
  categories: PlaytimeCategory[];
  platforms: string[];
  imageUrl: string | null;
}
```

### 5.2 Game record extension (`src/types/level.types.ts`)

```ts
export interface PlaytimeMapping {
  provider: PlaytimeProviderId;
  externalId: string;
  source: "manual" | "auto"; // manual wins over auto on display
  matchedSimilarityScore?: number;
  updatedAt: string; // ISO
}

export interface Game {
  // … existing fields …
  playtimeMapping?: PlaytimeMapping | null;
}
```

### 5.3 Aggregator output (`src/main/services/playtime-providers/playtime-aggregator.ts`)

- `autoMatch(gameTitle: string, releaseYear?: number | null, appid?: number | null)` →
  `{ provider, externalId, similarityScore, game: PlaytimeSearchResult }`
- Runs all three providers in parallel (`Promise.allSettled`), keeps the
  resWith the highest `similarityScore`. Threshold: 0.65.

---

## 6. Caching rules

- Provider responses cached under
  `playtime-provider-cache:${provider}:${query|externalId}` in
  `src/main/level/sublevels/playtime-provider-cache.ts` (NEW).
- TTL: 24 h for search, 6 h for direct fetch (`fetchById`).
- Invalidation: never within the same session; cleared on user
  re-assignment (the manual Edit picker evicts the affected keys).

---

## 7. IPC surface

| Method                          | Args                                               | Returns                            |
| ------------------------------- | -------------------------------------------------- | ---------------------------------- |
| `searchPlaytimeGames`           | `{ provider, query, signal }`                      | `PlaytimeSearchResult[]`           |
| `fetchPlaytimeData`             | `{ provider, externalId, signal }`                 | `PlaytimeGameData`                 |
| `autoMatchPlaytime`             | `{ title, releaseYear?, appid? }`                  | `PlaytimeSearchResult` (best pick) |
| `saveGamePlaytimeMapping`       | `{ shop, objectId, provider, externalId, source }` | `PlaytimeMapping` (persisted)      |
| (existing) `submitHltbPlaytime` | `{ shop, objectId, seconds }`                      | unchanged                          |

All are registered in `src/main/events/playtime/index.ts` and exposed in
`src/preload/index.ts` via `window.electron.playtimeApi.{...}`.

---

## 8. Layout & UX

### 8.1 Card (new component `how-long-to-beat-card-v2.tsx`)

```
┌────────────────────────────────────────────────────────────┐
│  [🎮] HowLongToBeat              [Edit] [Extend]           │
│        Provider: HowLongToBeat · Match 96%                 │
│                                                            │
│   Main Story                       40h                      │
│   ████████████░░░░░░░░░░░░░░░░░░░░  0%                     │
│                                                            │
│   Main + Sides                     55h                      │
│   Completionist                    80h                      │
│   Solo                             12h                      │
│                                                            │
│  [Submit my playtime]                                       │
└────────────────────────────────────────────────────────────┘
```

- **Default state**: card shows Main Story large, Main + Sides,
  Completionist, Solo as compact rows. Extend opens the rest inline.
- **Header**: small clock icon, HLTB-styled logo, provider + tiny similarity
  chip ("Match 96%"), two icon buttons on the right (Edit, Extend).
- **Confidence chip turns red** when `similarityScore < 0.85` and shows
  "Not the right game?".
- **Extend behavior**: clicking Extend expands the card inline, revealing
  hidden categories (Speedrun, Co-op, 100%, per-platform splits, accuracy
  badges). Clicking again collapses back to compact.
- **Submit my playtime**: only rendered when `provider.supportsSubmit` is
  true (today: HLTB only). Disabled when the user has zero playtime.
- **Loading**: Skeleton placeholder identical shape to the loaded card.
- **Empty state**:
  - Title: "No playtime data found".
  - Body: "We couldn't match this game across HowLongToBeat, Backlogged,
    or IGDB stats."
  - CTA: "Search manually" -> opens Edit picker.

### 8.2 Card (renderer placement)

- **Overview tab**: replace the existing `HowLongToBeatCard` with the
  v2 component. Keep it as dashboard-card #3 in
  `src/renderer/src/pages/game-details/dashboard-cards/overview-tab.tsx`.
- **Sidebar (Overview)**: keep the existing
  `HowLongToBeatSection` mirror of the v2 component's compact state (just
  the categories, no buttons).
- **Sidebar (Details)**: removed (no longer needed since Overview already
  shows everything).

### 8.3 Edit picker modal (`playtime-edit-modal.tsx`)

```
┌─────────────────────────────────────────────────────────────┐
│  Edit playtime data                                       │
├─────────────────────────────────────────────────────────────┤
│  Provider:  [HowLongToBeat ▾]                              │
│                                                             │
│  Search:    [ the witcher 3 ▢▢▢▢▢▢▢▢▢▢▢▢▢▢ ]  [× clear]  │
│                                                             │
│  ┌──────────────────── Live results ────────────────────┐  │
│  │ ✓ The Witcher 3: Wild Hunt       Match 99% [HLTB]   │  │
│  │   The Witcher 3 (next-gen)       Match 84% [HLTB]   │  │
│  │   The Witcher 3: Wild Hunt -     Match 80% [Backlog]│  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌────── From your library ─────────────────────────────┐  │
│  │ The Witcher: Enhanced Edition           (HLTB, 2024) │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Selected: The Witcher 3: Wild Hunt (Match 99%)             │
│                                                             │
│  [Cancel]                              [Save mapping]       │
└─────────────────────────────────────────────────────────────┘
```

- **Provider dropdown**: 3 options in the order HLTB / Backlogged / IGDB.
  Default: provider currently stored on the Game, falling back to HLTB.
- **Typeahead**:
  - Debounced 250 ms.
  - Queries `searchPlaytimeGames(provider, query)` live.
  - Results render in the "Live results" pane, sorted by similarity desc.
  - Click on a row → fills the selected-row display at the bottom.
- **Local library cache**: results from
  `playtime-provider-cache` filtered by query text; rendered in their own
  section above the live results. Helps narrow repeated searches.
- **Selected display**: shows title + provider + similarity chip.
- **Save mapping** button:
  - Calls `saveGamePlaytimeMapping` IPC.
  - On success: toast + closes modal + triggers `usePlaytimeData` to
    refetch by `{provider, externalId}`.
  - On error: toast + keeps modal open.

### 8.4 States

| State             | Card rendering                                                 |
| ----------------- | -------------------------------------------------------------- |
| Loading           | Skeleton (same shape as compact)                               |
| Loaded (default)  | Compact rows + actions                                         |
| Loaded (extended) | Above + hidden categories + accuracy badges + platform split   |
| Submitted today   | "Submitted to HLTB X days ago" small chip below submit button  |
| Empty / no match  | "No playtime data found" + "Search manually" CTA               |
| Error             | "Couldn't load playtime data" + "Retry" button                 |
| Provider disabled | Show provider-specific empty state (e.g. "Backlogged offline") |
| Manual mapping    | Same as Loaded — confidence chip color varies by similarity    |

---

## 9. Data flow

### 9.1 Page load (renderer)

```ts
// src/renderer/src/hooks/use-playtime-data.ts
function usePlaytimeData(game) {
  // 1. If game.playtimeMapping exists (manual or auto, not stale):
  //    fetch directly by {provider, externalId}.
  // 2. Else: call autoMatchPlaytime({ title, releaseYear, appid }) -> if good
  //    enough (>=0.65), apply best result locally and persist as auto mapping.
  // 3. Else: render empty state ("Search manually").
}
```

### 9.2 Edit picker re-assignment flow

1. User opens picker.
2. User picks provider + types query.
3. Live typeahead returns results; user clicks one.
4. `saveGamePlaytimeMapping({shop, objectId, provider, externalId, source: "manual"})`.
5. `usePlaytimeData` invalidates local cache; calls
   `fetchPlaytimeData({provider, externalId})`.
6. Card re-renders with new data + confidence chip.

### 9.3 Extend toggle (purely client-side)

- Local state `{ isExtended }`. No IPC. Smooth max-height + opacity
  transition (CSS).

---

## 10. Internationalization

New keys under `game_details` and `playtime` namespaces:

```json
{
  "game_details": {
    "hltb_provider": "Provider",
    "hltb_match": "Match {{score}}%",
    "hltb_low_confidence_hint": "Not the right game?",
    "hltb_extend": "Extend",
    "hltb_collapse": "Collapse",
    "hltb_edit": "Edit",
    "hltb_empty_title": "No playtime data found",
    "hltb_empty_body": "We couldn't match this game across HowLongToBeat, Backlogged, or IGDB stats.",
    "hltb_empty_action": "Search manually",
    "hltb_error_title": "Couldn't load playtime data",
    "hltb_error_retry": "Retry",
    "hltb_category_main": "Main Story",
    "hltb_category_main_extra": "Main + Sides",
    "hltb_category_completionist": "Completionist",
    "hltb_category_100": "100%",
    "hltb_category_solo": "Solo",
    "hltb_category_speedrun": "Speedrun",
    "hltb_category_coop": "Co-op",
    "playtime_edit_title": "Edit playtime data",
    "playtime_edit_provider_label": "Provider",
    "playtime_edit_search_label": "Search",
    "playtime_edit_live_results": "Live results",
    "playtime_edit_library_results": "From your library",
    "playtime_edit_save": "Save mapping",
    "playtime_edit_cancel": "Cancel",
    "playtime_provider_howlongtobeat": "HowLongToBeat",
    "playtime_provider_backlogged": "Backlogged",
    "playtime_provider_igdb_steam": "IGDB / Steam"
  }
}
```

Other locales inherit gracefully (existing fallback behaviour).

---

## 11. Edge cases

| Scenario                                                                | Behavior                                                                                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-match returns no provider above 0.65                               | Render empty state with "Search manually" CTA                                                                                                |
| Provider call fails during auto-match                                   | Other providers continue; if all fail, render error state with Retry button                                                                  |
| User manually picks a low-similarity match (< 0.85)                     | Confidence chip turns red + "Not the right game?" hint next to it                                                                            |
| Game has a stored manual mapping but the provider returns 404           | Evict the mapping + drop into empty state with "Search manually" CTA                                                                         |
| User picks a provider they have no key for (none required today)        | N/A — none of the three providers require user keys                                                                                          |
| User submits playtime to HLTB and provider switches to Backlogged later | Old HLTB submission stays untouched; new submit button does not show for Backlogged                                                          |
| Same game exists in two providers with different numbers                | We only show one provider at a time. Confidence chip + Edit picker make switching easy                                                       |
| Big Picture mode (out of scope)                                         | Continues to show the existing HLTB list from the v1 component. No regressions                                                               |
| Typeahead returns > 50 matches                                          | Virtualize the list (`react-window`) — already present in `react` deps via other features                                                    |
| Search query has special characters                                     | URL-encode on the wire; escape on display                                                                                                    |
| Provider-side rate limiting                                             | Cached responses from the prior 24h cache layer absorb the second wave; toast the user on persistence                                        |
| Game title contains edition suffix ("Game of the Year")                 | `playtime-aggregator` cleans the title before searching (strip "Edition", "GOTY", etc.) using existing helpers in `src/shared/formatName.ts` |
| Rapidly switching tabs while auto-fetch is in flight                    | AbortController cancels the in-flight requests (matches existing pattern)                                                                    |
| First confirmation (no prior mapping)                                   | Persist as `source: "auto"`; subsequent manual re-pick downgrades the old entry's display weight                                             |

---

## 12. Design decisions log

Decisions captured during the interview:

- **Providers**: HowLongToBeat + Backlogged + IGDB/Steam. RetroAchievements
  is out of scope this round.
- **Fetch layer**: Main-process services in Electron (avoids CORS and
  scraping issues on the renderer).
- **Auto-fetch**: trigger on page load (not lazy, not on-demand).
- **Extend**: expand inline (no pop-out modal).
- **Layout direction**: modern compact dashboard card (hero + dominant
  Main Story time + chip row + actions).
- **Edit action**: open a picker modal similar to MetadataSearchModal.
- **Manual mapping persistence**: per-game `{provider, externalId}` +
  auto-match fallback when mapping is invalid.
- **Big Picture**: renderer-only; BP is a follow-up.
- **Auto-match selection**: pick best provider silently + always show
  editable confidence + "Not the right game?" hint.
- **Missing data**: empty state with "Search manually" CTA.
- **Submit playtime**: provider-aware — only renders when provider
  supports it.
- **Typeahead**: live provider query + local library cache on top.
- **Playtime UX**: estimate bars always visible; progress percentages
  start at 0% until the user plays.

---

## 13. Out of scope / non-goals

- RetroAchievements support.
- PCGamingWiki integrations.
- Achievements-derived average playtime.
- Big Picture mode parity (deferred).
- Cloud-sync of the playtime mapping across devices.
- Multi-locale migration for the new i18n strings.

---

## 14. Implementation order

1. **Types + interfaces**: `PlaytimeProvider`, `PlaytimeGameData`,
   `PlaytimeMapping`, `PlaytimeSearchResult` (and `Game` extension).
2. **Provider adapters**: implement `how-long-to-beat-provider`,
   `backlogged-provider`, `igdb-steam-provider` against a small in-memory
   `fake-fetch` for unit tests later.
3. **Aggregator**: parallel fan-out, similarity ranking, dedup.
4. **Cache sublevel + IPC handlers**:
   `searchPlaytimeGames`, `fetchPlaytimeData`, `autoMatchPlaytime`,
   `saveGamePlaytimeMapping`. + preload + `declaration.d.ts`.
5. **Renderer hook**: `use-playtime-data.ts` (auto-match branch,
   manual-mapping branch, error/empty branches).
6. **New card component**: `how-long-to-beat-card-v2.tsx` +
   `how-long-to-beat-card-v2.scss`. Replace card in `overview-tab.tsx`.
7. **Sidebar mirror**: replace the existing
   `how-long-to-beat-section.tsx` to use the same provider/types.
8. **Edit picker modal**: `playtime-edit-modal.tsx` + `use-playtime-typeahead.ts`.
   Wire provider dropdown + debounced live search + library cache pane.
9. **Empty + error states**: implement the empty/errror UX in
   `how-long-to-beat-card-v2.tsx` with hooks.
10. **Extend toggle**: inline collapse/expand.
11. **i18n**: English source first.
12. **Big Picture**: explicit deferral + leave a `// TODO: parity follow-up`
    comment on the BP HLTB box.
13. **Typecheck + lint + manual QA**.

---

## 15. Acceptance criteria

1. The new card is rendered in the Overview dashboard for **every** game
   page; not silently hidden when no provider data is present.
2. On page load, an auto-match attempt is visible via a "Match XX%" chip
   without requiring any user interaction.
3. Clicking the new **Extend** button reveals hidden categories
   inline + collapses on second click.
4. Clicking **Edit** opens the Edit picker modal; the user can change
   provider, type a query, see live results + library cache suggestions,
   select one, and save the mapping.
5. After saving, the card immediately refetches and renders the new
   provider's data.
6. When no provider matches above the threshold (0.65), the card shows
   an empty state with a "Search manually" CTA that opens the Edit picker.
7. Per-provider mapping is persisted on the Game record in LevelDB;
   subsequent page loads fetch directly by `{provider, externalId}`.
8. The "Submit my playtime" button only appears when the linked provider
   supports submission (today: HLTB only).
9. Typeahead combines live provider responses with local library cache;
   the library cache section appears above "Live results".
10. Big Picture mode continues to work without regression (we test this
    manually but do not modify the BP code this round).
11. `yarn typecheck` passes; ESLint passes on touched files.
12. The endpoint contract documented in §7 works end-to-end with the
    provided test data.
