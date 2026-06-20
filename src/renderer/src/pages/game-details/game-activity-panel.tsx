import { useCallback, useEffect, useMemo, useState, useContext, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GraphIcon } from "@primer/octicons-react";
import type { GameShop } from "@types";
import { gameDetailsContext } from "@renderer/context";
import type { DailyPlaytimeEntry, GameSession } from "../../declaration";
import { ActivityChart } from "./activity-chart";
import { ActivityHardwareCard } from "./activity-hardware-card";
import { ActivitySessionList } from "./activity-session-list";
import { ActivityStatsGrid, computeStreaks } from "./activity-stats-grid";
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

export function GameActivityPanel({ shop, objectId }: GameActivityPanelProps) {
  const { t } = useTranslation("activity");
  const { isGameRunning } = useContext(gameDetailsContext);
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [dailyEntries, setDailyEntries] = useState<DailyPlaytimeEntry[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const isInitialMount = useRef(true);

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
      await Promise.all([fetchDailyPlaytime(), fetchSessions()]);
      if (!cancelled) setLoading(false);
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [fetchDailyPlaytime, fetchSessions]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!isGameRunning) {
      fetchDailyPlaytime();
      fetchSessions();
    }
  }, [isGameRunning, fetchDailyPlaytime, fetchSessions]);

  const chartData = useMemo(() => {
    return dailyEntries
      .map((entry) => ({
        date: entry.date.slice(5),
        hours: entry.totalMilliseconds / 3_600_000,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyEntries]);

  const totalMs = useMemo(
    () => dailyEntries.reduce((sum, e) => sum + e.totalMilliseconds, 0),
    [dailyEntries]
  );

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

  const latestHardwareMetrics = useMemo(
    () => sessions.find((s) => s.hardwareMetrics)?.hardwareMetrics ?? null,
    [sessions]
  );

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

  return (
    <div className="game-activity-panel">
      <div className="game-activity-panel__header">
        <h3 className="game-activity-panel__title">
          <GraphIcon size={14} />
          {t("activity")}
        </h3>
        <ActivityTimeframeTabs active={timeframe} onChange={setTimeframe} />
      </div>

      <div className="game-activity-panel__two-column">
        <div className="game-activity-panel__chart-section">
          <ActivityChart data={chartData} />
        </div>

        <div className="game-activity-panel__hardware-section">
          <ActivityHardwareCard metrics={latestHardwareMetrics} />
        </div>
      </div>

      <ActivityStatsGrid
        totalPlaytimeMs={totalMs}
        sessionCount={sessionCount}
        avgSessionMs={avgSessionMs}
        longestSessionMs={longestSessionMs}
        currentStreak={streaks.currentStreak}
        bestStreak={streaks.bestStreak}
        sessions={sessions}
        trend={trend}
        mostActiveDay={mostActiveDay}
        dayCount={dailyEntries.filter((e) => e.totalMilliseconds > 0).length}
      />

      <div className="game-activity-panel__sessions">
        <ActivitySessionList sessions={sessions} loading={sessionsLoading} />
      </div>
    </div>
  );
}
