# Layout Redesign Spec

## Overview

Redesign the Hydra Launcher main renderer layout to be more efficient, sleek, and modern. The key change is moving navigation from the sidebar into a tab bar above the header, consolidating Home and Catalogue into a single "Store" page, and moving utility actions (Downloads, Settings, Friends, Big Picture) to right-side icon buttons.

---

## 1. Sidebar (Left Panel)

### 1.1 — What Stays

- **SidebarProfile** — Keep at the very top (avatar, username, subscription status)
- **Collections section** — Collapsible, with create button, context menus (rename/delete), favorite pin
- **Games section** — Collapsible, with add-game button, playable-only toggle, filter input
- **Sidebar resizing** — Keep the drag handle and width persistence (`localStorage`)

### 1.2 — What Goes

- **Remove all route navigation items** from the sidebar: Home, Catalogue, Library, Downloads, Watchlist, Settings, Activity, Friends, Big Picture
- These move to the tab bar (below) or right-side action buttons

### 1.3 — Game Card Enhancement (SidebarGameItem)

Add playtime display to each sidebar game item:

```
[icon] Game Title              [playtime]
```

- **Format**: Formatted short — e.g., `12h 30m`, `45m`, `2.5h`
- **Position**: Right-aligned within the item, before the download badge (if any)
- **Source**: `game.playTimeInMilliseconds`
- **Fallback**: Show nothing if playtime is 0 or null
- **Style**: Muted, smaller font (e.g., `11px`, color: `rgba(255,255,255,0.45)`)
- **Layout priority**: Title → (flex-grow) → Playtime → Badge
- **Future-proof**: Design the layout to accommodate additional metadata fields easily

### 1.4 — Sidebar Help Button

- Keep the "Need Help" support chat button at the bottom (visible with active subscription)

---

## 2. Tab Bar (Above Header)

### 2.1 — Placement

- **Position**: Above the current `<Header />` component
- Rendered as a dedicated `<TabBar />` component in `app.tsx` before the `<article className="container">`

### 2.2 — Tabs

| Tab       | Route        | Icon                     |
| --------- | ------------ | ------------------------ |
| Store     | `/store`     | `AppsIcon` (or new icon) |
| Library   | `/library`   | `BookIcon`               |
| Watchlist | `/watchlist` | `ListUnorderedIcon`      |
| Activity  | `/activity`  | `ClockIcon`              |

### 2.3 — Tab Behavior

- **Active state**: Highlighted with accent color (brand teal `#16b195` underline or background)
- **Click**: Navigate to the corresponding route
- **Transitions**: Keep existing page transitions (each page handles its own animations)
- **Persistence**: Active tab determined by `location.pathname` (router-driven, no separate state)
- **Visual style**: Flat, minimal — matching the dark theme. Tabs should have:
  - Vertical padding for comfortable click targets
  - Horizontal gap between tabs
  - Subtle hover background (`rgba(255,255,255,0.08)`)
  - Active indicator (e.g., bottom border or background tint)

### 2.4 — Future-Proofing

- The tab bar component should be designed to easily add new tabs in the future
- Tab definitions should be a simple config array

---

## 3. Right-Side Action Buttons

### 3.1 — Placement

Same row as the Tab Bar, on the far right side.

### 3.2 — Buttons

| Button      | Icon           | Behavior                                           | Badge                                 |
| ----------- | -------------- | -------------------------------------------------- | ------------------------------------- |
| Downloads   | `DownloadIcon` | Opens mini-dropdown + link to `/downloads`         | Progress count/pulse when downloading |
| Settings    | `GearIcon`     | Navigate to `/settings`                            | None                                  |
| Friends     | `PeopleIcon`   | Open friends window (`openFriendsWindow()`)        | Online friends count                  |
| Big Picture | `VideoIcon`    | Open big picture window (`openBigPictureWindow()`) | None                                  |

### 3.3 — Style

- **Icon-only** with tooltip on hover
- Circular or rounded hover background
- Badge: Small pill/circle overlay showing count (matching existing `sidebar__online-count` style for Friends)
- Downloads badge: Shows a pulsing dot or progress indicator when downloads are active
- Consistent spacing between buttons (`gap: 8px`)

### 3.4 — Downloads Mini-Dropdown

When clicking the Downloads button:

- Opens a compact dropdown/popover below the button
- Shows:
  - Current download progress (game title + % + ETA/download speed)
  - Queued downloads count
  - Completed downloads count
- Has a "View all downloads" link navigating to `/downloads`
- Closes on click outside or pressing Escape
- Uses the same `useDownload()` and `useLibrary()` hooks for data

---

## 4. Header Changes

### 4.1 — What Changes

- The header is now positioned **below** the tab bar
- **Remove**: The hardcoded page title logic from the header (title is now in the tabs)
- **Keep**: Back button, search bar, scan button, AutoUpdateSubHeader

### 4.2 — New Header Title Logic

Instead of the current title map (`pathTitle`), the header title should be:

- Derived from the active tab (e.g., tab label) for top-level pages
- The existing `headerTitle` from Redux state for nested pages (game details, achievements, profile)
- Empty/hidden for the Store tab since it's the default/home

### 4.3 — Search Behavior

- Search remains in the header
- Context-aware: searching on Library tab searches library, searching on Store tab navigates to catalogue section
- On the Store page, search should jump to/show the catalogue section

---

## 5. Store Page (Combined Home + Catalogue)

### 5.1 — Route

- Path: `/store` (replaces both `/` and `/catalogue`)
- The old `/` route should redirect to `/store`
- The `/catalogue` route should redirect to `/store`

### 5.2 — Layout

Two-section stacked page:

```
┌─────────────────────────────────────┐
│  ┌─────────────────────────────┐    │
│  │       HERO SECTION          │    │
│  │  (large banner/featured)    │    │
│  └─────────────────────────────┘    │
│                                     │
│  [Hot] [Weekly] [Achievements]      │
│  [Surprise Me]                      │
│                                     │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐    │
│  │  │ │  │ │  │ │  │ │  │ │  │    │
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘    │
│                                     │
│  ─────── DIVIDER ──────────────     │
│                                     │
│  ┌───────────────────────────┐      │
│  │  CATALOGUE SECTION        │      │
│  │  [Filters sidebar | Grid] │      │
│  └───────────────────────────┘      │
└─────────────────────────────────────┘
```

### 5.3 — Home Section (Top)

- Reuse the current `Home` component's logic and UI:
  - Hero component
  - Category buttons (Hot, Weekly, Achievements + Surprise Me)
  - 12-card game grid with skeleton loading
- Category change only updates the home section cards (not the catalogue below)

### 5.4 — Divider

- Clear visual separator between home section and catalogue section
- Could be a section header with "Browse All Games" text, or a thin line with padding

### 5.5 — Catalogue Section (Bottom)

- Reuse the current `Catalogue` component's logic and UI:
  - Search results display
  - Right-side filter panel (genres, tags, developers, publishers, ProtonDB, release year, watchlist toggle, mode toggle)
  - Sort dropdown
  - Pagination
  - Mode toggle (Modern/Classics)
- The catalogue section should have its own header/controls row

### 5.6 — Scroll Behavior

- The entire Store page scrolls as one continuous page
- When search filters are applied in the catalogue section, auto-scroll to that section

---

## 6. Other Pages (Now Accessed via Tabs)

### 6.1 — Library (`/library`)

- **No design changes** — keep the current library page exactly as-is
- Accessed via the Library tab
- CategoryFilter, PlatformFilter, ViewOptions, and collection pills remain as inline controls within the page

### 6.2 — Watchlist (`/watchlist`)

- **No design changes** — keep current card grid layout with priority badges, add-to-library, and remove actions
- Accessed via the Watchlist tab

### 6.3 — Activity (`/activity`)

- **No design changes** — keep current stats/analytics layout
- Accessed via the Activity tab

---

## 7. Route & Navigation Updates

### 7.1 — Router Changes (`main.tsx`)

```
Old routes to remove/redirect:
  "/"            → redirect to "/store"
  "/catalogue"   → redirect to "/store"

New route:
  "/store"       → Store component (combined Home + Catalogue)

Keep:
  "/library"     → Library
  "/watchlist"   → WatchlistPage
  "/activity"    → Activity
  "/downloads"   → Downloads (still accessible as full page)
  "/settings"    → Settings
  All game detail, profile, achievements, notifications routes
```

### 7.2 — Sidebar Routes Config

Remove most items from `src/renderer/src/components/sidebar/routes.tsx`:

- Keep only items that make sense in the sidebar (none of the main nav items)
- Or repurpose/remove the file entirely if the sidebar no longer has route links

### 7.3 — Default Route

- When app opens, default to `/store` (was `/`)

---

## 8. Bottom Panel

- **Keep as-is** — download status text (left) and version/build info (right)
- The click target on the download status still navigates to `/downloads`
- No changes needed

---

## 9. Visual Design Guidelines

### 9.1 — Tab Bar Styling

```
Background:  $dark-background-color (#0d0d0d)
Height:       ~44px
Border:       Bottom: 1px solid $border-color
Padding:      0 24px
Layout:       flex, space-between (tabs left, actions right)
```

### 9.2 — Tab Styling

```
Font size:      13px
Font weight:    500
Color (inactive): $body-color (#d0d1d7)
Color (active):   $muted-color (#f0f1f7)
Active indicator: Bottom border 2px solid $brand-teal (#16b195)
Hover:            background rgba(255,255,255,0.08)
Padding:          8px 16px
Gap between tabs: 4px
Border radius:    6px
```

### 9.3 — Right Action Buttons Styling

```
Size:          32x32px (icon 16x16)
Hover:         background rgba(255,255,255,0.1), border-radius 8px
Active:        background rgba(255,255,255,0.08)
Badge:         16px circle, positioned top-right, matching sidebar badge styles
```

### 9.4 — Download Progress Badge

```
Style:         Small green pulsing dot when active
               Or: Count number in badge (e.g., "2") when items queued
Color:         $success-color (#1c9749) for active
               Neutral for idle
```

---

## 10. Component Architecture

### 10.1 — New Components

- `TabBar` — `src/renderer/src/components/tab-bar/tab-bar.tsx`
- `TabBar` SCSS — `src/renderer/src/components/tab-bar/tab-bar.scss`
- `DownloadsDropdown` — `src/renderer/src/components/downloads-dropdown/downloads-dropdown.tsx`
- `Store` page — `src/renderer/src/pages/store/store.tsx`

### 10.2 — Modified Components

- `Sidebar` — Remove route navigation items; keep collections + games
- `SidebarGameItem` — Add playtime display
- `Header` — Update title logic; simplify
- `App` — Add `<TabBar />` before `<article>`; update layout structure
- `routes.tsx` — Remove or repurpose

### 10.3 — Layout Structure (new `app.tsx`)

```
<main>
  <Sidebar />                          // Collections + Games only
  <article className="container">
    <TabBar />                         // NEW: Tabs + right action buttons
    <Header />                         // Simplified: back button + search
    <section className="container__content">
      <Outlet />
    </section>
  </article>
</main>
<BottomPanel />
```

---

## 11. Playtime Display Implementation

### 11.1 — Data Source

- `game.playTimeInMilliseconds` (from `LibraryGame` type)

### 11.2 — Formatting Function

Create a shared utility `formatPlayTimeShort(ms: number)`:

```
0ms          → ""
< 1 hour     → "45m"
1-10 hours   → "2h 30m"
10+ hours    → "12.5h"
```

### 11.3 — SidebarGameItem Layout Update

```
Current:
[icon] TitleText              [badge]

New:
[icon] TitleText        12h 30m  [badge]
```

The playtime text should:

- Be right-aligned with `margin-left: auto` before the badge
- Use `font-size: 10px`, `color: rgba(255,255,255,0.5)`
- Not wrap or shrink
- Only render when `playTimeInMilliseconds > 0`

---

## 12. Implementation Order

1. Create `TabBar` component with tabs and right action buttons
2. Create `Store` page combining Home + Catalogue
3. Update router to add `/store`, redirect `/` and `/catalogue`
4. Remove navigation items from sidebar
5. Add playtime to `SidebarGameItem`
6. Create `DownloadsDropdown` component
7. Update `Header` component title logic
8. Update `app.tsx` layout structure
9. Clean up unused sidebar routes config
10. Polish: animations, transitions, responsive behavior

---

## 13. Edge Cases & Considerations

- **Empty state**: When user has no games in library, the sidebar should show an empty state message
- **Offline**: Tab bar and action buttons should work regardless of network status
- **Window resize**: Tab bar should handle narrow widths gracefully (tabs should not wrap, action buttons should remain visible)
- **MacOS title bar**: Account for `--darwin` class padding on sidebar
- **Windows title bar**: Account for the custom title bar (`title-bar` div)
- **Keyboard navigation**: Tabs should be keyboard-accessible (Tab key, Enter to activate)
- **Search context**: The header search should work contextually based on the active tab
- **Deep links**: Existing deep link handlers (`hydralauncher://...`) should still work
- **i18n**: All new UI text should use the translation system

---

## 14. Files Affected (Initial Assessment)

| File                                                                             | Change                         |
| -------------------------------------------------------------------------------- | ------------------------------ |
| `src/renderer/src/app.tsx`                                                       | Add TabBar, restructure layout |
| `src/renderer/src/app.scss`                                                      | Adjust layout if needed        |
| `src/renderer/src/main.tsx`                                                      | Add `/store` route, redirects  |
| `src/renderer/src/components/sidebar/sidebar.tsx`                                | Remove nav items               |
| `src/renderer/src/components/sidebar/sidebar.scss`                               | Minor cleanup                  |
| `src/renderer/src/components/sidebar/sidebar-game-item.tsx`                      | Add playtime                   |
| `src/renderer/src/components/sidebar/routes.tsx`                                 | Remove/reduce                  |
| `src/renderer/src/components/header/header.tsx`                                  | Simplify title logic           |
| `src/renderer/src/components/header/header.scss`                                 | Minor adjustments              |
| `src/renderer/src/components/index.ts`                                           | Export new components          |
| **NEW** `src/renderer/src/components/tab-bar/tab-bar.tsx`                        | Tab bar component              |
| **NEW** `src/renderer/src/components/tab-bar/tab-bar.scss`                       | Tab bar styles                 |
| **NEW** `src/renderer/src/components/downloads-dropdown/downloads-dropdown.tsx`  | Downloads dropdown             |
| **NEW** `src/renderer/src/components/downloads-dropdown/downloads-dropdown.scss` | Dropdown styles                |
| **NEW** `src/renderer/src/pages/store/store.tsx`                                 | Combined Store page            |
| **NEW** `src/renderer/src/pages/store/store.scss`                                | Store page styles              |
| **NEW** `src/shared/format-playtime-short.ts` (or in shared/index.ts)            | Playtime formatter             |
