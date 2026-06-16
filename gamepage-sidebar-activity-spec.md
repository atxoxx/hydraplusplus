# Game Page Sidebar Rework & Activity Enhancement — Specification

## Overview

Refine the game details page sidebar behavior across tabs, enhance the activity panel with interactive visualizations, and expand the main (app-level) Activity page with additional statistics and full-width layout.

---

## 1. Game Page — Sidebar Changes

### 1.1 Reviews & Comments Tab: Remove Sidebar

**Current state:** The Reviews & Comments tab (`activeTab === "reviews"`) shows a sidebar with: ProtonDB (Linux), Stats (downloads/players/rating), System Requirements, HowLongToBeat, Steam Rating, Game Language.

**New state:** Reviews & Comments tab has **no sidebar** — the reviews content takes **full width** (truly full width, no max-width constraint, edge-to-edge with standard container padding).

**File:** `src/renderer/src/pages/game-details/game-details-content.tsx`

- Update sidebar visibility condition: exclude `activeTab === "reviews"` from showing Sidebar.

### 1.2 Overview Tab: Expand Sidebar

**Current state:** Overview sidebar shows: ProtonDB (Linux), Controller Support, System Requirements.

**New state:** Overview sidebar gains the sections previously shown on the Reviews sidebar. New order from top to bottom:

| Order | Section             | Previously on        |
| ----- | ------------------- | -------------------- |
| 1     | ProtonDB            | Overview (unchanged) |
| 2     | Stats               | Reviews              |
| 3     | HowLongToBeat       | Reviews              |
| 4     | System Requirements | Overview (unchanged) |
| 5     | Controller Support  | Overview (unchanged) |
| 6     | Steam Rating        | Reviews              |
| 7     | Game Language       | Reviews              |

**File:** `src/renderer/src/pages/game-details/sidebar/sidebar.tsx`

- Restructure the conditional rendering so Overview gets all sections in the specified order.
- The `stats` block currently guarded by `activeTab === "reviews" || activeTab === "activity"` should now show for `activeTab === "overview"` as well.
- HLTB section should show for Overview AND Activity tabs.
- Steam Rating and Game Language sections should show for Overview only.

**Sidebar visibility matrix after changes:**

| Section             | Overview   | Reviews | Activity | Achievements | Weblinks |
| ------------------- | ---------- | ------- | -------- | ------------ | -------- |
| ProtonDB (Linux)    | ✅         | ❌      | ❌       | ❌           | ❌       |
| Stats               | ✅         | ❌      | ❌       | ❌           | ❌       |
| HowLongToBeat       | ✅         | ❌      | ❌       | ❌           | ❌       |
| System Requirements | ✅         | ❌      | ❌       | ❌           | ❌       |
| Controller Support  | ✅         | ❌      | ❌       | ❌           | ❌       |
| Steam Rating        | ✅         | ❌      | ❌       | ❌           | ❌       |
| Game Language       | ✅         | ❌      | ❌       | ❌           | ❌       |
| Launchbox Details   | ✅ (if LB) | ❌      | ❌       | ❌           | ❌       |

### 1.3 Activity Tab: Remove Sidebar (Game Page)

**Current state:** Activity tab shows the same sidebar as Reviews (ProtonDB, Stats, HLTB, Requirements, Steam Rating, Language).

**New state:** Activity tab has **no sidebar** — the activity panel takes **full width** (truly full width, no max-width constraint).

**File:** `src/renderer/src/pages/game-details/game-details-content.tsx`

- Update sidebar visibility condition: exclude `activeTab === "activity"` from showing Sidebar.

### 1.4 Cleanup: Remove orphaned sidebar code sections

Since the Reviews & Activity tabs no longer use the sidebar, the "Reviews & Activity sidebar sections" block in `sidebar.tsx` that renders Requirements, SteamRating, and GameLanguage for `activeTab === "reviews" || activeTab === "activity"` should be removed entirely (those sections move to Overview only).

Also remove the `Stats` section that currently shows for `activeTab === "reviews" || activeTab === "activity"` — this moves to Overview.

---

## 2. Game Page — Activity Panel Enhancements

### 2.1 Data Labels on Chart Bars

**Current state:** The bar chart in `activity-chart.tsx` shows bars without value labels. Users need to hover to see values.

**New state:** Each bar in the activity chart displays its playtime value as a data label directly on/near the bar.

**Implementation:** Enable Nivo's built-in label rendering on `ResponsiveBar`:

- Set `enableLabel={true}` on the bar chart
- Use `labelFormat` to show human-readable values (e.g., "2.3h" or "45m")
- Place labels inside bars for tall bars, outside for short ones (use `labelSkipHeight` for auto-hiding on very short bars)

This applies to both the bar chart view and does **not** apply to the line chart view.

### 2.2 Tooltip Hover on Hardware Sparklines

**Current state:** The hardware sparklines in `activity-sparkline.tsx` use `isInteractive={false}`, making them static.

**New state:** Sparklines become interactive with tooltips showing **value + timestamp** on hover.

**Implementation in `activity-sparkline.tsx`:**

- Change `isInteractive={true}` on the `ResponsiveLine` component
- Add a custom tooltip that shows:
  - The metric name and current value (e.g., "CPU: 72%")
  - The timestamp formatted as `HH:MM:SS` derived from the sample's x value (milliseconds since epoch)
- Style the tooltip consistently with the activity chart tooltip (dark background, white text, rounded corners)
- Keep `enablePoints={false}` for the sparkline line itself, but show a dot at the hovered position via `useMesh` or `enableCrosshair`
- The tooltip should appear on hover over any part of the sparkline chart area

**Implementation details:**

- The sparkline data already has `x` as timestamp (ms) and `y` as value
- Convert `x` to a formatted time string: `new Date(x).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })`
- Add a `tooltip` prop to the `ResponsiveLine` in `ActivitySparkline`
- Pass a `showTooltip` prop to `ActivitySparkline` (default `true`)

### 2.3 Full-Width Activity Panel Layout

**Current state:** The activity panel is constrained by the parent `game-details__description-content` flex layout. When the sidebar is hidden, the content column expands to fill the available space.

**New state (no sidebar on Activity tab):** The activity panel should use the full width of the container. Since the sidebar is removed (Section 1.3), the content column naturally fills the space. However, the activity panel internal layout should adapt:

- The `game-activity-panel__two-column` grid should adjust when on a wider viewport:
  - When sidebar is present (Overview tab): current 2-column layout (chart + hardware card side by side)
  - When no sidebar (Activity tab): wider layout with more spacious charts
- The stats grid should display more columns on wider screens (already implemented: 4 cols at 900px, 5 cols at 1200px)
- Chart heights should increase proportionally (e.g., 220px → 260px for the main chart, 200px → 240px for sparkline charts)

---

## 3. Main Activity Page (App-Level) — Enhancements

### 3.1 Full-Width Layout

**Current state:** `.activity__content` has `max-width: 1200px; margin: 0 auto;` — content is centered and constrained.

**New state:** Remove the max-width constraint. Content uses the full available width with the existing padding `padding: calc($spacing-unit * 3)`.

**File:** `src/renderer/src/pages/activity/activity.scss`

- Remove `max-width: 1200px` from `&__content`
- Change `margin: 0 auto` to `margin: 0` (or keep `margin: 0 auto` for centering without max-width — content still centered but fills space)
- The `__container` already has `overflow-y: auto` and padding — keep as-is
- The `__two-column` grid already has `grid-template-columns: 1fr 1fr` — this will naturally expand

### 3.2 New Stats Overview Cards

**Current state:** 4 cards: Total Hours, Games Played, Most Active Day, Avg Per Day.

**New state:** 6 cards in a responsive grid. Add:

| #   | Stat            | Data Source                              | Format                 |
| --- | --------------- | ---------------------------------------- | ---------------------- |
| 1   | Total Hours     | `summary.totalHours` (existing)          | `12h 30m`              |
| 2   | Games Played    | `summary.gamesPlayed` (existing)         | number                 |
| 3   | Most Active Day | `summary.mostActiveDateHours` (existing) | `4.5h` + date subtitle |
| 4   | Avg Per Day     | `summary.averageHoursPerDay` (existing)  | `1.2h`                 |
| 5   | Total Sessions  | NEW — aggregate from sessions API        | number                 |
| 6   | Longest Streak  | NEW — computed from sessions data        | `12d`                  |

**Implementation:**

- `Total Sessions`: Sum session counts across all games. Requires calling `getPlaytimeSummary` for session count data, or adding a new `sessionsCount` field to the `PlaytimeSummary` type. If not available in the existing summary, derive from the `topGames` data or add a new IPC call.
- `Longest Streak`: Compute from daily playtime entries across all games — find the longest run of consecutive days with any playtime. This can be computed client-side from the playtime summary data if daily entries are available, or needs a new backend aggregation.

If the `PlaytimeSummary` type does not include these fields, add them:

```ts
// In src/types/ (or declaration.d.ts)
export interface PlaytimeSummary {
  totalHours: number;
  gamesPlayed: number;
  mostActiveDate: string | null;
  mostActiveDateHours: number;
  averageHoursPerDay: number;
  totalSessions: number; // NEW
  longestStreakDays: number; // NEW
  topGames: TopPlayedGame[];
}
```

**Grid layout:** Since there are now 6 cards, update the SCSS:

- `grid-template-columns: repeat(3, 1fr)` on smaller screens (2 rows of 3)
- `grid-template-columns: repeat(6, 1fr)` on wider screens (1440px+)

### 3.3 Session History Timeline

**New section on the main Activity page:** A scrollable session history list showing recent gaming sessions across all games, with full detail including hardware metrics when available.

**Component:** Similar to the game-level `ActivitySessionList` but:

- Each session row shows: game icon + name, date, start/end time, duration
- Expandable hardware detail: if the session has `hardwareMetrics` with valid samples, show sparklines inline (like `ActivityHardwareCard` but compact)
- "Show hardware if available" — only display hardware data for sessions that have it recorded; no placeholder for sessions without

**Data source:** New IPC call or existing `getGameSessions` aggregated across all games. Options:

- Add a new IPC endpoint `getAllRecentSessions(limit: number, offset: number)` that queries across all games
- Or iterate each game's sessions client-side (less efficient)

**UI placement:** Positioned between the `MonthlyTrend` and the bottom `two-column` row (before FriendsComparison).

**Design:**

- Section panel card with title "Recent Sessions"
- Show last 10 sessions across all games (paginated, initially 10)
- Each row: `[game icon] Game Title — Date — Time Range — Duration`
- Clicking a session with hardware data expands to show FPS/CPU/GPU/RAM sparklines
- Hardware sparklines use the same `ActivitySparkline` component with tooltip hover enabled

### 3.4 Achievements Earned

**New section on the main Activity page:** Shows total achievements earned during the selected timeframe.

**Data source:** The achievements API already exists (used by the achievements page). Use:

```ts
window.electron.getAchievementsSummary(startDate, endDate);
```

If this specific IPC call doesn't exist, add a new one that returns:

```ts
interface AchievementsSummary {
  totalEarned: number;
  totalAvailable: number;
  recentUnlocks: {
    gameId: string;
    gameTitle: string;
    achievementName: string;
    unlockedAt: string;
  }[];
}
```

**UI display:** A compact section panel card:

- Large number: "247 / 1,200" (earned / available)
- Progress bar showing percentage
- Subtitle: "Achievements earned this period"
- Quick list of 3-5 most recent unlocks

**Placement:** New row below the session history, before FriendsComparison, or integrated into the stats overview as an additional card.

### 3.5 Platform Breakdown

**New section on the main Activity page:** Shows playtime distribution by platform (Steam, Epic, GOG, etc.).

**Data source:** Derived from the `topGames` array — each game already has a `shop` field:

```ts
const platformHours = topGames.reduce(
  (acc, game) => {
    const shop = game.shop;
    acc[shop] = (acc[shop] ?? 0) + game.totalMilliseconds / 3_600_000;
    return acc;
  },
  {} as Record<string, number>
);
```

**UI display:** A horizontal stacked bar chart or a donut/sunburst chart showing:

- Each platform as a colored segment
- Platform name + hours + percentage
- Use distinct colors per platform (e.g., Steam blue, Epic black, GOG purple, etc.)

**Chart library:** Use Nivo (already installed — `@nivo/bar`, `@nivo/line`). Use `@nivo/pie` for a donut chart.

**Placement:** Paired with Genre Breakdown in a two-column layout, or replace the current Genre Breakdown section (since genre breakdown only shows placeholder data).

---

## 4. Files to Modify

### 4.1 Game Page Sidebar

| File                                                           | Change                                                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/renderer/src/pages/game-details/game-details-content.tsx` | Remove sidebar for `reviews` and `activity` tabs                                                     |
| `src/renderer/src/pages/game-details/sidebar/sidebar.tsx`      | Restructure sections: move HLTB/Stats/SteamRating/Language to Overview; remove Reviews-only sections |
| `src/renderer/src/pages/game-details/sidebar/sidebar.scss`     | No visual changes needed (existing widths sufficient)                                                |

### 4.2 Game Page Activity Panel

| File                                                           | Change                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/renderer/src/pages/game-details/activity-chart.tsx`       | Add data labels on bars (`enableLabel` + `labelFormat`)     |
| `src/renderer/src/pages/game-details/activity-sparkline.tsx`   | Enable interactivity + tooltip with value + timestamp       |
| `src/renderer/src/pages/game-details/activity-sparkline.scss`  | Add tooltip styles                                          |
| `src/renderer/src/pages/game-details/game-activity-panel.scss` | Wider chart heights, adapt two-column grid for wider layout |
| `src/renderer/src/pages/game-details/game-activity-panel.tsx`  | Adjust layout for full-width (no sidebar)                   |

### 4.3 Main Activity Page

| File                                                                | Change                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/renderer/src/pages/activity/activity.tsx`                      | Add new data fetching, new sections, full-width layout |
| `src/renderer/src/pages/activity/activity.scss`                     | Remove max-width, wider stats grid, new section styles |
| `src/renderer/src/pages/activity/stats-overview-cards.tsx`          | Add Total Sessions + Longest Streak cards              |
| **NEW** `src/renderer/src/pages/activity/global-session-list.tsx`   | Session history timeline component                     |
| **NEW** `src/renderer/src/pages/activity/global-session-list.scss`  | Session list styles                                    |
| **NEW** `src/renderer/src/pages/activity/achievements-summary.tsx`  | Achievements earned section                            |
| **NEW** `src/renderer/src/pages/activity/achievements-summary.scss` | Achievements section styles                            |
| **NEW** `src/renderer/src/pages/activity/platform-breakdown.tsx`    | Platform breakdown chart                               |
| **NEW** `src/renderer/src/pages/activity/platform-breakdown.scss`   | Platform breakdown styles                              |
| `src/renderer/src/pages/activity/index.ts`                          | Export new components                                  |

### 4.4 Backend / Types

| File                                | Change                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `src/renderer/src/declaration.d.ts` | Add new IPC method types: `getAllRecentSessions`, `getAchievementsSummary` |
| `src/preload/index.ts`              | Add IPC bridge for new methods                                             |
| `src/main/events/sessions/`         | Add `get-all-recent-sessions.ts` event handler                             |
| `src/main/events/index.ts`          | Register new event handlers                                                |
| `src/types/` or declaration         | Add `PlaytimeSummary` new fields                                           |

### 4.5 Translations

| File                              | Change                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/locales/en/translation.json` | New keys: `total_sessions`, `longest_streak_all`, `platform_breakdown`, `achievements_earned`, `recent_sessions`, etc. |

---

## 5. Edge Cases & Considerations

- **Custom games** (`effectiveShop === "custom"`): The sidebar visibility condition already handles this. Ensure custom games don't break with the new sidebar logic.
- **Launchbox games**: Sidebar shows `LaunchboxDetailsSection` — keep this behavior on Overview only.
- **Loading states**: All new sections on the main Activity page must show skeleton/loading states.
- **Empty states**: When no data exists (no sessions, no achievements), show appropriate empty messages.
- **Performance**: Session history with hardware metrics across all games could be heavy. Consider:
  - Limit to most recent 10-20 sessions
  - Lazy-load hardware sparklines (only expand on click)
  - Use virtualized list if needed
- **Achievements API**: Verify the existing achievements API supports date range filtering. If not, compute faction client-side from the full achievement list.
- **Platform breakdown colors**: Define a consistent color palette for platforms across the app.

---

## 6. Non-Goals (Out of Scope)

- No changes to the Achievements tab or Weblinks tab
- No changes to the game page hero section
- No changes to dashboard cards on the Overview tab
- No changes to the review system
- No mobile-specific responsive changes beyond what naturally flows from CSS
- No changes to the main app TabBar or layout structure

---

## 7. Implementation Order

1. Restructure sidebar: move sections to Overview, remove from Reviews & Activity
2. Remove sidebar rendering for Reviews and Activity tabs in game-details-content.tsx
3. Add data labels on activity chart bars
4. Add tooltip interactivity to hardware sparklines
5. Expand main Activity page: full-width layout, wider stats grid
6. Add Total Sessions + Longest Streak to stats overview cards
7. Build session history timeline for main Activity page (with hardware if available)
8. Build achievements earned section
9. Build platform breakdown section
10. Add new IPC/backend methods as needed
11. Add translations
12. Typecheck, lint, and review
