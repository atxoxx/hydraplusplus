import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameShop } from "@types";
import type { GameSession } from "../../declaration";
import { ActivityHardwareCard } from "../game-details/activity-hardware-card";

export interface GlobalSessionListProps {
  topGames: {
    objectId: string;
    shop: string;
    title: string;
    iconUrl: string | null;
  }[];
  loading: boolean;
}

interface SessionWithGame extends GameSession {
  gameTitle: string;
  gameIconUrl: string | null;
}

function formatDuration(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

const MAX_SESSIONS = 10;

export function GlobalSessionList({
  topGames,
  loading,
}: Readonly<GlobalSessionListProps>) {
  const { t } = useTranslation("activity");
  const [allSessions, setAllSessions] = useState<SessionWithGame[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      const results: SessionWithGame[] = [];

      for (const game of topGames.slice(0, 5)) {
        try {
          const sessions = await window.electron.getGameSessions(
            game.shop as GameShop,
            game.objectId,
            5,
            0
          );
          for (const s of sessions) {
            results.push({
              ...s,
              gameTitle: game.title,
              gameIconUrl: game.iconUrl,
            });
          }
        } catch {
          // skip games with no sessions
        }
      }

      if (!cancelled) {
        results.sort(
          (a, b) =>
            new Date(b.endTime).getTime() - new Date(a.endTime).getTime()
        );
        setAllSessions(results.slice(0, MAX_SESSIONS));
      }
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [topGames]);

  if (loading) {
    return (
      <div className="section-panel">
        <h3 className="section-panel__title">{t("recent_sessions")}</h3>
        <div className="section-panel__empty">{t("loading")}</div>
      </div>
    );
  }

  if (allSessions.length === 0) {
    return (
      <div className="section-panel">
        <h3 className="section-panel__title">{t("recent_sessions")}</h3>
        <div className="section-panel__empty">{t("no_sessions_yet")}</div>
      </div>
    );
  }

  return (
    <div className="section-panel">
      <h3 className="section-panel__title">{t("recent_sessions")}</h3>
      <div className="global-session-list">
        {allSessions.map((session) => {
          const isExpanded = expandedSessionId === session.id;
          const hasHardware = !!session.hardwareMetrics;

          return (
            <div key={session.id} className="global-session-list__item">
              <button
                type="button"
                className="global-session-list__row"
                onClick={() =>
                  setExpandedSessionId(isExpanded ? null : session.id)
                }
              >
                {session.gameIconUrl ? (
                  <img
                    className="global-session-list__icon"
                    src={session.gameIconUrl}
                    alt={session.gameTitle}
                  />
                ) : (
                  <div className="global-session-list__icon" />
                )}

                <div className="global-session-list__info">
                  <span className="global-session-list__game">
                    {session.gameTitle}
                  </span>
                  <span className="global-session-list__date">
                    {formatDate(session.startTime)} ·{" "}
                    {formatTime(session.startTime)} —{" "}
                    {formatTime(session.endTime)}
                  </span>
                </div>

                <span className="global-session-list__duration">
                  {formatDuration(session.durationMs)}
                </span>
              </button>

              {isExpanded && hasHardware && (
                <div className="global-session-list__hardware">
                  <ActivityHardwareCard metrics={session.hardwareMetrics} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
