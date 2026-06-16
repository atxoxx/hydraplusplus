# Game Activity Enhancement — Specification

## Overview

Revamp the game page activity section with richer data (session history, hardware monitoring), improved visual design, and reposition it above the reviews section in the Details tab. Draws inspiration from the Playnite GameActivity plugin (https://github.com/Lacro59/playnite-gameactivity-plugin).

## Motivation

- The current `GameActivityPanel` is bare-bones: a single 90-day bar chart + 3 stats (total playtime, session count, avg duration).
- Activity appears _below_ reviews, making it feel like an afterthought.
- No hardware metrics (FPS, CPU, GPU, RAM, temps) exist anywhere in Hydra.
- No per-session history exists; only daily aggregated playtime snapshots are stored.

---

## 1. Layout & Positioning

### 1.1 Reorder in Details Tab

- **Current order** in `DetailsTab`: `GameReviews` → `GameActivityPanel`
- **New order**: `GameActivityPanel` → `GameReviews`
- File: `src/renderer/src/pages/game-details/tabs/details-tab.tsx`

### 1.2 Visual Style: Prominent Section

- Transform activity from a compact dark card into a more spacious, dashboard-widget-style section.
- Use gradient accents, better typography, and richer spacing.
- Implement a split layout within the activity panel:
  - **Left/top**: Charts and aggregate stats
  - **Right/bottom**: Session history list + hardware summary
- Add smooth transitions and hover states for interactive elements.

---

## 2. Data Model Changes

### 2.1 New LevelDB Sublevel: `sessions`

Create `src/main/level/sublevels/sessions.ts` with a new sublevel storing individual game sessions:

```ts
export interface GameSession {
  id: string; // UUID
  shop: GameShop;
  objectId: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  durationMs: number;
  hardwareMetrics?: HardwareMetricsSnapshot;
}

export interface HardwareMetricsSnapshot {
  avgFps: number;
  minFps: number;
  maxFps: number;
  avgCpuUsage: number; // percentage 0-100
  maxCpuUsage: number;
  avgGpuUsage: number; // percentage 0-100
  maxGpuUsage: number;
  avgCpuTemp: number; // Celsius
  maxCpuTemp: number;
  avgGpuTemp: number; // Celsius
  maxGpuTemp: number;
  avgRamUsageMB: number;
  maxRamUsageMB: number;
  gpuPowerWatts?: number; // optional power draw
  cpuPowerWatts?: number; // optional power draw
  samples: HardwareSample[]; // raw time-series for sparklines
}

export interface HardwareSample {
  timestamp: number; // ms since epoch
  fps: number;
  cpuUsage: number;
  gpuUsage: number;
  cpuTemp: number;
  gpuTemp: number;
  ramUsageMB: number;
}
```

### 2.2 Key Format

- LevelDB key: `sessions:${shop}:${objectId}:${sessionId}`
- Allows iteration by `shop:objectId` prefix to fetch all sessions for a game.

### 2.3 Data Retention

- Keep all data indefinitely (user-managed).
- Add a "Clear activity data" button in settings to manually purge old data.
- Future: could add auto-prune setting, but out of scope for initial implementation.

---

## 3. Hardware Monitoring

### 3.1 Collection: Rust Native Addon

- Extend the existing Rust native addon in `src/native/` (currently `hydra-native`).
- Add platform-specific hardware metric collection:
  - **Windows**: Use Windows Performance Counters + WMI for CPU/GPU/RAM, NVAPI/ADL for GPU temps, HWiNFO shared memory as fallback.
  - **Linux**: Use `/proc`, `/sys/class/hwmon`, `nvidia-smi`, and/or `mangohud` integration.
  - **macOS**: Lower priority; use IOKit for basic metrics.
- Expose via NAPI to Node.js main process.

### 3.2 Activation: During Gameplay Only

- Hardware monitoring starts when `watchProcesses()` detects a game process.
- Monitoring stops when the game process exits.
- **Do not** enable always-on background monitoring.

### 3.3 Polling Rate: Configurable

- Default: every 5 seconds
- Configurable in user preferences (1s, 5s, 10s, 30s)
- Store preference key: `hardwarePollingIntervalMs` (default 5000)

### 3.4 Aggregation

- Raw samples collected at the configured interval.
- Session-end aggregation computes `HardwareMetricsSnapshot` (min/max/avg) from all samples.
- Full sample array stored for sparkline rendering in the renderer.

---

## 4. Session Tracking

### 4.1 Session Recording

- Modify `process-watcher.ts` to create a `GameSession` record when a game starts (`onOpenGame`).
- On each tick, accumulate hardware samples if monitoring is enabled.
- On game close (`onCloseGame`), finalize the session: compute hardware aggregates, write to `sessions` sublevel.
- Keep existing `DailyPlaytimeSnapshot` updates — they continue to work alongside sessions.

### 4.2 New IPC Events

- `getGameSessions(shop, objectId, limit?, offset?)` → `GameSession[]`
- `getGameHardwareSummary(shop, objectId)` → aggregated hardware stats across all sessions
- `clearGameActivityData(shop, objectId)` → delete all sessions + daily playtime for a game

---

## 5. Renderer: Activity Panel Redesign

### 5.1 Component Structure

The `GameActivityPanel` will be refactored from a single component into:

```
game-activity-panel.tsx          (container/orchestrator)
├── activity-timeframe-tabs.tsx   (7d / 30d / 90d / All Time selector)
├── activity-chart.tsx            (Nivo-based chart, replaces recharts BarChart)
├── activity-stats-grid.tsx       (Aggregate stat cards: total time, sessions, avg session, streaks)
├── activity-session-list.tsx     (Scrollable session history list)
│   └── activity-session-item.tsx (Individual session row with sparkline)
├── activity-hardware-card.tsx    (Hardware summary card: FPS, CPU, GPU, RAM, temps)
│   └── activity-sparkline.tsx    (Mini Nivo sparkline chart per metric)
└── activity-empty-state.tsx      (Empty/loading states)
```

### 5.2 Chart: Nivo

- **Remove** `recharts` dependency from this component (recharts is still used elsewhere, keep installed).
- **Add** `@nivo/bar` and `@nivo/line` packages.
- Implement:
  - **Bar chart** for daily playtime overview (selected timeframe)
  - **Line chart** option as a toggleable view
  - **Sparklines** using `@nivo/line` for per-session hardware trend mini-charts
- Dark theme integration: match existing Hydra color palette (`#16b195` brand teal, `rgba(255,255,255,0.03)` backgrounds, `#0d0d0d` tooltips).

### 5.3 Multi-Timeframe Tabs

- **7 Days**: Shows recent week, bar chart with day labels
- **30 Days**: Month view, slightly aggregated
- **90 Days**: Current behavior (3 months)
- **All Time**: Full history, may need aggregation for performance (e.g., weekly buckets if > 365 days)

### 5.4 Stats Grid

- Total playtime (formatted)
- Total sessions count
- Average session duration
- Longest session
- Current streak (consecutive days played)
- Best streak (longest consecutive days)

### 5.5 Session List (Scrollable)

Each session row shows:

- Date and day of week
- Start time → End time
- Duration
- Hardware summary sparklines (FPS, CPU, GPU mini line charts — last session only, or collapsed by default)
- Warning indicators (red dot) if thresholds exceeded during session
- Expand/collapse to show detailed hardware chart for that session

### 5.6 Hardware Summary Card

At the top of the activity panel (or integrated into the stats grid):

- **Colored indicators**: green (good), yellow (warning), red (critical) based on configurable thresholds.
- Shows latest session's averages for:
  - FPS (avg / min / max)
  - CPU usage % + temp
  - GPU usage % + temp
  - RAM usage
- Clicking expands to show trend sparklines for recent sessions.

---

## 6. Performance Alerts & Warnings

### 6.1 In-Session Toast Notifications

- **Minimal notification popup** only when a threshold is exceeded during gameplay.
- Uses Electron's native notification or a custom overlay (not intrusive).
- Thresholds are configurable in user preferences:
  - `alertFpsBelow`: FPS drops below this value (default: 30)
  - `alertCpuTempAbove`: CPU temp exceeds this (default: 90°C)
  - `alertGpuTempAbove`: GPU temp exceeds this (default: 85°C)
  - `alertCpuUsageAbove`: CPU usage sustained above this % (default: 95)
  - `alertRamUsageAbove`: RAM usage above this MB (default: system-dependent)
- Toast shows metric name, current value, and resolves after 5 seconds.

### 6.2 Post-Session Summary

- In the session list, sessions where thresholds were exceeded get a **red warning indicator**.
- Hovering/tapping shows which thresholds were breached.
- Aggregated: a "warning count" stat in the stats grid ("3 sessions with performance issues").

---

## 7. User Preferences & Settings

### 7.1 New Preference Keys

| Key                         | Type    | Default | Description                               |
| --------------------------- | ------- | ------- | ----------------------------------------- |
| `enableSessionTracking`     | boolean | true    | Record individual game sessions           |
| `enableHardwareMonitoring`  | boolean | false   | Collect FPS/CPU/GPU/RAM data              |
| `enablePerformanceAlerts`   | boolean | false   | Show in-session toast warnings            |
| `hardwarePollingIntervalMs` | number  | 5000    | Hardware sample interval (ms)             |
| `alertFpsBelow`             | number  | 30      | FPS threshold for alert                   |
| `alertCpuTempAbove`         | number  | 90      | CPU temp threshold (°C)                   |
| `alertGpuTempAbove`         | number  | 85      | GPU temp threshold (°C)                   |
| `alertCpuUsageAbove`        | number  | 95      | CPU usage threshold (%)                   |
| `alertRamUsageAboveMB`      | number  | 0       | RAM threshold (0 = auto/system-dependent) |

### 7.2 Settings UI

- Add settings section: **Game Activity** under Hydra settings.
- Toggle switches for enable/disable each feature.
- Slider/dropdown for polling interval.
- Number inputs with validation for threshold values.
- "Clear all activity data" button with confirmation dialog.

---

## 8. IPC & Main Process Changes

### 8.1 New Event Files

- `src/main/events/sessions/get-game-sessions.ts` — fetch sessions for a game
- `src/main/events/sessions/get-hardware-summary.ts` — aggregated hardware stats
- `src/main/events/sessions/clear-activity-data.ts` — delete activity data
- `src/main/events/hardware/get-hardware-config.ts` — get hardware monitoring config
- `src/main/events/hardware/update-hardware-config.ts` — update config

### 8.2 Process Watcher Modifications

- `onOpenGame`: Create session record + start hardware polling (if enabled)
- `onTickGame`: Collect hardware sample (if enabled) + accumulate to current session
- `onCloseGame`: Finalize session, compute aggregates, persist to LevelDB
- New module: `src/main/services/hardware-monitor.ts` — orchestrates native addon calls during gameplay

### 8.3 Preload Declarations

Add to `src/preload/index.ts` and `src/renderer/src/declaration.d.ts`:

- `getGameSessions(shop, objectId, limit?, offset?)`
- `getGameHardwareSummary(shop, objectId)`
- `clearGameActivityData(shop, objectId)`
- Hardware config get/set

---

## 9. i18n (Translations)

### 9.1 New Translation Keys (namespace: "activity")

| Key                      | Default (en)                                                    |
| ------------------------ | --------------------------------------------------------------- |
| `timeframe_7d`           | 7 Days                                                          |
| `timeframe_30d`          | 30 Days                                                         |
| `timeframe_90d`          | 90 Days                                                         |
| `timeframe_all`          | All Time                                                        |
| `longest_session`        | Longest Session                                                 |
| `current_streak`         | Current Streak                                                  |
| `best_streak`            | Best Streak                                                     |
| `streak_days`            | {{count}} days                                                  |
| `hardware_summary`       | Hardware Summary                                                |
| `avg_fps`                | Avg FPS                                                         |
| `cpu_usage`              | CPU Usage                                                       |
| `gpu_usage`              | GPU Usage                                                       |
| `cpu_temp`               | CPU Temp                                                        |
| `gpu_temp`               | GPU Temp                                                        |
| `ram_usage`              | RAM Usage                                                       |
| `session_history`        | Session History                                                 |
| `no_sessions_yet`        | No sessions recorded yet                                        |
| `performance_warnings`   | Performance Warnings                                            |
| `fps_alert`              | FPS dropped below {{threshold}}                                 |
| `cpu_temp_alert`         | CPU temperature above {{threshold}}°C                           |
| `gpu_temp_alert`         | GPU temperature above {{threshold}}°C                           |
| `clear_activity_data`    | Clear Activity Data                                             |
| `clear_activity_confirm` | Are you sure you want to clear all activity data for this game? |

### 9.2 New Translation Keys (namespace: "settings")

| Key                               | Default (en)                                                 |
| --------------------------------- | ------------------------------------------------------------ |
| `game_activity`                   | Game Activity                                                |
| `enable_session_tracking`         | Enable Session Tracking                                      |
| `enable_session_tracking_desc`    | Record individual game sessions with start time and duration |
| `enable_hardware_monitoring`      | Enable Hardware Monitoring                                   |
| `enable_hardware_monitoring_desc` | Collect FPS, CPU, GPU, and RAM metrics during gameplay       |
| `enable_performance_alerts`       | Enable Performance Alerts                                    |
| `enable_performance_alerts_desc`  | Show notifications when hardware thresholds are exceeded     |
| `polling_interval`                | Polling Interval                                             |
| `alert_thresholds`                | Alert Thresholds                                             |

---

## 10. Visual Design Guidelines

### 10.1 Color Palette

- **Primary chart**: `#16b195` (Hydra brand teal)
- **Secondary**: `#d4a853` (gold/warning)
- **Danger**: `#e74c3c` (red for alerts)
- **Background**: `rgba(255, 255, 255, 0.03)` with `1px solid rgba(255, 255, 255, 0.08)` border
- **Card border-radius**: 10px (matching existing)
- **Text**: `rgba(255, 255, 255, 0.9)` primary, `rgba(255, 255, 255, 0.6)` secondary

### 10.2 Hardware Indicator Colors

- **Green** (>60 FPS, <70°C, <70% usage): `#16b195`
- **Yellow** (30-60 FPS, 70-85°C, 70-90% usage): `#d4a853`
- **Red** (<30 FPS, >85°C, >90% usage): `#e74c3c`

### 10.3 Typography

- Section titles: 14px, 600 weight, uppercase, 0.5px letter-spacing
- Stat values: 18px, 700 weight
- Stat labels: 11px, 500 weight, uppercase
- Session list: 13px body, 12px secondary

---

## 11. Implementation Phases

### Phase 1: Data Layer (Backend)

1. Create `sessions` sublevel schema and LevelDB setup
2. Modify `process-watcher.ts` for session creation/completion
3. Implement IPC events for session queries
4. Update preload + declaration files

### Phase 2: Hardware Monitoring (Native + Backend)

1. Extend Rust native addon with platform-specific hardware metrics
2. Create `hardware-monitor.ts` service
3. Wire into process-watcher game lifecycle
4. Implement session-end aggregation
5. Add user preference keys for hardware config

### Phase 3: Activity Panel Redesign (Frontend)

1. Reorder activity above reviews in `details-tab.tsx`
2. Add `@nivo/bar` and `@nivo/line` packages
3. Build component tree: timeframe tabs, chart, stats grid, session list, hardware card
4. Style with SCSS matching design guidelines
5. Add empty/loading states
6. Replace recharts usage with Nivo in the activity panel

### Phase 4: Alerts & Settings

1. Implement in-session toast notifications
2. Add post-session warning indicators in session list
3. Create settings UI for game activity preferences
4. Wire threshold configuration to alert system

### Phase 5: Polish & i18n

1. Add all translation keys
2. Add hover states, transitions, micro-interactions
3. Performance optimization (virtualized session list if needed)
4. Testing

---

## 12. Files to Modify (Summary)

| File                                                           | Change                                     |
| -------------------------------------------------------------- | ------------------------------------------ |
| `src/main/level/sublevels/sessions.ts`                         | **New** — session sublevel + types         |
| `src/main/level/sublevels/keys.ts`                             | Add session key patterns                   |
| `src/main/level/index.ts`                                      | Export sessions sublevel                   |
| `src/main/services/hardware-monitor.ts`                        | **New** — hardware monitoring service      |
| `src/main/services/process-watcher.ts`                         | Session lifecycle + hardware integration   |
| `src/main/events/sessions/*.ts`                                | **New** — IPC event handlers               |
| `src/main/events/hardware/*.ts`                                | **New** — hardware config IPC handlers     |
| `src/main/events/index.ts`                                     | Register new event handlers                |
| `src/preload/index.ts`                                         | Add new IPC bridge methods                 |
| `src/renderer/src/declaration.d.ts`                            | Add type declarations                      |
| `src/renderer/src/pages/game-details/tabs/details-tab.tsx`     | Reorder activity above reviews             |
| `src/renderer/src/pages/game-details/game-activity-panel.tsx`  | Major refactor → container                 |
| `src/renderer/src/pages/game-details/game-activity-panel.scss` | Major redesign                             |
| `src/renderer/src/pages/game-details/activity-*.tsx`           | **New** — sub-components (6+ files)        |
| `src/renderer/src/pages/game-details/activity-*.scss`          | **New** — styles for sub-components        |
| `src/renderer/src/pages/settings/`                             | **New** — Game Activity settings section   |
| `src/locales/en/translation.json`                              | Add new translation keys                   |
| `src/native/` (Rust)                                           | Extend with hardware metrics collection    |
| `src/types/`                                                   | Add session + hardware metric types        |
| `package.json`                                                 | Add `@nivo/bar`, `@nivo/line` dependencies |

---

## 13. Open Questions / Future Considerations

- **macOS hardware monitoring**: Lower fidelity than Windows/Linux; IOKit provides limited GPU data. Consider skipping or providing reduced metrics.
- **MangoHud integration on Linux**: Could leverage existing MangoHud support for hardware metrics without building from scratch.
- **Session merging**: If a game crashes and reopens within X seconds, should sessions be merged? (Out of scope for now — treat each process start/stop as separate.)
- **Cloud sync for sessions**: Should session/hardware data sync via Hydra Cloud? (Out of scope for initial implementation.)
- **Benchmark mode**: User selected "only during gameplay" but a benchmark mode could be added later for intentional performance testing.
