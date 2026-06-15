# Sidebar Game Item Enhancements — Specification

## Overview

Enhance the sidebar game list to display a two-level layout per game item:

- **Top level**: Game title (existing behavior, largely unchanged)
- **Bottom level**: Inline badges for playtime, unlocked achievements, and friends who own the game

Additionally, add a new **"Play Next" suggestions** section to the sidebar.

---

## 1. Two-Level Game Item Layout

### 1.1 Layout Structure

```
┌──────────────────────────────────────────┐
│ [icon] Game Title                        │  ← Top level (existing)
│        🕐 2h 30m  🏆 12/50  👤 2/5      │  ← Bottom level (new badges row)
└──────────────────────────────────────────┘
```

- The bottom row appears below the game title, inside the existing `<button>` element
- Badges are inline, separated by spacing
- The existing download status overlay on the title remains unchanged
- The existing "new download options" badge (green "+N") remains but moves to the bottom row alongside other badges

### 1.2 Badge Specifications

#### Playtime Badge

- **Icon**: `ClockIcon` from `@primer/octicons-react` (already used in library cards)
- **Format**: `formatPlayTimeShort` from `@shared` (e.g., "2h 30m", "45m", "0h")
- **Color**: Muted/white-transparent (matches existing `sidebar__game-playtime` styling at `rgba(255, 255, 255, 0.4)`)
- **When zero**: Show "0h" (placeholder — consistent layout)
- **Toggle**: User preference `sidebarShowPlaytimeBadge` (default: `true`)

#### Achievements Badge

- **Icon**: `TrophyIcon` from `@primer/octicons-react`
- **Format**: `{unlocked}/{total}` (e.g., "12/50")
- **Color**:
  - Default: muted white-transparent
  - Completed (100%): Gold/amber color with a distinct style (similar to library card's completed state)
- **When zero achievements**: Show "0/0" (placeholder)
- **Hidden entirely when**: `game.achievementCount` is `undefined`, `null`, or `0` AND `game.unlockedAchievementCount` is `undefined`, `null`, or `0` — use placeholder "0/0"
- **Toggle**: User preference `sidebarShowAchievementsBadge` (default: `true`)

#### Friends Badge

- **Icon**: `PersonAddIcon` or custom person-with-checkmark (from `@primer/octicons-react` — use `PeopleIcon` with a visual indicator)
- **Format**: `{onlineCount}/{totalCount}` (e.g., "2/5" meaning 2 online out of 5 friends who own)
- **Color**:
  - Default: muted white-transparent
  - When 1+ friends online: subtle green accent on the online portion
- **When zero friends own**: Show "0" (placeholder)
- **Toggle**: User preference `sidebarShowFriendsBadge` (default: `true`)
- **Hover**: React-tooltip showing up to 5 friends with their avatars (32px) and display names
- **Click**: Opens a modal listing all friends who own the game

---

## 2. Friends Ownership Data

### 2.1 Data Strategy

- **Source**: Fetch each friend's full profile/library (`UserProfile.libraryGames`) and build a local `Map<gameId, Friend[]>` cache
- **When to fetch**: On app startup after user login, when the friends list is available
- **Storage**: New Redux slice `friendGameOwnership` or extend existing state
- **Caching**: Cache friend library data locally with a reasonable TTL (e.g., refresh every 15 minutes or on WebSocket friend events)
- **WebSocket updates**: Listen to existing `friendGameSession` and `friendPresence` events to update online/offline counts in real-time without re-fetching

### 2.2 Data Structure

```typescript
interface FriendOwnershipMap {
  // Key: game identifier string (e.g., "steam:12345" or game.id)
  [gameKey: string]: {
    friends: Array<{
      id: string;
      displayName: string;
      profileImageUrl: string | null;
      isOnline: boolean;
    }>;
    onlineCount: number;
    totalCount: number;
  };
}
```

### 2.3 API Integration

- Use `GET /profile/friends` to get the friends list
- For each friend, fetch `GET /profile/{friendId}` to get their `libraryGames`
- This can be done lazily (first time sidebar renders) or eagerly (on app load)
- Consider a dedicated batch endpoint in the future for efficiency if needed

---

## 3. Friends Ownership Modal

### 3.1 Trigger

- Clicking the friends badge on a sidebar game item opens the modal

### 3.2 Modal Content

- **Title**: "Friends who own {game.title}"
- **List**: All friends who own the game, grouped:
  - **Online** section first (with green status orb)
  - **Offline** section below (with gray status orb)
- Each friend row shows: Avatar (40px), display name, online status indicator
- Clicking a friend navigates to their profile: `navigate(/profile/{friendId})`
- **Close**: Standard modal close (X button and click-outside)

### 3.3 Empty State

- If no friends own the game: "None of your friends own this game yet."

---

## 4. Per-Badge User Preferences

### 4.1 Storage

- Persisted in the existing user preferences system (LevelDB sublevel for preferences)
- Keys:
  - `sidebarShowPlaytimeBadge` (boolean, default `true`)
  - `sidebarShowAchievementsBadge` (boolean, default `true`)
  - `sidebarShowFriendsBadge` (boolean, default `true`)

### 4.2 UI Controls

- Add toggles in the Settings page, under a "Sidebar" section
- Each toggle has a label and description
- Changes take effect immediately (no restart needed)

### 4.3 Redux Integration

- Extend `userPreferences` slice (or sidebar preferences) to include these toggles
- `SidebarGameItem` reads from Redux state to determine badge visibility

---

## 5. "Play Next" Suggestions Section

### 5.1 Placement

- New collapsible section in the sidebar, between "Collections" and "Games" sections
- Section header: "Play Next" with a sparkle/lightbulb icon
- Collapsible, default state: expanded

### 5.2 Suggestion Criteria

- **Unplayed games**: `playTimeInMilliseconds === 0` (never played)
- **Recently played but abandoned**: Games with `lastTimePlayed` more than 7 days ago and less than 2 hours of playtime
- Choose up to 5 games, prioritizing:
  1. Recently added unplayed games (by `createdAt` or addition date)
  2. Recently played but unfinished games

### 5.3 Display

- Each suggested game shows: icon, title, and a short reason label (e.g., "New", "Continue", "Try it")
- Compact, same height as regular game items
- Clicking navigates to the game details page

### 5.4 Empty State

- If no games match criteria: section hides entirely (or shows a message when expanded)

### 5.5 Refresh

- Recalculates when the library changes (new games added, game launched, etc.)

---

## 6. Sidebar Sorting

### 6.1 Sort Dropdown

- Add a small sort dropdown in the "Games" section header
- Sort options:
  - **Alphabetical** (default, current behavior)
  - **Most played** (by `playTimeInMilliseconds` descending)
  - **Recently played** (by `lastTimePlayed` descending)
  - **Installed first** (games with `executablePath` first)

### 6.2 Persistence

- Save sort preference to localStorage: `sidebar-sort-by`
- Apply sort to `sortedLibrary` in the Sidebar component

---

## 7. Files to Modify

### 7.1 Core Components

| File                                                        | Changes                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/renderer/src/components/sidebar/sidebar-game-item.tsx` | Major: Add two-level layout with badges row, tooltip, click handler for friends modal |
| `src/renderer/src/components/sidebar/sidebar.tsx`           | Moderate: Add "Play Next" section, sort dropdown, fetch friend ownership data         |
| `src/renderer/src/components/sidebar/sidebar.scss`          | Moderate: New styles for badges row, suggestions section, sort dropdown               |

### 7.2 New Components

| File                                                             | Purpose                                       |
| ---------------------------------------------------------------- | --------------------------------------------- |
| `src/renderer/src/components/sidebar/sidebar-friends-modal.tsx`  | Modal showing friends who own a specific game |
| `src/renderer/src/components/sidebar/sidebar-suggestions.tsx`    | "Play Next" suggestions section component     |
| `src/renderer/src/components/sidebar/sidebar-friends-modal.scss` | Styles for the friends modal                  |

### 7.3 State Management

| File                                                 | Changes                                  |
| ---------------------------------------------------- | ---------------------------------------- |
| `src/renderer/src/features/library-slice.ts`         | Minor: Add friend ownership map to state |
| `src/renderer/src/features/use-preferences-slice.ts` | Add sidebar badge preference keys        |

### 7.4 Hooks

| File                                                        | Changes                                         |
| ----------------------------------------------------------- | ----------------------------------------------- |
| `src/renderer/src/hooks/use-library.ts`                     | Possibly: Add friend ownership data fetching    |
| (New) `src/renderer/src/hooks/use-friend-game-ownership.ts` | Hook for fetching/caching friend game ownership |

### 7.5 Types

| File                 | Changes                       |
| -------------------- | ----------------------------- |
| `src/types/index.ts` | Add `FriendOwnershipMap` type |

### 7.6 i18n

| File                              | Changes                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `src/locales/en/translation.json` | Add new translation keys for sidebar section               |
| Other locale files                | Add corresponding translations (can be done incrementally) |

### 7.7 Settings

| File                    | Changes                        |
| ----------------------- | ------------------------------ |
| Settings page component | Add sidebar preference toggles |

---

## 8. Translation Keys (English)

```json
{
  "sidebar": {
    "play_next": "Play Next",
    "play_next_empty": "No suggestions right now",
    "suggestion_new": "New",
    "suggestion_continue": "Continue",
    "suggestion_try": "Try it",
    "sort_by": "Sort by",
    "sort_alphabetical": "Alphabetical",
    "sort_most_played": "Most played",
    "sort_recently_played": "Recently played",
    "sort_installed_first": "Installed first",
    "friends_own_game": "Friends who own {{title}}",
    "friends_own_game_count": "{{count}} friend owns this game",
    "friends_own_game_count_plural": "{{count}} friends own this game",
    "no_friends_own_game": "None of your friends own this game yet.",
    "settings_show_playtime_badge": "Show playtime badge",
    "settings_show_playtime_badge_description": "Display playtime on game items in the sidebar",
    "settings_show_achievements_badge": "Show achievements badge",
    "settings_show_achievements_badge_description": "Display achievement progress on game items in the sidebar",
    "settings_show_friends_badge": "Show friends badge",
    "settings_show_friends_badge_description": "Display which friends own each game in the sidebar"
  }
}
```

---

## 9. Design Notes

### 9.1 Badge Row Styling

- Font size: `10px` (matching existing `sidebar__game-playtime`)
- Color: `rgba(255, 255, 255, 0.4)` (muted)
- Spacing between badges: `8px` gap
- Icons: `11px` size, vertically aligned with text
- Row has `margin-top: 2px` from the title

### 9.2 Completed Achievements

- When `unlockedAchievementCount >= achievementCount` and `achievementCount > 0`:
  - Trophy icon turns gold (#FFD700 or similar)
  - Text color becomes slightly brighter
  - Matches the pattern used in `library-game-card.tsx` completed state

### 9.3 Friends Badge States

- **No friends own**: Gray/muted, shows "0"
- **Friends own, none online**: White-transparent, shows count
- **Friends own, some online**: The online count portion gets a subtle green tint

### 9.4 Tooltip (Friends Badge)

- Uses existing `react-tooltip` library (already used in sidebar for other tooltips)
- Shows on hover with a small delay (300ms)
- Content: "Friends who own {title}", then up to 5 avatars with names
- If more than 5 friends: "+N more" at the bottom

### 9.5 Responsive / Narrow Sidebar

- When sidebar width < ~200px, the badges row may truncate or hide less important badges
- Priority: friends > achievements > playtime (playtime is least important since it's already in library cards)

---

## 10. Edge Cases

1. **No friends at all**: Friends badge shows "0", clicking does nothing (no modal), or modal shows "Add friends to see who owns this game"
2. **User not logged in**: Friends badge hidden entirely
3. **WebSocket disconnected**: Last cached friend online status is used; badge shows cached data with a slightly different opacity to indicate stale data
4. **Game with no icon**: Fallback to Steam logo or Play logo as currently
5. **Very long game titles**: Title truncates with ellipsis as currently; badges row stays on one line
6. **Library with 500+ games**: Friend ownership fetch should be batched and not block the UI; consider paginating friend profile fetches
7. **Friend unfriends while modal is open**: No action needed — modal can show stale data until closed
8. **All badges toggled off**: Bottom row collapses entirely; game item reverts to single-line title-only (current behavior)

---

## 11. Implementation Order (Suggested)

1. **Phase 1**: Add badges row to `SidebarGameItem` (playtime + achievements only, no data fetching needed)
2. **Phase 2**: Add user preference toggles for badges
3. **Phase 3**: Implement friend ownership data fetching and friends badge
4. **Phase 4**: Implement friends modal
5. **Phase 5**: Add "Play Next" suggestions section
6. **Phase 6**: Add sidebar sort dropdown
7. **Phase 7**: i18n for all locales (can be done incrementally)

---

## 12. Out of Scope

- Big Picture mode sidebar (explicitly excluded — "Desktop only")
- Achievement progress bar in sidebar (count only, not progress bar)
- Friend activity feed or real-time game session display in sidebar
- Any changes to the library page game cards (only sidebar)
- Drag-and-drop reordering of sidebar games
