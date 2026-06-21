# Performance Charts — Feature Specification

## Overview

Add working hardware performance graphs/charts (CPU, RAM, temps, GPU, FPS) to:
1. The **Activity page** (main app) — enhance the existing "Performance" tab
2. The **Game page** — add a toggleable "Performance" sub-view within the existing Activity tab

The feature should match the existing layout, styling conventions, and design language of the Hydra++ app (dark theme, `section-panel` cards, `globals.scss` variables, fixed semantic colors).

---

## 1. Game Page — Performance View in Activity Tab

### 1.1 Toggle Sub-View

The existing `GameActivityPanel` (in `game-activity-panel.tsx`) currently shows:
- Playtime stats grid (11 stat cards)
- Session list
- Playtime bar/line chart (`ActivityChart`)
- Weekly heatmap

Add two toggle buttons at the top of the Activity panel: **"Playtime"** | **"Performance"**

```
┌──────────────────────────────────────────────┐
│  Activity    [7d] [30d] [90d] [All]  [📷]   │
│  [ Playtime ] [ Performance ]                │
├──────────────────────────────────────────────┤
│  ... content depending on selected view ...   │
└──────────────────────────────────────────────┘
```

- Default view: "Playtime" (existing behavior)
- When "Performance" is selected: show performance charts + performance stat cards + keep session list
- The toggle buttons should use the same tab-button style as the existing `activity-session-item__chart-tab-btn` or `performance-insights__tab-btn`

### 1.2 Performance Stat Cards (New Row)

When Performance view is active, add a **new row** of performance stat cards **above** the existing playtime stats grid. These cards show aggregate metrics computed from all sessions' `hardwareMetrics` data.

Layout: A horizontal row of 6 sparkline+number cards, matching the existing `ActivitySparkline` component style.

| Card | Metric | Unit | Sparkline Data | Color / Thresholds |
|------|--------|------|----------------|---------------------|
| Avg FPS | Average FPS across all sessions | — | FPS samples from all sessions | warn: 60, danger: 30 (inverted) |
| CPU Usage | Average CPU % | % | cpuUsage samples | warn: 70, danger: 90 |
| GPU Usage | Average GPU % | % | gpuUsage samples | warn: 70, danger: 90 |
| CPU Temp | Average CPU temp | °C | cpuTemp samples | warn: 75, danger: 85 |
| GPU Temp | Average GPU temp | °C | gpuTemp samples | warn: 75, danger: 85 |
| RAM Usage | Average RAM | MB → GB | ramUsageMB samples | none |

Implementation: Reuse the existing `ActivitySparkline` component and `samplesToSparklineData` helper from `activity-sparkline.tsx`. The card row should use `activity-hardware-card` styling.

### 1.3 Combined Line Charts

Three separate line charts using `@nivo/line` (`ResponsiveLine`), vertically stacked. Each chart shows combined related metrics.

#### Chart 1: CPU + GPU Usage (%)
- **Metrics**: CPU Usage (blue `#3e62c0`), GPU Usage (purple `#9b59b6`)
- **Y-axis**: 0–100%
- **X-axis**: Session time (`mm:ss` format, elapsed from session start)
- **Data**: All sessions overlaid. Each session = one pair of lines (CPU + GPU)

#### Chart 2: CPU + GPU Temperature (°C)
- **Metrics**: CPU Temp (red `#e74c3c`), GPU Temp (orange `#f39c12`)
- **Y-axis**: Auto-scaled (typically 30–95°C)
- **X-axis**: Session time (`mm:ss` format)

#### Chart 3: RAM (MB) + FPS
- **Metrics**: RAM (green `#2ecc71`), FPS (teal `#16b195`)
- **Y-axis (left)**: RAM in MB
- **Y-axis (right)**: FPS value
- Dual-axis chart (RAM on left axis, FPS on right axis)

#### Chart Behavior
- **Downsampling**: Max 80 points per session (same as existing `activity-session-item.tsx`)
- **Session overlay**: All sessions displayed on the same chart. Each session gets a slightly different opacity/line style (first session = solid, others = semi-transparent)
- **Session isolation toggle**: Each chart section has a small dropdown or pill selector listing sessions by date. Default = "All Sessions". Selecting a specific session isolates that session's data.

### 1.4 Session List

The existing session list (`ActivitySessionList`) remains visible below the performance charts. When in Performance view, the expanded session items' existing hardware details and per-session line charts still work as before.

### 1.5 Empty State

If no sessions have hardware metrics (`hardwareMetrics` is null/undefined for all sessions), show an empty placeholder:

```
┌────────────────────────────────────────────┐
│  [Info icon]                               │
│  No performance data available yet.        │
│  Hardware monitoring is not enabled.       │
│  [Configure in Settings → Behavior]        │
└────────────────────────────────────────────┘
```

The settings link should open the settings page to the hardware monitoring configuration section.

### 1.6 Export

Add screenshot (PNG) and CSV export buttons for the Performance view (same as existing activity page toolbar buttons):

- **Screenshot**: Uses `html2canvas` to capture the performance section
- **CSV**: Exports aggregated performance data per session as CSV

---

## 2. Activity Page — Enhanced Performance Tab

### 2.1 Keep Existing Content

The existing `PerformanceInsights` component with:
- Bar chart comparisons (FPS, Temps, RAM) using `@nivo/bar`
- Detailed performance board table

**remains in place**. These stay at the top of the Performance tab.

### 2.2 Add Time-Series Charts Below

Below the existing content, add a new section with:

#### Section Header
```
┌────────────────────────────────────────────┐
│  📈 Session Performance Timeline           │
│  [All Games ▼]  [CPU+GPU ▼]               │
└────────────────────────────────────────────┘
```

- **Game selector**: Dropdown that filters sessions by game. Options: "All Games" + list of games with hardware data. Selecting a game filters all charts to only that game's sessions.
- **Chart type selector**: Options to toggle between the three chart views (CPU+GPU Usage, CPU+GPU Temps, RAM+FPS) — identical to the game page charts.

#### Charts

Same three combined line charts as described in §1.3, using the same `@nivo/line` components, colors, and styling. The only difference is the data source: here we aggregate sessions across **all games** (or a selected game).

#### Per-Session Raw Samples

Chart data uses per-session raw sample points (every 5s polling interval). Sessions are overlaid with different opacities, with the same session isolation toggle.

### 2.3 Performance Summary Cards

Add a row of sparkline summary cards (same as §1.2) at the top of the new section, showing global averages across all sessions. These update when the game selector changes to show per-game averages.

---

## 3. Visual & Styling Guidelines

### 3.1 Layout Components

Use existing class naming conventions:
- `section-panel` for card containers
- `section-panel__title` for section headers
- `section-panel__empty` for empty states

### 3.2 Color Scheme (Fixed Semantic Colors)

| Metric | Color | Hex |
|--------|-------|-----|
| FPS | Teal (brand primary) | `#16b195` |
| CPU Usage | Blue | `#3e62c0` |
| GPU Usage | Purple | `#9b59b6` |
| CPU Temp | Red | `#e74c3c` |
| GPU Temp | Orange | `#f39c12` |
| RAM Usage | Green | `#2ecc71` |

### 3.3 Chart Theme (Dark)

All charts use the existing dark theme from `activity-session-item.tsx`:
```typescript
theme={{
  background: "transparent",
  text: { fontSize: 10, fill: "rgba(255,255,255,0.4)", fontFamily: "inherit" },
  grid: { line: { stroke: "rgba(255,255,255,0.05)", strokeWidth: 1 } },
  tooltip: {
    container: {
      background: "#0d0d0d", color: "#fff", fontSize: 11,
      borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    },
  },
}}
```

### 3.4 Chart Dimensions

- Each combined line chart: height 220px, full width of container
- Sparkline cards: same dimensions as existing `ActivitySparkline` (~150px wide, ~80px tall)
- Gap between elements: `calc(globals.$spacing-unit * 3)` (24px)

### 3.5 Chart Config

From `@nivo/line` — `ResponsiveLine`:
- `lineWidth`: 2
- `enableArea`: true, `areaOpacity`: 0.06
- `enablePoints`: false
- `enableGridX`: false, `enableGridY`: true
- `gridYValues`: 4
- `useMesh`: true
- `animate`: true, `motionConfig`: "gentle"
- `xScale`: `{ type: "point" }`
- `yScale`: `{ type: "linear", min: "auto", max: "auto" }`

### 3.6 Toggle Sub-View Buttons

Style matches `performance-insights__tab-btn`:
```scss
&__tab-btn {
  background: none; border: none; color: rgba(255,255,255,0.45);
  font-size: 11px; font-weight: 600; padding: 6px 12px;
  border-radius: 6px; cursor: pointer; transition: all 0.15s;
  &--active {
    background: $brand-teal; color: #fff;
  }
}
```

---

## 4. Data Flow

### 4.1 Data Source

Hardware data is already stored in LevelDB with each game session:
```
GameSession {
  ...
  hardwareMetrics?: HardwareMetricsSnapshot {
    avgFps, minFps, maxFps,
    avgCpuUsage, maxCpuUsage,
    avgGpuUsage, maxGpuUsage,
    avgCpuTemp, maxCpuTemp, avgGpuTemp, maxGpuTemp,
    avgRamUsageMB, maxRamUsageMB,
    samples: HardwareSample[] // timestamp, fps, cpuUsage, gpuUsage, cpuTemp, gpuTemp, ramUsageMB
  }
}
```

### 4.2 IPC

Use existing IPC methods:
- `window.electron.getGameSessions(shop, objectId)` — for game page sessions
- `window.electron.getAllSessions()` — for activity page sessions

Both return `GameSession[]` / `SessionWithGame[]` which include `hardwareMetrics`.

### 4.3 Data Aggregation

For sparkline cards and global averages, aggregate all sessions' sample data in the component using `useMemo`:
- Flatten all sessions' `hardwareMetrics.samples` arrays
- Compute averages, mins, maxes
- For sparklines, downsample to fit the small display

---

## 5. Files to Create / Modify

### New Files
| File | Purpose |
|------|---------|
| `src/renderer/src/pages/game-details/game-performance-view.tsx` | Performance view component for game page Activity tab |
| `src/renderer/src/pages/game-details/game-performance-view.scss` | Styles for the above |
| `src/renderer/src/pages/activity/performance-timeline.tsx` | Time-series charts section for Activity page Performance tab |
| `src/renderer/src/pages/activity/performance-timeline.scss` | Styles for the above |
| `src/renderer/src/components/performance-charts/combined-line-chart.tsx` | Reusable combined line chart component (CPU+GPU, Temps, RAM+FPS) |
| `src/renderer/src/components/performance-charts/combined-line-chart.scss` | Styles for the above |
| `src/renderer/src/components/performance-charts/performance-stat-cards.tsx` | Row of sparkline stat cards |
| `src/renderer/src/components/performance-charts/performance-stat-cards.scss` | Styles for the above |

### Modified Files
| File | Change |
|------|--------|
| `src/renderer/src/pages/game-details/game-activity-panel.tsx` | Add toggle sub-view (Playtime/Performance), render `GamePerformanceView` when Performance selected |
| `src/renderer/src/pages/game-details/game-activity-panel.scss` | Style additions for toggle buttons |
| `src/renderer/src/pages/activity/performance-insights.tsx` | Add `PerformanceTimeline` section below existing bar charts and table |
| `src/renderer/src/pages/activity/performance-insights.scss` | Style additions |
| `src/locales/en/translation.json` | New i18n keys for performance labels |

---

## 6. i18n Keys Needed

```json
{
  "activity": {
    "performance_view": "Performance",
    "playtime_view": "Playtime",
    "session_timeline": "Session Performance Timeline",
    "all_games": "All Games",
    "all_sessions": "All Sessions",
    "cpu_gpu_usage": "CPU & GPU Usage",
    "cpu_gpu_temps": "CPU & GPU Temperatures",
    "ram_fps": "RAM & FPS",
    "no_performance_data": "No performance data available yet.",
    "hw_monitoring_disabled": "Hardware monitoring is not enabled.",
    "configure_in_settings": "Configure in Settings → Behavior",
    "export_performance_csv": "Export Performance CSV",
    "export_performance_png": "Export Performance Screenshot"
  }
}
```

---

## 7. Edge Cases & TODOs

- **No hardware data at all**: Show empty placeholder with settings link (not error)
- **Partial hardware data** (e.g., only CPU usage, no temps): Render only available metrics, hide missing ones
- **Single session**: Still shows overlay view (single session = single line)
- **Session isolation toggle**: Dropdown lists sessions by date+time. Selecting "All Sessions" shows overlay.
- **Very long sessions**: Downsampling to 80 points prevents performance issues
- **FPS = 0 samples**: Filter out zero-FPS samples (no FPS data collected). Show "N/A" for FPS card if all samples are 0.
- **Missing samples array**: Gracefully handle `samples: undefined` or empty arrays
- **Concurrent sessions** (rare): Treat each session independently in overlay

---

## 8. Non-Goals (Out of Scope)

- Live/real-time hardware monitoring overlay during gameplay
- Big Picture mode performance charts
- Performance alerts/notifications (already exists in hardware monitor config)
- GPU power/wattage metrics (already in types but not collected)
- Export to PDF
- Custom chart color configuration

---

## 9. Reference — Existing Components to Reuse

| Component | File | Usage |
|-----------|------|-------|
| `ActivitySparkline` | `activity-sparkline.tsx` | Performance stat cards |
| `samplesToSparklineData` | `activity-sparkline.tsx` | Convert samples to sparkline data |
| `ActivityHardwareCard` | `activity-hardware-card.tsx` | Hardware summary card pattern |
| `ActivitySessionList` | `activity-session-list.tsx` | Session list (already in game page) |
| `ResponsiveLine` (`@nivo/line`) | npm | Line charts |
| `ResponsiveBar` (`@nivo/bar`) | npm | Already used in PerformanceInsights |
| `html2canvas` | npm | Screenshot export |
| `framer-motion` | npm | AnimatePresence for toggles |
| `globals.scss` variables | `src/renderer/src/scss/globals.scss` | Colors, spacing, brand tokens |

---

## 10. Testing / Verification Checklist

- [ ] Game page Activity tab — toggle between Playtime and Performance views works
- [ ] Performance stat cards show correct sparklines and numeric values
- [ ] Three combined line charts render with correct metric pairings
- [ ] Session overlay shows multiple sessions as distinct lines
- [ ] Session isolation toggle filters to single session
- [ ] Empty state appears when no hardware data exists
- [ ] Colors match the fixed semantic scheme
- [ ] Chart theme matches dark mode
- [ ] Activity page Performance tab shows new time-series section below existing content
- [ ] Game selector dropdown filters charts on Activity page
- [ ] Screenshot export works in Performance view
- [ ] CSV export works in Performance view
- [ ] TypeScript compiles with no errors
- [ ] ESLint passes
- [ ] Existing playtime functionality is unchanged
