import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useContext,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { GraphIcon } from "@primer/octicons-react";
import {
  Calendar,
  Clock,
  Trophy,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  Camera,
  Cpu,
} from "lucide-react";
import type { GameShop } from "@types";
import { gameDetailsContext } from "@renderer/context";
import type { DailyPlaytimeEntry, GameSession } from "../../declaration";
import { ActivityChart } from "./activity-chart";
import { ActivitySessionList } from "./activity-session-list";
import { WeeklyHeatmap } from "../activity/weekly-heatmap";
import { GamePerformanceView } from "./game-performance-view";
import {
  ActivityTimeframeTabs,
  type Timeframe,
  getTimeframeDays,
} from "./activity-timeframe-tabs";
import "./game-activity-panel.scss";

function computeTrend(dailyEntries: DailyPlaytimeEntry[]): {
  direction: "up" | "down" | "flat";
  percent: number;
} {
  if (dailyEntries.length < 4) return { direction: "flat", percent: 0 };

  const sorted = [...dailyEntries].sort((a, b) => a.date.localeCompare(b.date));
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const firstAvg =
    firstHalf.reduce((s, e) => s + e.totalMilliseconds, 0) / firstHalf.length;
  const secondAvg =
    secondHalf.reduce((s, e) => s + e.totalMilliseconds, 0) / secondHalf.length;

  if (firstAvg === 0 && secondAvg === 0)
    return { direction: "flat", percent: 0 };
  if (firstAvg === 0) return { direction: "up", percent: 100 };

  const change = ((secondAvg - firstAvg) / firstAvg) * 100;
  if (change > 10) return { direction: "up", percent: Math.round(change) };
  if (change < -10)
    return { direction: "down", percent: Math.round(Math.abs(change)) };
  return { direction: "flat", percent: Math.round(Math.abs(change)) };
}

function getMostActiveDay(dailyEntries: DailyPlaytimeEntry[]): string | null {
  if (dailyEntries.length === 0) return null;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayTotals = new Map<number, number>();

  for (const entry of dailyEntries) {
    const day = new Date(entry.date).getDay();
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + entry.totalMilliseconds);
  }

  let maxDay = 0;
  let maxMs = 0;
  for (const [day, ms] of dayTotals) {
    if (ms > maxMs) {
      maxMs = ms;
      maxDay = day;
    }
  }

  return dayNames[maxDay];
}

function formatPlaytime(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export interface GameActivityPanelProps {
  shop: GameShop;
  objectId: string;
}

function getDateRange(days: number) {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const end = new Date();
  if (days <= 0) {
    return { startDate: "2000-01-01", endDate: fmt(end) };
  }
  const start = new Date();
  start.setDate(start.getDate() - days);

  return { startDate: fmt(start), endDate: fmt(end) };
}

function computeStreaks(sessions: GameSession[]): {
  currentStreak: number;
  bestStreak: number;
} {
  if (sessions.length === 0) return { currentStreak: 0, bestStreak: 0 };

  const uniqueDays = new Set<string>();
  for (const s of sessions) {
    uniqueDays.add(s.startTime.slice(0, 10));
  }

  const sortedDays = Array.from(uniqueDays).sort().reverse();
  if (sortedDays.length === 0) return { currentStreak: 0, bestStreak: 0 };

  let currentStreak = 0;
  const today = new Date().toISOString().slice(0, 10);
  let checkDate = today;

  for (let i = 0; i < sortedDays.length + 1; i++) {
    if (sortedDays.includes(checkDate)) {
      currentStreak++;
      const d = new Date(checkDate);
      d.setDate(d.getDate() - 1);
      checkDate = d.toISOString().slice(0, 10);
    } else {
      break;
    }
  }

  let bestStreak = 0;
  let run = 1;

  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);

    if (Math.abs(diffDays - 1) < 0.01) {
      run++;
    } else {
      bestStreak = Math.max(bestStreak, run);
      run = 1;
    }
  }
  bestStreak = Math.max(bestStreak, run);

  return { currentStreak, bestStreak };
}

export function GameActivityPanel({ shop, objectId }: GameActivityPanelProps) {
  const { t } = useTranslation("activity");
  const { isGameRunning, game, updateGame } = useContext(gameDetailsContext);
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [dailyEntries, setDailyEntries] = useState<DailyPlaytimeEntry[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"playtime" | "performance">("playtime");
  const panelRef = useRef<HTMLDivElement>(null);

  const prevIsGameRunning = useRef(isGameRunning);
  const isFirstTimeframeRender = useRef(true);

  const fetchDailyPlaytime = useCallback(async () => {
    const days = getTimeframeDays(timeframe);
    const { startDate, endDate } = getDateRange(days);

    try {
      const entries = await window.electron.getDailyPlaytime(
        shop,
        objectId,
        startDate,
        endDate
      );
      setDailyEntries(entries);
    } catch {
      setDailyEntries([]);
    }
  }, [shop, objectId, timeframe]);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const result = await window.electron.getGameSessions(
        shop,
        objectId,
        50,
        0
      );
      setSessions(result);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [shop, objectId]);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      const days = getTimeframeDays("30d");
      const { startDate, endDate } = getDateRange(days);

      try {
        const [entries, result] = await Promise.all([
          window.electron.getDailyPlaytime(shop, objectId, startDate, endDate),
          window.electron.getGameSessions(shop, objectId, 50, 0),
        ]);
        if (!cancelled) {
          setDailyEntries(entries);
          setSessions(result);
        }
      } catch {
        if (!cancelled) {
          setDailyEntries([]);
          setSessions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSessionsLoading(false);
        }
      }
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [shop, objectId]);

  useEffect(() => {
    if (isFirstTimeframeRender.current) {
      isFirstTimeframeRender.current = false;
      return;
    }
    fetchDailyPlaytime();
  }, [timeframe, fetchDailyPlaytime]);

  useEffect(() => {
    if (prevIsGameRunning.current && !isGameRunning) {
      fetchDailyPlaytime();
      fetchSessions();
    }
    prevIsGameRunning.current = isGameRunning;
  }, [isGameRunning, fetchDailyPlaytime, fetchSessions]);

  const chartData = useMemo(() => {
    return dailyEntries
      .map((entry) => ({
        date: entry.date,
        hours: entry.totalMilliseconds / 3_600_000,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyEntries]);

  const sessionCount = useMemo(() => sessions.length, [sessions]);

  const avgSessionMs = useMemo(
    () =>
      sessionCount > 0
        ? sessions.reduce((sum, s) => sum + s.durationMs, 0) / sessionCount
        : 0,
    [sessions, sessionCount]
  );

  const longestSessionMs = useMemo(
    () => sessions.reduce((max, s) => Math.max(max, s.durationMs), 0),
    [sessions]
  );

  const streaks = useMemo(() => computeStreaks(sessions), [sessions]);

  const trend = useMemo(() => computeTrend(dailyEntries), [dailyEntries]);

  const mostActiveDay = useMemo(
    () => getMostActiveDay(dailyEntries),
    [dailyEntries]
  );

  const dayCount = useMemo(
    () => dailyEntries.filter((e) => e.totalMilliseconds > 0).length,
    [dailyEntries]
  );

  const firstPlayed = useMemo(() => {
    if (sessions.length === 0) return null;
    const sorted = [...sessions].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
    return sorted[0]?.startTime ?? null;
  }, [sessions]);

  const lastPlayed = useMemo(() => {
    if (sessions.length === 0) return null;
    const sorted = [...sessions].sort((a, b) =>
      b.startTime.localeCompare(a.startTime)
    );
    return sorted[0]?.startTime ?? null;
  }, [sessions]);

  const heatmapDays = useMemo(() => {
    const dayMap = new Map<string, number>();
    for (const entry of dailyEntries) {
      dayMap.set(
        entry.date,
        (dayMap.get(entry.date) ?? 0) + entry.totalMilliseconds
      );
    }

    const daysList: { date: string; hours: number }[] = [];
    const days = getTimeframeDays(timeframe);
    const { startDate, endDate } = getDateRange(days);

    const end = new Date(endDate + "T00:00:00");
    const start = new Date(startDate + "T00:00:00");
    const cursor = new Date(start);

    while (cursor <= end) {
      const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      daysList.push({
        date: dateStr,
        hours: (dayMap.get(dateStr) ?? 0) / 3_600_000,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return daysList;
  }, [dailyEntries, timeframe]);

  const handleScreenshot = useCallback(async () => {
    if (!panelRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(panelRef.current, {
        backgroundColor: "#121212",
        scale: 2,
        useCORS: true,
      });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `activity-${game?.title ?? objectId}-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch (err) {
      console.error("Screenshot failed:", err);
    }
  }, [game?.title, objectId]);

  const handleRefresh = useCallback(() => {
    fetchDailyPlaytime();
    fetchSessions();
    updateGame();
  }, [fetchDailyPlaytime, fetchSessions, updateGame]);

  const TrendIcon =
    trend.direction === "up"
      ? TrendingUp
      : trend.direction === "down"
        ? TrendingDown
        : Minus;
  const trendColor =
    trend.direction === "up"
      ? "var(--color-primary, #16b195)"
      : trend.direction === "down"
        ? "#e74c3c"
        : "rgba(255,255,255,0.4)";

  if (loading) {
    return (
      <div className="game-activity-panel">
        <div className="game-activity-panel__header">
          <h3 className="game-activity-panel__title">
            <GraphIcon size={14} />
            {t("activity")}
          </h3>
        </div>
        <div className="game-activity-panel__loading">{t("loading")}</div>
      </div>
    );
  }

  if (chartData.length === 0 && sessions.length === 0) {
    return (
      <div className="game-activity-panel">
        <div className="game-activity-panel__header">
          <h3 className="game-activity-panel__title">
            <GraphIcon size={14} />
            {t("activity")}
          </h3>
        </div>
        <div className="game-activity-panel__empty">{t("no_activity_yet")}</div>
      </div>
    );
  }

  const statsItems = [
    {
      icon: <Clock size={14} />,
      label: t("total_playtime"),
      value: formatPlaytime(game?.playTimeInMilliseconds ?? 0),
    },
    {
      icon: <BarChart2 size={14} />,
      label: t("session_count"),
      value: String(sessionCount),
    },
    {
      icon: <Clock size={14} />,
      label: t("avg_session_duration"),
      value: formatPlaytime(avgSessionMs),
    },
    {
      icon: <Trophy size={14} />,
      label: t("longest_session"),
      value: formatPlaytime(longestSessionMs),
    },
    {
      icon: <Zap size={14} />,
      label: t("current_streak"),
      value:
        streaks.currentStreak > 0
          ? t("streak_days", { count: streaks.currentStreak })
          : "—",
    },
    {
      icon: <Zap size={14} />,
      label: t("best_streak"),
      value:
        streaks.bestStreak > 0
          ? t("streak_days", { count: streaks.bestStreak })
          : "—",
    },
    {
      icon: <TrendIcon size={14} />,
      label: t("play_trend"),
      value: trend.direction === "flat" ? "—" : `${trend.percent}%`,
      color: trendColor,
    },
    {
      icon: <Calendar size={14} />,
      label: t("most_active_day"),
      value: mostActiveDay ?? "—",
    },
    {
      icon: <Calendar size={14} />,
      label: t("active_days"),
      value: String(dayCount),
    },
    {
      icon: <Calendar size={14} />,
      label: t("first_played") || "First Played",
      value: firstPlayed ? formatDate(firstPlayed) : "—",
    },
    {
      icon: <Calendar size={14} />,
      label: t("last_played") || "Last Played",
      value: lastPlayed ? formatDate(lastPlayed) : "—",
    },
  ];

  return (
    <div className="game-activity-panel" ref={panelRef}>
      {/* ── Header ── */}
      <div className="game-activity-panel__header">
        <h3 className="game-activity-panel__title">
          <GraphIcon size={14} />
          {t("activity")}
        </h3>
        <div className="game-activity-panel__header-actions">
          {/* View toggle: Playtime / Performance */}
          <div className="game-activity-panel__view-tabs">
            <button
              type="button"
              className={`game-activity-panel__view-tab-btn ${viewMode === "playtime" ? "game-activity-panel__view-tab-btn--active" : ""}`}
              onClick={() => setViewMode("playtime")}
            >
              <BarChart2 size={12} />
              {t("playtime_view") || "Playtime"}
            </button>
            <button
              type="button"
              className={`game-activity-panel__view-tab-btn ${viewMode === "performance" ? "game-activity-panel__view-tab-btn--active" : ""}`}
              onClick={() => setViewMode("performance")}
            >
              <Cpu size={12} />
              {t("performance_view") || "Performance"}
            </button>
          </div>
          {viewMode === "playtime" && (
            <ActivityTimeframeTabs active={timeframe} onChange={setTimeframe} />
          )}
          <button
            type="button"
            className="game-activity-panel__icon-btn"
            onClick={handleScreenshot}
            title={t("export_screenshot") || "Save as Screenshot"}
          >
            <Camera size={14} />
          </button>
        </div>
      </div>

      {/* ── Two-column body ── */}
      {viewMode === "playtime" ? (
        <div className="game-activity-panel__body">
          {/* LEFT COLUMN: Stats + Sessions */}
          <div className="game-activity-panel__left">
            {/* Stats Grid */}
            <div className="game-activity-panel__stats-grid">
              {statsItems.map((item) => (
                <div className="game-activity-panel__stat-card" key={item.label}>
                  <span className="game-activity-panel__stat-icon">
                    {item.icon}
                  </span>
                  <div className="game-activity-panel__stat-content">
                    <span className="game-activity-panel__stat-label">
                      {item.label}
                    </span>
                    <span
                      className="game-activity-panel__stat-value"
                      style={item.color ? { color: item.color } : undefined}
                    >
                      {item.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Session List */}
            <div className="game-activity-panel__sessions-section">
              <ActivitySessionList
                sessions={sessions}
                loading={sessionsLoading}
                onDelete={handleRefresh}
              />
            </div>
          </div>

          {/* RIGHT COLUMN: Charts */}
          <div className="game-activity-panel__right">
            {/* Playtime Chart Card */}
            <div className="game-activity-panel__chart-card">
              <ActivityChart data={chartData} />
            </div>

            {/* Heatmap Card */}
            <div className="game-activity-panel__heatmap-card">
              <WeeklyHeatmap days={heatmapDays} loading={loading} />
            </div>
          </div>
        </div>
      ) : (
        /* Performance view: full-width layout */
        <div className="game-activity-panel__body game-activity-panel__body--performance">
          <div className="game-activity-panel__left">
            {/* Playtime Stats Grid */}
            <div className="game-activity-panel__stats-grid">
              {statsItems.map((item) => (
                <div className="game-activity-panel__stat-card" key={item.label}>
                  <span className="game-activity-panel__stat-icon">
                    {item.icon}
                  </span>
                  <div className="game-activity-panel__stat-content">
                    <span className="game-activity-panel__stat-label">
                      {item.label}
                    </span>
                    <span
                      className="game-activity-panel__stat-value"
                      style={item.color ? { color: item.color } : undefined}
                    >
                      {item.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Session List */}
            <div className="game-activity-panel__sessions-section">
              <ActivitySessionList
                sessions={sessions}
                loading={sessionsLoading}
                onDelete={handleRefresh}
              />
            </div>
          </div>

          {/* RIGHT COLUMN: Performance Charts */}
          <div className="game-activity-panel__right">
            <GamePerformanceView sessions={sessions} />
          </div>
        </div>
      )}
    </div>
  );
}
