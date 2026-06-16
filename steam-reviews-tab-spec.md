# Steam Reviews Sub-Tab Spec (Hydra Launcher)

> Refactor: move Steam review content out of the **sidebar** + **modal** combo
> and into a dedicated **"Steam Reviews" sub-tab** that lives inside the
> existing **"reviews"** parent tab on the game details page. The new view
> mirrors the **Playnite ReviewViewer** plugin
> (`darklinkpower/PlayniteExtensionsCollection/source/Generic/ReviewViewer`)
> — same sorting tabs, same filter list, same per-review information, with a
> Steam-styled UI that fits the Hydra design system.

---

## 1. Goal

Give users an in-page, full-screen Steam reviews experience without taking them
out of the game details flow.

- **Remove** the `SteamRatingSection` "See Details" button from the sidebar.
- **Remove** the `SteamReviewModal` (overlay) entirely.
- **Keep** a compact Steam score chip in the sidebar (descriptor + percentage
  + bar, no button — clicking opens the new tab).
- **Add** a new **Steam Reviews** sub-tab that is the second child of the
  existing `reviews` parent tab (alongside the existing **Community Reviews**
  content from `DetailsTab` / `GameReviews`).

## 2. Reference: Playnite ReviewViewer parity

Mapped from the upstream plugin (C#/WPF) to Hydra's React/TypeScript stack.

| Playnite ReviewViewer concept | Steam API param               | Hydra implementation                |
| ---------------------------- | ----------------------------- | ----------------------------------- |
| `ReviewType` (Positive/Negative/All) | `review_type`        | sort tabs in UI                      |
| `PurchaseType` (Steam / Non-Steam Purchase) | `purchase_type` | filter chip                          |
| `PlaytimePreset` (Hours buckets)        | `playtime_filter_min`/`max` | filter dropdown                |
| Language dropdown                          | `language`           | filter dropdown                      |
| `DisplayType` = `MostHelpful`             | `filter=all`         | sub-tab default view                |
| `DisplayType` = `Recent`                  | `filter=recent` (+ optional `day_range`) | sub-tab       |
| `DisplayType` = `Funny`                   | `filter=funny`       | sub-tab                              |
| `DisplayType` = `Summary`                 | `filter=summary`     | top "summary banner" card (not a tab) |
| Cursor-based pagination                   | `cursor`             | infinite scroll in renderer         |
| Per review info                           | `reviews[]` payload  | `SteamReview` card row               |

### Per-review data paid forward from the Steam `reviews[]` payload

| Field                                       | UI element                              |
| ------------------------------------------- | --------------------------------------- |
| `author.personaname`                        | Reviewer name (with optional profile link) |
| `review` (text)                             | Review body (BBCode stripped)           |
| `timestamp_created`                         | "Posted X days ago" date chip           |
| `voted_up`                                  | Recommended / Not Recommended badge    |
| `votes_up`                                  | Helpful count                           |
| `votes_funny`                               | Funny badge (visible in Funny tab)      |
| `weighted_vote_score`                       | Steam's quality ranking badge           |
| `author.playtime_at_review`                 | "X hrs on record at review"             |
| `author.playtime_forever`                   | "X hrs total"                           |
| `language`                                  | Language chip with flag                 |
| `steam_purchase`                            | "Steam Purchase" pill                   |
| `received_for_free`                         | "Received for free" warning pill        |
| `written_during_early_access`               | "Early Access" pill                     |
| `comment_count`                             | "N comments" link (opens comment thread — out of scope for v1) |

## 3. Non-goals (out of scope for this change)

- No new Steam API endpoint. We already consume
  `https://store.steampowered.com/appreviews/{appid}` and pass
  `filter`, `review_type`, `purchase_type`, `language`, `day_range`,
  `playtime_filter_min/max`, `cursor`, `num_per_page`. No new IPC event is
  required; we reuse the existing `getSteamReviewAnalysis` and add a new
  lightweight `getSteamReviews` IPC that returns a paginated list of
  reviews (see §6).
- No Metacritic / OpenCritic / IGDB review import. Steam only.
- No write actions (Steam reviews are read-only).
- No reply / comment threads. Steam's comment system is not exposed via the
  appreviews endpoint.
- No translation migration across all 40 locales. New keys go in the English
  source file; other locales inherit gracefully.
- Big Picture mode parity is best-effort only — Steamreviews content lives in
  the renderer, so Big Picture will simply show whatever the renderer's
  `<SteamReviewsTab>` renders. If the layout breaks in Big Picture we will
  treat it as a follow-up.

## 4. Affected files

### Renderer (new)

- `src/renderer/src/pages/game-details/tabs/sub-tabs/steam-reviews-tab.tsx`
- `src/renderer/src/pages/game-details/tabs/sub-tabs/steam-reviews-tab.scss`
- `src/renderer/src/pages/game-details/tabs/steam-reviews/steam-review-card.tsx`
- `src/renderer/src/pages/game-details/tabs/steam-reviews/steam-review-card.scss`
- `src/renderer/src/pages/game-details/tabs/steam-reviews/steam-review-summary-banner.tsx`
- `src/renderer/src/pages/game-details/tabs/steam-reviews/steam-review-summary-banner.scss`
- `src/renderer/src/pages/game-details/tabs/steam-reviews/steam-review-stripes.ts`
  (helpers for color-coded descriptors — extracted from existing
  `steam-rating-section.tsx` / `steam-review-modal.tsx` `getSteamScoreColor`)
- `src/renderer/src/pages/game-details/tabs/steam-reviews/steam-review-filter-bar.tsx`
- `src/renderer/src/pages/game-details/tabs/steam-reviews/steam-review-filter-bar.scss`
- `src/renderer/src/pages/game-details/tabs/steam-reviews/use-steam-reviews.ts`
  (paginated data hook with cursor-based infinite scroll)
- `src/renderer/src/pages/game-details/tabs/steam-reviews/types.ts`

### Renderer (modified)

- `src/renderer/src/pages/game-details/tabs/tab-bar.tsx`
  - extract `getSteamAppIdForGame(shop, objectId, gameTitle)` helper for the
    "hide if no Steam appid" logic — actually a hook helper instead.
- `src/renderer/src/pages/game-details/game-details-content.tsx`
  - `case "reviews"` case now wraps a sub-tab container with two sub-tabs:
    "Steam Reviews" and "Community Reviews".
  - Render `<SteamReviewsTab />` lazily only if a Steam appid can be resolved.
- `src/renderer/src/pages/game-details/sidebar/sidebar.tsx`
  - Replace `<SteamRatingSection onOpenDetails={...} />` with a new compact
    `<SteamRatingChip>` that has no button (click navigates to the
    "reviews" parent tab + "Steam Reviews" sub-tab).
  - Remove the modal mount (`SteamReviewModal` no longer needed).
- `src/renderer/src/pages/game-details/sidebar/steam-rating-section.tsx`
  - **Refactor to a slim chip.** Drop the "See Details" button, drop the
    `onOpenDetails` prop. Rename internally to `SteamRatingChip` (placeholder).
    Update SCSS to a compact layout (one row: descriptor + % on left, bar
    inline on right, vertical or horizontal — see §10).
- `src/renderer/src/pages/game-details/tabs/details-tab.tsx`
  - Wrap content in a sub-tab shell. The "Community Reviews" content
    (`GameReviews`) becomes the default sub-tab for that branch; the new
    "Steam Reviews" sub-tab is the *first* sub-tab (Steam is the primary
    source for new users). The `?reviews=true` URL scrolls to community
    reviews section.
- `src/renderer/src/types/declaration.d.ts`
  - Register the new `getSteamReviews` preload method.
- `src/renderer/src/pages/game-details/tabs/sub-tabs/sub-tab-bar.tsx`
  - **New shared component** for the inner sub-tab bar pattern.
- `src/renderer/src/pages/game-details/tabs/sub-tabs/sub-tab-bar.scss`

### Renderer (deleted)

- `src/renderer/src/pages/game-details/modals/steam-review-modal.tsx`
- `src/renderer/src/pages/game-details/modals/steam-review-modal.scss`

### Main process (new)

- `src/main/events/catalogue/get-steam-reviews.ts`
  - IPC handler that calls a new service-layer function in steam-charts.ts.
- `src/main/events/catalogue/index.ts`
  - register the new event.
- `src/main/services/steam-charts.ts`
  - New exported function `fetchSteamReviewsPage` returning
    `SteamReview`[] + `cursor`. Build URL via the existing
    `buildSteamReviewsUrl`. Add a 5-minute cache keyed by
    `appId:filter:reviewType:purchaseType:language:dayRange:playtimeMin:playtimeMax:cursor`.

### Main process (modified — preload only)

- `src/preload/index.ts`
  - Add `getSteamReviews(shop, objectId, gameTitle, opts)` method.

### Types (new)

- `src/types/steam.types.ts`
  - `SteamReview` (already declared privately in `steam-charts.ts` — promote
    to `@types`, drop the duplicate local interface).
  - `SteamReviewsPage = { reviews: SteamReview[]; cursor: string; }`.
  - `SteamReviewFilters` type (filter, reviewType, purchaseType, language,
    dayRange, playtimeMin, playtimeMax) compatible with the existing
    `buildSteamReviewsUrl` params.

### English locale (new keys, all under `game_details`)

```
"steam_reviews"
"steam_reviews_unavailable"
"tab_steam_reviews"
"tab_community_reviews"
"sub_tabs_aria_label"
"sort_most_helpful"
"sort_recent"
"sort_funny"
"filter_review_type"
"filter_review_type_all"
"filter_review_type_positive"
"filter_review_type_negative"
"filter_purchase_type"
"filter_purchase_type_all"
"filter_purchase_type_steam"
"filter_purchase_type_non_steam"
"filter_playtime"
"filter_playtime_any"
"filter_playtime_over_1_hour"
"filter_playtime_over_10_hours"
"filter_playtime_over_100_hours"
"filter_language"
"filter_language_all"
"filter_language_english"
"filter_language_schinese"
"filter_language_japanese"
"review_recommended"
"review_not_recommended"
"review_helpful_count"
"review_funny_badge"
"review_posted_on"
"review_hours_at_review"
"review_hours_total"
"review_language"
"review_steam_purchase"
"review_received_for_free"
"review_early_access"
"review_quality_badge"
"review_loading_more"
"review_no_results"
"review_load_more_failed"
"click_for_details"
```

## 5. Tab structure

The existing parent tab `reviews` becomes a shell with a small sub-tab bar:

```
[Overview]  ⮕  [Reviews ▾]  [Activity]  [Achievements]  [Web Links]
            │
            │   ┌── Steam Reviews ──── Community Reviews ──┐
            │   │                                          │
            │   │   <- default sub-tab on first view      │
            │   │                                          │
            │   │   Summary banner (descriptor, %, bar)   │
            │   │   Filter bar (review type, purchase,    │
            │   │     playtime, language)                │
            │   │   Sub-sort tabs: Most Helpful | Recent  │
            │   │     | Funny                              │
            │   │   List of SteamReview cards              │
            │   │     (cursor-based infinite scroll)       │
            │   └──────────────────────────────────────────┘
```

### Sub-tab default

- **Steam Reviews is the default active sub-tab** when the user opens the
  parent `reviews` tab for the first time (matches "first thing users want
  to see" intuition).
- Community Reviews remains reachable as the second sub-tab. The existing
  `?reviews=true` URL keeps scrolling into community reviews.

### Hide-when-no-appid rule

- Determine appid at sub-tab level: `shop === "steam" ? objectId :
  await searchSteamGame(gameTitle)`.
- If null, **do not render** the Steam Reviews sub-tab. Only Community
  Reviews is visible. Do not show "no appid" placeholder; the tab simply
  doesn't exist for that game.

## 6. Steam reviews list endpoint (new)

Add an IPC method `getSteamReviews(shop, objectId, gameTitle, opts)` that
returns a single page of reviews.

```ts
interface SteamReview {
  recommendationid: string;
  author: {
    steamid: string;
    personaname: string;
    profileUrl: string;        // computed
    num_reviews: number;
    playtime_forever: number;  // minutes
    playtime_at_review: number;
    last_played: number;
  };
  language: string;
  review: string;              // plain text (BBCode stripped in renderer)
  timestamp_created: number;
  timestamp_updated: number;
  voted_up: boolean;
  votes_up: number;
  votes_funny: number;
  weighted_vote_score: string;
  comment_count: number;
  steam_purchase: boolean;
  received_for_free: boolean;
  written_during_early_access: boolean;
}

type SteamReviewsPage = {
  reviews: SteamReview[];
  cursor: string;
  query_summary: {
    num_reviews: number;
    review_score: number;
    review_score_desc: string;
    total_positive: number;
    total_negative: number;
    total_reviews: number;
  };
};

interface SteamReviewFilters {
  cursor?: string;             // default "*"
  filter: "all" | "recent" | "funny";
  reviewType: "all" | "positive" | "negative";
  purchaseType: "all" | "steam" | "non_steam_purchase";
  language: string;            // "all" or specific Steam code
  dayRange?: number;           // only when filter === "recent"
  playtimeMinMinutes: number;  // 0 = any
  playtimeMaxMinutes: number;  // 0 = any
  numPerPage: number;          // 20 default, 100 max
}
```

The IPC reuses the existing `buildSteamReviewsUrl` from
`src/main/services/steam-charts.ts` and adds a `fetchSteamReviewsPage`
helper that deserializes the response and strips BBCode from `review`
server-side (simple `\n` plus `[b]/[i]/[u]/[url]/[list]/[*]` → HTML — same
capability as the existing `html-sanitizer` at `src/shared/html-sanitizer.ts`).

Caching rules:
- Key by appId + full filter set + cursor.
- 5 minute TTL (matches existing summary / analysis caches).
- Different from `getSteamReviewAnalysis` (which still does heavy
  pagination up to 10 pages). The new endpoint does one page at a time.

## 7. Sub-tab bar component (`sub-tab-bar.tsx`)

Generic component used by `reviews` parent tab. Looks visually identical to
the existing `tab-bar.tsx` but a bit smaller and centered/wrapped.

Props:

```ts
type SubTabId = "steam_reviews" | "community_reviews";
interface SubTab {
  id: SubTabId;
  label: string;
  icon?: React.ReactNode;
}
interface SubTabBarProps {
  tabs: SubTab[];
  activeSubTab: SubTabId;
  onSubTabChange: (id: SubTabId) => void;
  ariaLabel: string;
}
```

Style: reuses `tab-bar.scss` variables (color tokens) but in a more compact
form. No top border — sits below the parent tab bar with a thin separator.

## 8. Steam Reviews sub-tab UI

### 8.1 Layout sequence (top → bottom)

1. **Title row**: game name + "Steam Reviews" label and the **summary banner**
   (descriptor colour, percentage, positive/negative bar, total reviews count).
2. **Filter bar** (horizontal, horizontally-scrollable on narrow widths):
   - Review type: 3-button segmented control `[All | Positive | Negative]`.
     Default: `all`. Maps to `review_type`.
   - Purchase type: 2-button segmented `[All | Steam Purchase]`.
     Default: `all`. (`non_steam_purchase` is the "Other" branch; we'll
     expose `All` vs `Steam Purchase` only — non-Steam is implicit when
     not selected — this matches what users actually want to see.)
   - Playtime: dropdown `[Any | >1 hr | >10 hrs | >100 hrs]`.
     Maps to `playtime_filter_min` with `playtime_filter_max=0`.
   - Language: dropdown `[All | English | 简体中文 | 日本語 | ...]`.
     Map `language` codes per Playnite's `_steamQueryMap`. `All` → `all`.
3. **Sub-sort tabs** (smaller, under the filter bar): three buttons —
   `Most Helpful` (default), `Recent`, `Funny`. The *Summary banner is
   already above* the filters, so Summary is not a sub-sort tab.
4. **Review list** (cursor-based infinite-scroll rows): each row is a
   `SteamReviewCard` (see 8.3). IntersectionObserver on the last row
   triggers the next page.
5. **Empty / error states**:
   - Loading initial: 5 skeleton cards.
   - Empty: "No reviews match these filters" with a `Clear filters` button.
   - Error: "Couldn't load reviews" with a `Retry` button.
   - When viewed for a non-Steam shop and `effectiveShop !== "steam"` and
     `searchSteamGame` returns null, the entire sub-tab is hidden by the
     parent (handled in §5).

### 8.2 Steam-specific styling cues

- **Descriptor color table** (mirrors existing `getSteamScoreColor`):
  - overwhelmingly / very / positive / mostly positive → `#66c0f4`
  - mixed → `#b9a074`
  - mostly / negative / very / overwhelmingly negative → `#a34c25`
  - default → `#d0d1d7`
- **Recommended badge** (voted up): teal/green pill with thumbs-up icon.
- **Not recommended badge** (voted down): red pill with thumbs-down icon.
- **Helpful**: small icon + `votes_up` count, mono-font number.
- **Funny**: small face icon + `votes_funny`, only highlighted when > 0.
- **Steam Purchase pill**: subtle outline with the Steam glyph.
- **Received for Free pill**: amber chip.
- **Early Access pill**: outlined "Early Access" badge.
- **Hours chip**: clock icon + "X hrs at review" + "X hrs total" text on hover.
- **Language chip**: language code + 2-letter flag (e.g. `EN 🇺🇸`,
  `ZH 🇨🇳`). Reuse the existing
  `src/shared/language-flags.ts` helper if it covers it; otherwise add a
  small static map for the 6–10 most common Steam languages.
- **Date chip**: relative (`i18next` already exposes `formatDate` /
  `timeFromNow` — reuse).

### 8.3 `SteamReviewCard` content layout

Reference: PlayniteReviewViewer's `ReviewsControl.xaml` item template.

```
┌──────────────────────────────────────────────────────────────┐
│  [Recommended] [Steam Purchase] [Early Access]      • 12 d  │  ← badges row
│                                                               │
│  AuthorPersonaName                          N reviews        │  ← author meta
│  42.5 hrs at review · 152 hrs total · EN 🇺🇸                  │  ← meta row
│                                                               │
│  Review body. Lorem ipsum dolor sit amet, consectetur.       │  ← review text
│  Truncated by default; "Read more" expands.                  │     (max-height 8
│                                                               │      lines; expand)
│                                                               │
│  [Helpful 412]  [Funny 23]                          quality  │  ← footer row
└──────────────────────────────────────────────────────────────┘
```

Two-column card layout on desktop (avatar column + content column) collapses
to single-column on narrow widths (Big Picture / window resize).

"Read more" truncate rule: collapse to `max-height: 12em` with a fade-out
gradient at the bottom; "Show more" button to expand.

### 8.4 SteamReviewSummaryBanner

Renders at the top of the sub-tab. Same data as today's `SteamRatingSection`
minus the recent card and the button:

```
┌──────────────────────────────────────────────────────────────┐
│  Overwhelmingly Positive  96%                                 │
│  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱  (teal fill, neutral track)      │
│  254,183 user reviews                                         │
└──────────────────────────────────────────────────────────────┘
```

Pulls from `getSteamReviewSummary` (reuse existing IPC). Loads in
parallel with the first reviews page so both appear together.

## 9. Sidebar — compact chip (refactor of `SteamRatingSection`)

Replace the existing sidebar implementation with a slim "chip" component:

- Layout: single row inside `SidebarSection`. On the left: descriptor
  (color) + percent. On the right: a thin bar (8px tall).
- No "See Details" button.
- The entire chip is clickable: it navigates to the parent `reviews` tab
  and switches the inner sub-tab to `steam_reviews`. Implementation: the
  chip calls `setActiveTab("reviews")` and dispatches an event (or uses
  context) to set the sub-tab.
- Recent reviews sub-section is dropped — only the all-time summary lives
  here.
- Loading / error behavior preserved.
- Hover state: subtle elevation; cursor pointer.

## 10. Filter chip behaviour

- Filter changes are **committed on user interaction only**, not on every
  keystroke. The first page fetch is triggered immediately on filter
  change (Playnite behaviour).
- Filter state is held in URL search params under `steamReviews_<filterName>`
  (see §11) so a refresh restores the view.
- Changing the **sub-sort tab** (`Most Helpful` ↔ `Recent` ↔ `Funny`)
  resets the cursor and reloads.
- "Clear filters" in the empty state resets all filters to defaults.

## 11. Deep links

Add to `useSearchParams` flow in `SteamReviewsTab`:

| Param                          | Meaning                                            | Example                |
| ------------------------------ | -------------------------------------------------- | ---------------------- |
| `reviewsTab` (= parent tab)   | Active parent tab (`steam_reviews` / `community_reviews`) | `?reviewsTab=steam_reviews` |
| `steamReviewsSort`            | Sub-sort tab                                       | `?steamReviewsSort=funny`    |
| `steamReviewType`             | Review type filter                                 | `steamReviewType=positive`   |
| `steamPurchaseType`           | Purchase type filter                               | `steamPurchaseType=steam`    |
| `steamPlaytimeFilter`         | Playtime filter                                    | `steamPlaytimeFilter=10`     |
| `steamLanguage`               | Language filter                                    | `steamLanguage=schinese`     |

The existing `?reviews=true` deep link (which scrolls to the community
reviews section) continues to work; in addition, it will also set
`reviewsTab=community_reviews` so the inner sub-tab opens correctly.

## 12. Data flow & caching

- The new `useSteamReviews` hook owns pagination state per filterset.
- When the parent tab's `effectiveShop`/`effectiveObjectId` changes, the
  hook is reset to the first page with the default filters.
- Cancellation: `AbortController` on unmount (matches existing modal
  pattern).
- Review cards are virtualized via `react-window` only if the list grows
  beyond 200 items. Cursor pagination means the user typically pulls a
  few pages; infinite scroll halts when the API returns
  `reviews.length === 0` or the same cursor.

## 13. Removed sidebar analyser logic

- `SteamReviewModal` and its SCSS file deleted. The "charts" inside
  (player history, language breakdown bar) are dropped as a tradeoff
  to keep the spec focused. (We will surface them later as a separate
  "Steam Insights" addition.)
- `SteamRatingSection.tsx` is refactored to a chip (see §9). SCSS
  updated accordingly; the old detailed section SCSS is gutted.

## 14. Localization

- All new strings use the English source `translation.json` under the
  `game_details` namespace.
- Other locales inherit missing keys gracefully (existing fallback
  behaviour for `i18next`).
- No migration of the full 40-locale set.

## 15. Big Picture mode

Renderer parts render in Big Picture as-is. No Big Picture-specific
overrides initially; if dimensions break, fix in a follow-up.

## 16. Acceptance criteria

1. `SteamRatingSection` no longer renders a "See Details" button anywhere.
2. `SteamReviewModal` no longer exists in the codebase (component and
   `*.scss` are deleted).
3. The game page has a `reviews` parent tab with two sub-tabs:
   `Steam Reviews` and `Community Reviews`. The default active sub-tab is
   `Steam Reviews`.
4. When the active game has no Steam appid (e.g. random custom games),
   the `Steam Reviews` sub-tab is **not rendered**.
5. The new sub-tab exposes these sorting tabs: `Most Helpful`,
   `Recent`, `Funny`. A summary banner with the all-time descriptor +
   percentage + reviews count is shown above the filters.
6. The new sub-tab exposes these filters: review type (all/positive/
   negative), purchase type (all/steam), playtime preset (any/>1/>10/>
   >100 hrs), language (all + a short list).
7. Each `SteamReviewCard` shows: recommendation badge, author name +
   total reviews, hours-at-review, hours-total, language chip, language
   flag, body (truncated/expandable), helpful count, funny count,
   weighted vote score badge, posted date (relative), Steam-purchase /
   free / early-access pills.
8. Pagination is cursor-based; scrolling near the bottom of the list
   loads the next page from Steam; loading state and end-of-results
   indicator are visible.
9. Deep-link params (`steamReviewsSort` etc.) round-trip with a URL
   refresh. The existing `reviews=true` deep link continues to work.
10. Existing screenshot/regression scope of testing:
    - Sidebar renders the slim chip; clicking it navigates to the
      `reviews` parent tab and the `steam_reviews` sub-tab.
    - All existing locales continue to function (using English fallback
      for missing keys).
    - No console errors / warnings during navigation between tabs.
11. Codebase-wide typecheck passes: `yarn typecheck` returns no errors.
12. The new sub-tab does not break the community reviews sub-tab.

## 17. Implementation order (proposed for execution)

1. Promote `SteamReview` interface and add `SteamReviewsPage`,
   `SteamReviewFilters` types to `@types`.
2. Add `fetchSteamReviewsPage` in `src/main/services/steam-charts.ts` and
   register `getSteamReviews` IPC.
3. Update preload bridge + `declaration.d.ts`.
4. Build `sub-tab-bar.tsx` + SCSS + `SteamReviewsTab` skeleton with
   summary banner.
5. Build `SteamReviewCard` + `SteamReviewFilterBar` + `useSteamReviews`
   hook with cursor pagination.
6. Refactor `SteamRatingSection` to a clickable chip; update `Sidebar`.
7. Update `DetailsTab` to render the sub-tab shell; update
   `game-details-content.tsx` and `tab-bar.tsx` (no icon change for
   parent tab — same `CommentDiscussionIcon`).
8. Delete `SteamReviewModal.tsx` + `steam-review-modal.scss`.
9. Add new English locale keys.
10. Add deep-link handling.
11. Typecheck, lint, manual QA, fix issues.
12. Optional code review pass.

## 18. Risks & mitigations

| Risk                                                                 | Mitigation                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Steam rate-limits cursor calls                                       | 200ms delay between pages; abort on unmount; bail out early when `cursor === ""`           |
| Non-Steam games without a Steam appid hang the sub-tab               | Hide sub-tab entirely (per §5)                                                            |
| BBCode in `review` text contains unsanitized HTML                    | Reuse `src/shared/html-sanitizer.ts` server-side; renderer treats text as plain text only |
| Very-long reviews overflow the card                                  | Truncate to 12em with gradient + "Show more" expand; user can collapse                     |
| Language flag data missing                                           | Reuse `src/shared/language-flags.ts` for supported locales; fallback to 2-letter code      |
| Many reviews cause scroll jank                                       | Add `react-window` virtualization when list > 200 items (post-v1 polish)                    |
| Community regressions when `DetailsTab` restructured                 | Cover with manual QA pass; minimize handler changes                                       |
| Some locales missing new keys                                        | Graceful fallback to English (existing behaviour)                                          |
