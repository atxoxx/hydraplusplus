import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUserDetails } from "@renderer/hooks";
import type { GameShop } from "@types";
import type {
  DailyPlaytimeEntry,
  PlaytimeSummary,
  FriendPlaytimeStats,
} from "../../declaration";
import { DateRangeFilter, type DateRange } from "./date-range-filter";
import { StatsOverviewCards } from "./stats-overview-cards";
import { TopPlayedGames } from "./top-played-games";
import { WeeklyHeatmap, type HeatmapDay } from "./weekly-heatmap";
import { MonthlyTrend } from "./monthly-trend";
import { RecentTimeline } from "./recent-timeline";
import { FriendsComparison } from "./friends-comparison";
import { PerGameDetails } from "./per-game-details";
import { PlatformBreakdown } from "./platform-breakdown";
import { GlobalSessionList } from "./global-session-list";
import "./activity.scss";

const DATE_RANGE_PRESETS: Record<
  DateRange,
  { label: string; getRange: () => { startDate: string; endDate: string } }
> = {
  "7d": {
    label: "last_7_days",
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { startDate: fmt(start), endDate: fmt(end) };
    },
  },
  "30d": {
    label: "last_30_days",
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { startDate: fmt(start), endDate: fmt(end) };
    },
  },
  "90d": {
    label: "last_90_days",
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 90);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { startDate: fmt(start), endDate: fmt(end) };
    },
  },
  all: {
    label: "all_time",
    getRange: () => {
      const end = new Date();
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { startDate: "2000-01-01", endDate: fmt(end) };
    },
  },
};

export default function Activity() {
  const { t } = useTranslation("activity");
  const { userDetails } = useUserDetails();

  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PlaytimeSummary | null>(null);
  const [dailyEntries, setDailyEntries] = useState<DailyPlaytimeEntry[]>([]);
  const [friendsStats, setFriendsStats] = useState<FriendPlaytimeStats[]>([]);
  const [selectedGame, setSelectedGame] = useState<{
    objectId: string;
    shop: string;
    title: string;
  } | null>(null);

  const { startDate, endDate } = useMemo(
    () => DATE_RANGE_PRESETS[dateRange].getRange(),
    [dateRange]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResult, friendsResult] = await Promise.all([
        window.electron.getPlaytimeSummary(startDate, endDate),
        userDetails ? window.electron.getFriendsStats() : Promise.resolve([]),
      ]);
      setSummary(summaryResult);
      setFriendsStats(friendsResult);
    } catch {
      setSummary(null);
      setFriendsStats([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, userDetails]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedGame) return;

    const fetchGameData = async () => {
      try {
        const entries = await window.electron.getDailyPlaytime(
          selectedGame.shop as GameShop,
          selectedGame.objectId,
          startDate,
          endDate
        );
        setDailyEntries(entries);
      } catch {
        setDailyEntries([]);
      }
    };

    fetchGameData();
  }, [selectedGame, startDate, endDate]);

  const heatmapDays: HeatmapDay[] = useMemo(() => {
    if (!summary) return [];

    const dayMap = new Map<string, number>();
    for (const entry of dailyEntries) {
      dayMap.set(
        entry.date,
        (dayMap.get(entry.date) ?? 0) + entry.totalMilliseconds
      );
    }

    const days: HeatmapDay[] = [];
    const end = new Date(endDate + "T00:00:00");
    const start = new Date(startDate + "T00:00:00");
    const cursor = new Date(start);

    while (cursor <= end) {
      const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      days.push({
        date: dateStr,
        hours: (dayMap.get(dateStr) ?? 0) / 3_600_000,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return days;
  }, [dailyEntries, startDate, endDate]);

  const handleGameSelect = (objectId: string, shop: string, title: string) => {
    setSelectedGame((prev) =>
      prev?.objectId === objectId ? null : { objectId, shop, title }
    );
  };

  const totalSessions = useMemo(() => {
    // TODO: Requires new backend aggregation across all games' session data.
    // Currently not available in the PlaytimeSummary response.
    if (!summary) return 0;
    return 0;
  }, [summary]);

  const longestStreak = useMemo(() => {
    // TODO: Requires all-games daily playtime entries to compute consecutive days.
    // Currently not available without per-game daily playtime fetch for every game.
    if (!summary) return 0;
    return 0;
  }, [summary]);

  return (
    <section className="activity__container">
      <div className="activity__content">
        <header className="activity__header">
          <h2 className="activity__title">{t("activity")}</h2>
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
        </header>

        <StatsOverviewCards
          summary={summary}
          loading={loading}
          totalSessions={totalSessions}
          longestStreak={longestStreak}
        />

        <div className="activity__two-column">
          <TopPlayedGames
            games={summary?.topGames ?? []}
            loading={loading}
            onGameSelect={handleGameSelect}
            selectedGameId={selectedGame?.objectId ?? null}
          />
          <PlatformBreakdown
            topGames={summary?.topGames ?? []}
            loading={loading}
          />
        </div>

        <WeeklyHeatmap days={heatmapDays} loading={loading} />

        <MonthlyTrend
          dailyEntries={dailyEntries}
          startDate={startDate}
          endDate={endDate}
          loading={loading}
        />

        <RecentTimeline topGames={summary?.topGames ?? []} loading={loading} />

        <GlobalSessionList
          topGames={summary?.topGames ?? []}
          loading={loading}
        />

        <div className="activity__two-column">
          <FriendsComparison
            friendsStats={friendsStats}
            isSignedIn={!!userDetails}
            loading={loading}
          />

          {selectedGame && (
            <PerGameDetails
              game={selectedGame}
              dailyEntries={dailyEntries}
              onClose={() => setSelectedGame(null)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
