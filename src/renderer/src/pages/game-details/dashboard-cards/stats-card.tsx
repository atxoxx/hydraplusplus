import { useContext, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  DownloadIcon,
  PeopleIcon,
  SunIcon,
  XIcon,
  DatabaseIcon,
  HistoryIcon,
  ClockIcon,
} from "@primer/octicons-react";
import { StarRating } from "@renderer/components/star-rating/star-rating";
import { GameStatusDropdown } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useFormat, useToast, useDate } from "@renderer/hooks";
import type { GameShop, UserGameStatus } from "@types";
import { formatBytes } from "@shared";

import "./dashboard-card.scss";
import "./stats-card.scss";

/**
 * Library + playtime snapshot. Combines:
 *   - User-editable status (via shared `GameStatusDropdown`)
 *   - Inline playtime editor that writes through `changeGamePlayTime` IPC
 *   - Catalogue-level stats (downloads, players, rating)
 *   - Local stats (game size, session count, last played)
 */
export function StatsCard() {
  const { t } = useTranslation("game_details");
  const { stats, game, shop, objectId, updateGame } =
    useContext(gameDetailsContext);
  const { numberFormatter } = useFormat();
  const { showSuccessToast, showErrorToast } = useToast();
  const { formatDistance } = useDate();

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    if (objectId && shop) {
      window.electron
        .getGameSessions(shop as GameShop, objectId)
        .then(setSessions)
        .catch(() => setSessions([]));
    }
  }, [shop, objectId, game?.playTimeInMilliseconds]);

  // Normalize legacy "to_play" from existing LevelDB data.
  const rawStatus = game?.userStatus;
  const currentStatus: UserGameStatus =
    String(rawStatus) === "to_play" ? "plan_to_play" : (rawStatus ?? "none");

  const handleStatusChange = async (status: UserGameStatus) => {
    if (!shop || !objectId || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      const result = await window.electron.setGameUserStatus(
        shop,
        objectId,
        status
      );
      if (result.ok) {
        showSuccessToast(
          t(status === "none" ? "status_cleared" : "status_updated")
        );
        await updateGame();
      } else {
        showErrorToast(result.error || t("status_update_failed"));
      }
    } catch {
      showErrorToast(t("status_update_failed"));
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (!stats && !game) return null;

  return (
    <div className="dashboard-card stats-card">
      <div className="dashboard-card__header">
        <span className="dashboard-card__header-icon">
          <SunIcon size={16} />
        </span>
        <h3 className="dashboard-card__header-title">{t("stats")}</h3>
      </div>

      <div className="dashboard-card__body">
        {game && (
          <div className="stats-card__primary">
            <div className="stats-card__row">
              <span className="stats-card__row-label">
                {t("stats_status_label")}
              </span>
              <GameStatusDropdown
                value={currentStatus}
                onChange={handleStatusChange}
                disabled={isUpdatingStatus}
              />
            </div>

            <div className="stats-card__row">
              <InlinePlaytime
                ms={game.playTimeInMilliseconds ?? 0}
                shop={shop as GameShop}
                objectId={objectId ?? ""}
                onError={(message) =>
                  showErrorToast(message || t("status_update_failed"))
                }
                onSuccess={() => showSuccessToast(t("status_updated"))}
                onUpdated={() => updateGame()}
              />
            </div>
          </div>
        )}

        <div className="stats-card__list">
          {game && (
            <>
              <div className="stats-card__item">
                <span className="stats-card__item-label">
                  <DatabaseIcon size={16} />
                  {t("game_size", "Game size")}
                </span>
                <span className="stats-card__item-value">
                  {game.installedSizeInBytes
                    ? formatBytes(game.installedSizeInBytes)
                    : t("not_available", "N/A")}
                </span>
              </div>

              <div className="stats-card__item">
                <span className="stats-card__item-label">
                  <HistoryIcon size={16} />
                  {t("sessions", "Sessions")}
                </span>
                <span className="stats-card__item-value">
                  {sessions.length}
                </span>
              </div>

              <div className="stats-card__item">
                <span className="stats-card__item-label">
                  <ClockIcon size={16} />
                  {t("last_played", "Last played")}
                </span>
                <span className="stats-card__item-value">
                  {game.lastTimePlayed
                    ? formatDistance(
                        new Date(game.lastTimePlayed),
                        new Date(),
                        {
                          addSuffix: true,
                        }
                      )
                    : t("not_played_yet", { title: game.title })}
                </span>
              </div>
            </>
          )}

          {stats && (
            <>
              <div className="stats-card__item">
                <span className="stats-card__item-label">
                  <DownloadIcon size={16} />
                  {t("download_count")}
                </span>
                <span className="stats-card__item-value">
                  {numberFormatter.format(stats.downloadCount)}
                </span>
              </div>

              <div className="stats-card__item">
                <span className="stats-card__item-label">
                  <PeopleIcon size={16} />
                  {t("player_count")}
                </span>
                <span className="stats-card__item-value">
                  {numberFormatter.format(stats.playerCount)}
                </span>
              </div>

              <div className="stats-card__item">
                <span className="stats-card__item-label">
                  <SunIcon size={16} />
                  {t("rating_count")}
                </span>
                <span className="stats-card__item-value">
                  <StarRating
                    rating={
                      stats.averageScore === 0
                        ? null
                        : (stats.averageScore ?? null)
                    }
                    size={16}
                  />
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface InlinePlaytimeProps {
  ms: number;
  shop: GameShop;
  objectId: string;
  /**
   * Receives an already-translated error from `parent.onError`. Pass null
   * to fall back on the parent's localized message; pass an empty string
   * to suppress.
   */
  onError: (message: string | null) => void;
  onSuccess: () => void;
  onUpdated: () => void | Promise<void>;
}

/**
 * Inline-edit playtime cell. Clicking the value swaps to a number input;
 * Enter commits if the input has content, Escape cancels. Heavy lifting
 * (IPC + toast + refetch) is delegated back to the parent so the network
 * calls still go through `changeGamePlayTime` exactly like the dedicated
 * modal does.
 */
function InlinePlaytime({
  ms,
  shop,
  objectId,
  onError,
  onSuccess,
  onUpdated,
}: Readonly<InlinePlaytimeProps>) {
  const { t } = useTranslation("game_details");
  const [isEditing, setIsEditing] = useState(false);
  const [hoursInput, setHoursInput] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the buffered input if the persisted value changes (e.g. after
  // the user finishes a session) and we're not mid-edit.
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      return;
    }
    setHoursInput(String(Math.floor((ms ?? 0) / 3_600_000)));
  }, [ms, isEditing]);

  const formatted = formatPlaytime(ms ?? 0, t);

  const startEditing = () => {
    if (isSaving) return;
    setHoursInput(String(Math.floor((ms ?? 0) / 3_600_000)));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const commitHours = async () => {
    if (isSaving) return;
    // Refuse Enter on an empty input — treats it as "cancel" rather than
    // accidentally wiping the user's playtime to zero.
    if (hoursInput.trim() === "") {
      cancelEditing();
      return;
    }
    const numeric = Math.max(0, parseInt(hoursInput, 10) || 0);
    setIsSaving(true);
    try {
      await window.electron.changeGamePlayTime(shop, objectId, numeric * 3600);
      setIsEditing(false);
      onSuccess();
      await onUpdated();
    } catch (error) {
      // Don't leak raw IPC strings — surface a generic localized message
      // unless the IPC handler explicitly provided a user-friendly string.
      const message = error instanceof Error && error.message ? null : null;
      onError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitHours();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    }
  };

  return (
    <>
      <span className="stats-card__row-label">{t("play_time_short")}</span>
      {isEditing ? (
        <span className="stats-card__playtime-edit">
          <input
            ref={inputRef}
            className="stats-card__playtime-input"
            type="number"
            min={0}
            value={hoursInput}
            onChange={(e) => setHoursInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isSaving}
          />
          <span className="stats-card__playtime-suffix">h</span>
          <button
            type="button"
            className="stats-card__playtime-btn stats-card__playtime-btn--ok"
            onClick={commitHours}
            disabled={isSaving}
            aria-label={t("status_updated")}
          >
            <CheckIcon size={12} />
          </button>
          <button
            type="button"
            className="stats-card__playtime-btn stats-card__playtime-btn--cancel"
            onClick={cancelEditing}
            disabled={isSaving}
            aria-label={t("cancel")}
          >
            <XIcon size={12} />
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="stats-card__playtime-display"
          onClick={startEditing}
        >
          {formatted}
        </button>
      )}
    </>
  );
}

function formatPlaytime(
  ms: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const safe = Math.max(0, ms);
  const minutes = safe / 60_000;
  if (minutes < 60) {
    return t("amount_minutes", { amount: Math.round(minutes) });
  }
  const hours = minutes / 60;
  return t("amount_hours", { amount: Math.round(hours * 10) / 10 });
}
