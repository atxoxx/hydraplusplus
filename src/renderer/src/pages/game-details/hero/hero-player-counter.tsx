import { useContext, useEffect, useState } from "react";
import { PeopleIcon, DownloadIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import type { SteamPlayerCount } from "@types";
import { gameDetailsContext } from "@renderer/context";
import { Tooltip } from "react-tooltip";
import "./hero-player-counter.scss";

export function HeroPlayerCounter() {
  const { effectiveShop, effectiveObjectId, gameTitle, stats } =
    useContext(gameDetailsContext);
  const { t } = useTranslation("game_details");

  const [playerData, setPlayerData] = useState<SteamPlayerCount | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setPlayerData(null);
    setVisible(false);

    if (!effectiveObjectId || !effectiveShop) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const result = await window.electron.getSteamPlayerCount(
          effectiveShop,
          effectiveObjectId,
          gameTitle
        );
        if (!cancelled && result) {
          setPlayerData(result);
          setVisible(true);
        }
      } catch {
        // Silently hide on error
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [effectiveObjectId, effectiveShop, gameTitle]);

  if ((!visible || !playerData) && !stats) return null;

  const formatCount = (count: number): string => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toLocaleString();
  };

  const tooltipContent = playerData
    ? [
        `${t("steam_player_count")}: ${playerData.currentPlayers.toLocaleString()}`,
        playerData.allTimePeak !== null
          ? `${t("peak")}: ${playerData.allTimePeak.toLocaleString()}`
          : null,
        playerData.trend24h !== null
          ? `24h: ${playerData.trend24h > 0 ? "+" : ""}${playerData.trend24h}%`
          : null,
        playerData.trend7d !== null
          ? `7d: ${playerData.trend7d > 0 ? "+" : ""}${playerData.trend7d}%`
          : null,
      ]
        .filter(Boolean)
        .join(" | ")
    : "";

  const tooltipId = `player-count-tooltip-${effectiveObjectId}`;

  const renderTrend = () => {
    if (!playerData || playerData.trend24h === null) return null;
    const isPositive = playerData.trend24h > 0;
    const isNeutral = playerData.trend24h === 0;
    const color = isNeutral ? "#d0d1d7" : isPositive ? "#4caf50" : "#e11d48";
    const arrow = isNeutral ? "" : isPositive ? "↑" : "↓";
    return (
      <span className="hero-player-counter__trend" style={{ color }}>
        {arrow}
        {Math.abs(playerData.trend24h)}%
      </span>
    );
  };

  return (
    <div className="hero-stats-container">
      {visible && playerData && (
        <div
          className="hero-player-counter"
          data-tooltip-id={tooltipId}
          data-tooltip-content={tooltipContent}
          data-tooltip-place="bottom"
        >
          <PeopleIcon size={16} />
          <span className="hero-player-counter__count">
            {formatCount(playerData.currentPlayers)}
          </span>
          <span className="hero-player-counter__label">steam</span>
          <span className="hero-player-counter__live">
            <span className="hero-player-counter__live-dot" />
            {t("live")}
          </span>
          {renderTrend()}
        </div>
      )}

      {stats && (
        <>
          <div
            className="hero-player-counter"
            data-tooltip-id={tooltipId}
            data-tooltip-content={`${t("download_count")}: ${stats.downloadCount.toLocaleString()}`}
            data-tooltip-place="bottom"
          >
            <DownloadIcon size={16} />
            <span className="hero-player-counter__count">
              {formatCount(stats.downloadCount)}
            </span>
            <span className="hero-player-counter__label">hydra</span>
          </div>

          <div
            className="hero-player-counter"
            data-tooltip-id={tooltipId}
            data-tooltip-content={`${t("player_count")}: ${stats.playerCount.toLocaleString()}`}
            data-tooltip-place="bottom"
          >
            <PeopleIcon size={16} />
            <span className="hero-player-counter__count">
              {formatCount(stats.playerCount)}
            </span>
            <span className="hero-player-counter__label">hydra</span>
          </div>
        </>
      )}

      {((visible && playerData) || stats) && (
        <Tooltip
          id={tooltipId}
          style={{
            zIndex: 9999,
            fontSize: "12px",
          }}
          openOnClick={false}
        />
      )}
    </div>
  );
}
