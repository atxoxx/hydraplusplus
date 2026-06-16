import { useTranslation } from "react-i18next";
import { ArrowDownIcon, ArrowUpIcon } from "@primer/octicons-react";
import type { GameSession } from "../../declaration";
import "./activity-stats-grid.scss";

export interface ActivityStatsGridProps {
  totalPlaytimeMs: number;
  sessionCount: number;
  avgSessionMs: number;
  longestSessionMs: number;
  currentStreak: number;
  bestStreak: number;
  sessions: GameSession[];
  trend: { direction: "up" | "down" | "flat"; percent: number };
  mostActiveDay: string | null;
  dayCount: number;
}

function formatPlaytime(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function ActivityStatsGrid({
  totalPlaytimeMs,
  sessionCount,
  avgSessionMs,
  longestSessionMs,
  currentStreak,
  bestStreak,
  trend,
  mostActiveDay,
  dayCount,
}: Readonly<ActivityStatsGridProps>) {
  const { t } = useTranslation("activity");

  const TrendIcon = trend.direction === "up" ? ArrowUpIcon : ArrowDownIcon;
  const trendColor =
    trend.direction === "up"
      ? "#16b195"
      : trend.direction === "down"
        ? "#e74c3c"
        : "rgba(255,255,255,0.4)";

  return (
    <div className="activity-stats-grid">
      <div className="activity-stats-grid__stat">
        <span className="activity-stats-grid__stat-label">
          {t("total_playtime")}
        </span>
        <span className="activity-stats-grid__stat-value">
          {formatPlaytime(totalPlaytimeMs)}
        </span>
      </div>

      <div className="activity-stats-grid__stat">
        <span className="activity-stats-grid__stat-label">
          {t("session_count")}
        </span>
        <span className="activity-stats-grid__stat-value">{sessionCount}</span>
      </div>

      <div className="activity-stats-grid__stat">
        <span className="activity-stats-grid__stat-label">
          {t("avg_session_duration")}
        </span>
        <span className="activity-stats-grid__stat-value">
          {formatPlaytime(avgSessionMs)}
        </span>
      </div>

      <div className="activity-stats-grid__stat">
        <span className="activity-stats-grid__stat-label">
          {t("longest_session")}
        </span>
        <span className="activity-stats-grid__stat-value">
          {formatPlaytime(longestSessionMs)}
        </span>
      </div>

      <div className="activity-stats-grid__stat">
        <span className="activity-stats-grid__stat-label">
          {t("current_streak")}
        </span>
        <span className="activity-stats-grid__stat-value">
          {currentStreak > 0 ? t("streak_days", { count: currentStreak }) : "—"}
        </span>
      </div>

      <div className="activity-stats-grid__stat">
        <span className="activity-stats-grid__stat-label">
          {t("best_streak")}
        </span>
        <span className="activity-stats-grid__stat-value">
          {bestStreak > 0 ? t("streak_days", { count: bestStreak }) : "—"}
        </span>
      </div>

      <div className="activity-stats-grid__stat">
        <span className="activity-stats-grid__stat-label">
          {t("play_trend")}
        </span>
        <span
          className="activity-stats-grid__stat-value"
          style={{ color: trendColor }}
        >
          {trend.direction !== "flat" && (
            <span className="activity-stats-grid__trend-icon">
              <TrendIcon size={14} />
            </span>
          )}
          {trend.direction === "flat" ? "—" : `${trend.percent}%`}
        </span>
      </div>

      <div className="activity-stats-grid__stat">
        <span className="activity-stats-grid__stat-label">
          {t("most_active_day")}
        </span>
        <span className="activity-stats-grid__stat-value">
          {mostActiveDay ?? "—"}
        </span>
      </div>

      <div className="activity-stats-grid__stat">
        <span className="activity-stats-grid__stat-label">
          {t("active_days")}
        </span>
        <span className="activity-stats-grid__stat-value">{dayCount}</span>
      </div>
    </div>
  );
}

export function computeStreaks(sessions: GameSession[]): {
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

  // Current streak: count consecutive days backward from today
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

  // Best streak: longest consecutive run
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
