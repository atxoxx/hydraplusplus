import { useTranslation } from "react-i18next";
import type { PlaytimeSummary } from "../../declaration";

export interface StatsOverviewCardsProps {
  summary: PlaytimeSummary | null;
  loading: boolean;
  totalSessions: number;
  longestStreak: number;
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

export function StatsOverviewCards({
  summary,
  loading,
  totalSessions,
  longestStreak,
}: StatsOverviewCardsProps) {
  const { t } = useTranslation("activity");

  if (loading) {
    return (
      <div className="stats-overview">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="stats-overview__card">
            <div className="stats-overview__card-label">&nbsp;</div>
            <div className="stats-overview__card-value">—</div>
          </div>
        ))}
      </div>
    );
  }

  const totalHours = summary?.totalHours ?? 0;
  const gamesPlayed = summary?.gamesPlayed ?? 0;
  const mostActiveDate = summary?.mostActiveDate ?? null;
  const mostActiveDateHours = summary?.mostActiveDateHours ?? 0;
  const avgPerDay = summary?.averageHoursPerDay ?? 0;

  return (
    <div className="stats-overview">
      <div className="stats-overview__card">
        <span className="stats-overview__card-label">{t("total_hours")}</span>
        <span className="stats-overview__card-value">
          {formatHours(totalHours)}
        </span>
      </div>

      <div className="stats-overview__card">
        <span className="stats-overview__card-label">{t("games_played")}</span>
        <span className="stats-overview__card-value">{gamesPlayed}</span>
      </div>

      <div className="stats-overview__card">
        <span className="stats-overview__card-label">
          {t("most_active_day")}
        </span>
        <span className="stats-overview__card-value">
          {formatHours(mostActiveDateHours)}
        </span>
        {mostActiveDate && (
          <span className="stats-overview__card-sub">
            {formatDate(mostActiveDate)}
          </span>
        )}
      </div>

      <div className="stats-overview__card">
        <span className="stats-overview__card-label">{t("avg_per_day")}</span>
        <span className="stats-overview__card-value">
          {formatHours(avgPerDay)}
        </span>
        <span className="stats-overview__card-sub">{t("avg_per_day")}</span>
      </div>

      <div className="stats-overview__card">
        <span className="stats-overview__card-label">
          {t("total_sessions")}
        </span>
        <span className="stats-overview__card-value">{totalSessions}</span>
      </div>

      <div className="stats-overview__card">
        <span className="stats-overview__card-label">
          {t("longest_streak")}
        </span>
        <span className="stats-overview__card-value">
          {longestStreak > 0 ? `${longestStreak}d` : "—"}
        </span>
      </div>
    </div>
  );
}
