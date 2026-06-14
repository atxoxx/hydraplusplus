# Steam Stats Panel — Specification

## Overview

Add a **live Steam player counter badge** to the right side of the hero banner image and a **Steam rating/review breakdown section** to the sidebar on the game details page (renderer only). Both features work for all game types (Steam, non-Steam via name search fallback) and include loading skeletons and graceful error handling.

---

## 1. Live Player Counter (Hero Banner)

### 1.1 Placement

- Overlay on the **right side** of the hero banner image (`game-details__hero-image`)
- Positioned as a **compact pill/badge** with glass-morphism styling (matching the cloud-sync button aesthetic)
- Located in the **top-right area** of the hero, above the `game-details__hero-buttons--right` area
- Does NOT interfere with the existing hero-panel (playtime/download info at the bottom)

### 1.2 Visual Design

```
┌──────────────────────────────────────────────────────┐
│                                              ┌──────┐│
│                                              │ 👥   ││
│  [Game Logo]                                 │12.3K ││
│                                              │ live ││
│                                              └──────┘│
│                                    [Cloud] [Edit]    │
│  ┌──────────────────────────────────────────────────┐│
│  │  Playtime / Download info                        ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

- **Style**: Dark semi-transparent background (`rgba(0, 0, 0, 0.6)`), backdrop blur 10px, 1px border `rgba(255, 255, 255, 0.15)`, border-radius 8px
- **Icon**: `PeopleIcon` from `@primer/octicons-react` (already used in sidebar stats)
- **Player count**: Bold number, white/light color, 14px font
- **"live" indicator**: Small green dot + "live" text or animated pulse dot
- **All-time peak**: Smaller text below the current count (if available), e.g., "Peak: 45.2K"
- **Trend indicator**: Small arrow + percentage (e.g., "↑ 12%") or color-coded trend indicator next to the player count
- **Hover tooltip**: Shows full details — "Current players: 12,345 | All-time peak: 45,210 | 24h trend: +12%"
- **Entry animation**: Matches existing `slide-in` animation used for cloud-sync button (0.3s cubic-bezier)

### 1.3 Data Sources

| Data Point | Primary Source | Fallback |
|---|---|---|
| **Current players** | Steam Web API `ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid={appid}` | None (required) |
| **All-time peak** | SteamSpy API `https://steamspy.com/api.php?request=appdetails&appid={appid}` → `ccu` field | Scrape SteamCharts.com `/app/{appid}` page |
| **24h/7d trend** | Scrape SteamCharts.com `/app/{appid}` page (parse the trend indicators) | Show "—" placeholder |

### 1.4 Data Flow

```
Renderer                          Main Process                     External
─────────                         ────────────                     ────────
HeroPlayerCounter                 
  │                               
  ├─► window.electron             
  │   .getSteamPlayerCount(       registerEvent
  │     shop, objectId,           "getSteamPlayerCount"
  │     gameTitle)                
  │                               ├─► fetch current players:
  │                               │   GET store.steampowered.com/api/
  │                               │   appdetails?appids={id}
  │                               │   
  │                               ├─► fetch peak via SteamSpy:
  │                               │   GET steamspy.com/api.php?
  │                               │   request=appdetails&appid={id}
  │                               │   
  │                               └─► scrape trend:
  │                                   GET steamcharts.com/app/{id}
  │                                   (parse HTML for trend %)
  │                               
  │◄── SteamPlayerCountResponse ──┤
  │                               
  └─► render badge
```

### 1.5 Refresh Strategy

- **On page navigation**: Fetch when the game details page loads (component mount)
- **On tab/window focus**: Re-fetch when the user returns to the window
- **No auto-polling**: No timer-based refresh to avoid excessive API calls
- **Cache**: Cache results for 5 minutes in memory (per game)

### 1.6 Non-Steam Games

- Use `gameTitle` to search SteamCharts.com (if possible) or the Steam store search
- If no data can be found → **silently hide** the badge
- No error toast or message shown

### 1.7 Error States

| Scenario | Behavior |
|---|---|
| Network offline | Hide the badge entirely |
| Steam API down/error | Hide the badge entirely |
| Non-Steam game, no match found | Hide the badge entirely |
| Peak/trend unavailable but current players OK | Show current players only, no peak/trend |
| All data unavailable | Hide the badge entirely |

---

## 2. Steam Rating & Review Breakdown (Sidebar)

### 2.1 Placement

- **Sidebar**: Insert a **Steam Rating section** directly **below the existing stats section** (download count, player count, rating)
- The existing stats section (`stats` in sidebar.tsx) remains unchanged above it
- Uses the existing `SidebarSection` component with a collapsible header
- Title: `"steam_rating"` (translatable)

### 2.2 Steam Rating Section Content

```
┌─ SidebarSection: "Steam Rating" ──────────────────┐
│                                                     │
│  "Very Positive"                    [See Details →] │
│  ████████████████████████░░░░  94% positive         │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ Positive  ██████████████████████  142,345   │    │
│  │ Negative  ████                     8,721    │    │
│  │ Total                       151,066 reviews │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  Recent reviews (30 days): "Very Positive" - 92%    │
│  Recent count: 1,234 reviews                        │
└─────────────────────────────────────────────────────┘
```

#### Data Model (new type)

```typescript
interface SteamReviewSummary {
  // Overall
  reviewScoreDescriptor: string;      // "Very Positive", "Mixed", etc.
  totalPositive: number;
  totalNegative: number;
  totalReviews: number;
  reviewScore: number;                // 0–100 percentage
  
  // Recent (30 days)
  recentReviewScoreDescriptor: string;
  recentPositive: number;
  recentNegative: number;
  recentTotal: number;
  recentReviewScore: number;
}
```

#### Visual Elements

- **Score descriptor**: Bold text in Steam's rating color:
  - "Overwhelmingly Positive" / "Very Positive" / "Positive" → `#66c0f4` (Steam blue)
  - "Mostly Positive" → `#66c0f4`
  - "Mixed" → `#b9a074` (Steam yellow/brown)
  - "Mostly Negative" / "Negative" / "Very Negative" / "Overwhelmingly Negative" → `#a34c25` (Steam red-brown)
- **Progress bar**: Horizontal bar showing positive/negative ratio, using the score color for the positive portion
- **Counts**: Formatted numbers (e.g., "142.3K" using existing `numberFormatter`)
- **Recent section**: Smaller text below, showing last 30 days stats
- **"See Details" button**: Opens the full analysis dashboard modal

### 2.3 Full Analysis Dashboard Modal

- **Style**: Matches `GameOptionsModal` — same size, background, animation, overlay
- **Title**: `"{Game Name} — Steam Review Analysis"` (translatable)

#### Modal Content Tabs/Sections

**Tab 1: Reviews Overview**
- Overall score descriptor + percentage (large, prominent)
- Review count over time chart (line/area chart using `recharts`)
  - X-axis: months (last 12 months if available, else "all time")
  - Y-axis: number of reviews
  - Two lines: positive reviews, negative reviews
- Positive/Negative breakdown pie or donut chart
- Review score trend (line chart of percentage positive over time)

**Tab 2: Player Count** (if data available)
- Current player count (live)
- All-time peak player count
- Player count history chart (using `recharts`)
  - X-axis: time
  - Y-axis: concurrent players

**Tab 3: Language Breakdown** (if available from Steam API)
- Table or bar chart showing review counts by language
- Top 5–10 languages

### 2.4 Data Sources for Review Data

| Data Point | Source |
|---|---|
| Review summary (all-time) | Steam Store API `store.steampowered.com/appreviews/{appid}?json=1&language=all&purchase_type=all` |
| Review summary (recent 30d) | Same API with `?json=1&language=all&purchase_type=all&day_range=30` |
| Review count over time | Steam Store API `store.steampowered.com/appreviews/{appid}?json=1&cursor=*&num_per_page=100` (paginated to build history) — OR scrape SteamDB/SteamCharts |
| Player count history | Scrape SteamCharts.com `/app/{appid}` for the chart data table |
| Language breakdown | Steam Store API review data includes `language` field — aggregate client-side |

### 2.5 Non-Steam Games

- Try to find Steam App ID by searching via game name (Steam store search API: `store.steampowered.com/api/storesearch/?term={name}&l=english`)
- If a match is found → use the App ID for all data fetching
- If no match → show "No Steam data available for this game" placeholder in the sidebar section

### 2.6 Loading States

- **Rating section skeleton**: 
  - 2-line skeleton for score descriptor + percentage
  - Full-width skeleton bar for the progress bar
  - 3 shorter skeletons for the counts
- **Modal loading**: Full skeleton dashboard layout with placeholder chart areas

### 2.7 Error States

| Scenario | Rating Section | Modal |
|---|---|---|
| Steam API unavailable | "Data temporarily unavailable" message | N/A (button hidden) |
| Non-Steam, no match | "No Steam data available" placeholder | N/A |
| Partial data (e.g., no recent) | Show all-time only, hide recent | Show available data only |
| Network offline | Keep previous cached data (if any) | Show cached data or error |

---

## 3. Technical Implementation

### 3.1 New Types (`src/types/steam.types.ts`)

```typescript
export interface SteamPlayerCount {
  currentPlayers: number;
  allTimePeak: number | null;
  trend24h: number | null;     // percentage change, e.g., 12.5 or -5.3
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
  date: string;       // ISO date string
  positive: number;
  negative: number;
  total: number;
}

export interface SteamPlayerHistoryPoint {
  date: string;       // ISO date string
  players: number;
}

export interface SteamReviewAnalysis {
  summary: SteamReviewSummary;
  history: SteamReviewHistoryPoint[];
  languageBreakdown: { language: string; count: number }[];
  playerHistory: SteamPlayerHistoryPoint[];
}
```

### 3.2 New IPC Events (main process)

- `getSteamPlayerCount(shop, objectId, gameTitle)` → `SteamPlayerCount | null`
- `getSteamReviewSummary(shop, objectId, gameTitle)` → `SteamReviewSummary | null`
- `getSteamReviewAnalysis(shop, objectId, gameTitle)` → `SteamReviewAnalysis | null`

### 3.3 New Files

```
src/renderer/src/pages/game-details/
├── hero/
│   └── hero-player-counter.tsx          # Live player badge component
│   └── hero-player-counter.scss
├── sidebar/
│   └── steam-rating-section.tsx        # Sidebar rating card
│   └── steam-rating-section.scss
├── modals/
│   └── steam-review-modal.tsx          # Full analysis dashboard modal
│   └── steam-review-modal.scss
src/main/events/catalogue/
└── get-steam-player-count.ts           # IPC handler for player count
└── get-steam-review-summary.ts         # IPC handler for review data
└── get-steam-review-analysis.ts        # IPC handler for full analysis
src/main/services/
└── steam-charts.ts                     # SteamCharts scraping logic
```

### 3.4 Modified Files

| File | Change |
|---|---|
| `src/renderer/src/pages/game-details/game-details-content.tsx` | Insert `<HeroPlayerCounter />` in hero area |
| `src/renderer/src/pages/game-details/sidebar/sidebar.tsx` | Insert `<SteamRatingSection />` below stats section |
| `src/renderer/src/pages/game-details/hero.scss` | Add positioning for player counter badge |
| `src/types/steam.types.ts` | Add new interfaces |
| `src/types/index.ts` | Re-export new types |
| `src/preload/index.ts` | Add new IPC method declarations |
| `src/main/events/index.ts` | Register new event handlers |
| `src/locales/en/translation.json` | Add translation keys |

### 3.5 Dependencies

- **`recharts`**: Already in `package.json` (`^3.8.1`) — used for charts in the modal
- **`cheerio`** or built-in DOM parsing: For scraping SteamCharts.com HTML (main process)
- No new npm packages needed beyond possibly `cheerio` for HTML parsing

### 3.6 Translation Keys (added to `game_details` namespace)

```json
{
  "steam_rating": "Steam Rating",
  "steam_player_count": "Players",
  "live": "live",
  "peak": "Peak",
  "see_details": "See Details",
  "steam_review_analysis": "Steam Review Analysis",
  "reviews_overview": "Reviews Overview",
  "player_count_history": "Player Count History",
  "language_breakdown": "Reviews by Language",
  "positive": "Positive",
  "negative": "Negative",
  "total_reviews": "Total reviews",
  "recent_reviews": "Recent reviews (30 days)",
  "no_steam_data": "No Steam data available",
  "data_unavailable": "Data temporarily unavailable",
  "all_time": "All time",
  "last_30_days": "Last 30 days",
  "review_score": "Review score",
  "review_count": "Review count"
}
```

---

## 4. Styling Requirements

### 4.1 Hero Player Counter Badge

- Position: `absolute`, top-right of hero image
- `top: calc($spacing-unit * 1.5)`, `right: calc($spacing-unit * 2)`
- `z-index: 2` (above hero image, below hero buttons)
- Glass-morphism: `background: rgba(0, 0, 0, 0.6)`, `backdrop-filter: blur(10px)`, `border: 1px solid rgba(255, 255, 255, 0.15)`, `border-radius: 8px`
- Padding: `calc($spacing-unit * 1) calc($spacing-unit * 1.5)`
- Flex row, gap `$spacing-unit`
- Live indicator dot: 6px green circle (`#4caf50`), with optional pulse animation
- Entry animation: matches existing `slide-in` from `hero.scss`

### 4.2 Steam Rating Section

- Uses existing `SidebarSection` wrapper
- Score descriptor: 16px, bold, color-coded
- Progress bar: height 6px, border-radius 3px, background `rgba(255,255,255,0.1)`, fill color-coded
- Breakdown rows: flex space-between, 12px font, muted color

### 4.3 Analysis Modal

- Matches `GameOptionsModal`:
  - Same width (max 700px), centered, dark background
  - Same overlay, animation, close button
- Tab bar: horizontal tabs (Reviews | Players | Languages)
- Charts: `recharts` with dark theme colors matching the app:
  - Grid lines: `rgba(255, 255, 255, 0.05)`
  - Text: `#d0d1d7` (body-color)
  - Line colors: `#66c0f4` (Steam blue), `#a34c25` (red-brown), `#16b195` (brand-teal)
- Chart height: ~300px each

---

## 5. Edge Cases & Constraints

| Scenario | Behavior |
|---|---|
| Steam App ID not available for a non-Steam game | Search Steam store by game name; if no match found, hide both features |
| SteamCharts.com blocks scraping (Cloudflare, etc.) | Fall back to showing only Steam API data; hide chart/trend |
| SteamSpy API rate-limited | Skip peak data, show current players only |
| Game has very few reviews (< 50) | Still show the data, but note "Limited data" |
| User rapidly switches between games | Abort in-flight requests using AbortController (existing pattern in context) |
| Very long game names for non-Steam search | URL-encode properly; truncate if needed |
| Modal open while navigating away | Auto-close modal on route change |

---

## 6. Open Questions / Decisions Pending

1. **SteamCharts scraping reliability**: May need to implement a Cloudflare bypass or use a different source if scraping fails consistently. Consider adding a configurable fallback chain.
2. **Chart data depth**: How many months of historical data — 3 months, 6 months, 12 months? (Spec assumes "as much as available")
3. **Performance**: If review history requires many paginated API calls, consider caching on the Hydra backend instead of fetching client-side.
4. **Big Picture mode**: Explicitly out of scope per user confirmation.
