import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TrophyIcon, LockIcon } from "@primer/octicons-react";
import { gameDetailsContext } from "@renderer/context";
import type { UserAchievement } from "@types";
import "./achievements-overview.scss";

export function AchievementsOverview() {
  const { t } = useTranslation("game_details");
  const { achievements } = useContext(gameDetailsContext);

  const stats = useMemo(() => {
    if (!achievements || achievements.length === 0) return null;

    const total = achievements.length;
    const unlocked = achievements.filter((a) => a.unlocked);
    const unlockedCount = unlocked.length;
    const percentage =
      total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

    // "Rarest" unlocked = highest points, or fallback to just unlocked
    const sortedUnlocked = [...unlocked].sort(
      (a, b) => (b.points ?? 0) - (a.points ?? 0)
    );
    const rarestUnlocked = sortedUnlocked.slice(0, 3);
    const pointsTotal = achievements.reduce(
      (acc, a) => acc + (a.points ?? 0),
      0
    );
    const pointsEarned = unlocked.reduce((acc, a) => acc + (a.points ?? 0), 0);

    // Locked achievements (preview up to 3)
    const locked = achievements.filter((a) => !a.unlocked);
    const lockedPreview = locked.slice(0, 3);

    return {
      total,
      unlockedCount,
      percentage,
      pointsTotal,
      pointsEarned,
      rarestUnlocked,
      lockedPreview,
    };
  }, [achievements]);

  if (!achievements || achievements.length === 0) return null;

  return (
    <div className="dashboard-card achievements-overview">
      <div className="dashboard-card__header">
        <span className="dashboard-card__header-icon">
          <TrophyIcon size={16} />
        </span>
        <h3 className="dashboard-card__header-title">
          {t("achievements", "Achievements")}
        </h3>
        {stats && (
          <span className="achievements-overview__count">
            {stats.unlockedCount}/{stats.total}
          </span>
        )}
      </div>

      <div className="dashboard-card__body">
        {stats && (
          <>
            {/* Progress bar */}
            <div className="achievements-overview__progress-section">
              <div className="achievements-overview__progress-header">
                <span className="achievements-overview__progress-label">
                  {t("completion", "Completion")}
                </span>
                <span className="achievements-overview__progress-pct">
                  {stats.percentage}%
                </span>
              </div>
              <div className="achievements-overview__progress-track">
                <div
                  className={`achievements-overview__progress-fill ${
                    stats.percentage === 100
                      ? "achievements-overview__progress-fill--complete"
                      : ""
                  }`}
                  style={{ width: `${stats.percentage}%` }}
                />
              </div>
              {stats.pointsTotal > 0 && (
                <span className="achievements-overview__points">
                  {stats.pointsEarned} / {stats.pointsTotal} pts
                </span>
              )}
            </div>

            {/* Rarest unlocked badges */}
            {stats.rarestUnlocked.length > 0 && (
              <div className="achievements-overview__section">
                <span className="achievements-overview__section-label">
                  {t("recent_unlocks", "Recent Unlocks")}
                </span>
                <div className="achievements-overview__badge-row">
                  {stats.rarestUnlocked.map((ach) => (
                    <AchievementBadge key={ach.name} achievement={ach} />
                  ))}
                </div>
              </div>
            )}

            {/* Locked preview */}
            {stats.lockedPreview.length > 0 && (
              <div className="achievements-overview__section">
                <span className="achievements-overview__section-label">
                  {t("locked_achievements", "Locked")}
                </span>
                <div className="achievements-overview__badge-row">
                  {stats.lockedPreview.map((ach) => (
                    <div
                      key={ach.name}
                      className="achievements-overview__locked-badge"
                      title={ach.displayName}
                    >
                      <div className="achievements-overview__locked-icon-wrap">
                        <img
                          src={ach.icongray}
                          alt=""
                          className="achievements-overview__locked-icon"
                        />
                        <div className="achievements-overview__locked-overlay">
                          <LockIcon size={14} />
                        </div>
                      </div>
                      <span className="achievements-overview__locked-name">
                        {ach.displayName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AchievementBadge({
  achievement,
}: Readonly<{ achievement: UserAchievement }>) {
  return (
    <div
      className="achievements-overview__badge"
      title={`${achievement.displayName}${achievement.points ? ` - ${achievement.points} pts` : ""}`}
    >
      <img
        src={achievement.icon}
        alt={achievement.displayName}
        className="achievements-overview__badge-icon"
      />
      <div className="achievements-overview__badge-info">
        <span className="achievements-overview__badge-name">
          {achievement.displayName}
        </span>
        {achievement.points != null && (
          <span className="achievements-overview__badge-points">
            +{achievement.points}
          </span>
        )}
      </div>
    </div>
  );
}
