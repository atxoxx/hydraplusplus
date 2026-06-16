import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ClockIcon,
  PaperAirplaneIcon,
  PencilIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
} from "@primer/octicons-react";
import type { HowLongToBeatCategory } from "@types";
import { gameDetailsContext } from "@renderer/context";
import { useToast } from "@renderer/hooks";
import { PlaytimeEditModal } from "@renderer/components/playtime-edit-modal/playtime-edit-modal";
import { usePlaytimeData } from "@renderer/hooks/use-playtime-data";
import { RENDERABLE_PROVIDER_META } from "@shared";

import "./how-long-to-beat-card.scss";

const durationTranslation: Record<string, string> = {
  Hours: "hours",
  Mins: "minutes",
};

function parseDurationToSeconds(duration: string): number {
  const [value, unit] = duration.split(" ");
  const num = parseFloat(value);
  if (unit === "Hours" || unit === "hours") return num * 3600;
  if (unit === "Mins" || unit === "mins" || unit === "minutes") return num * 60;
  return 0;
}

export interface HowLongToBeatCardProps {
  /** Skeleton-only mode for placeholders before the page hydrates. */
  isLoading?: boolean;
  /** Compact mode for the sidebar mirror. */
  compact?: boolean;
}

const LOW_CONFIDENCE_THRESHOLD = 0.85;

export function HowLongToBeatCard({
  isLoading: isLoadingProp,
  compact,
}: Readonly<HowLongToBeatCardProps>) {
  const { t } = useTranslation("game_details");
  const { game } = useContext(gameDetailsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isExtended, setIsExtended] = useState(false);

  const { state, refetch } = usePlaytimeData({
    game,
    disabled: isLoadingProp,
  });

  const userPlaytimeSeconds = useMemo(
    () => (game?.playTimeInMilliseconds ?? 0) / 1000,
    [game?.playTimeInMilliseconds]
  );

  const formatDuration = (duration: string) => {
    const [value, unit] = duration.split(" ");
    return `${value} ${t(durationTranslation[unit] ?? "hours")}`;
  };

  const getProgressPercent = (duration: string): number => {
    const estimated = parseDurationToSeconds(duration);
    if (estimated <= 0) return 0;
    return Math.min(Math.round((userPlaytimeSeconds / estimated) * 100), 100);
  };

  const handleSubmitPlaytime = async () => {
    if (!game || (state.status !== "loaded" && state.status !== "empty"))
      return;
    try {
      await window.electron.hydraApi.post(
        `/games/${game.shop}/${game.objectId}/hltb/submit`,
        {
          data: { playtimeSeconds: userPlaytimeSeconds },
          needsAuth: true,
        }
      );
      showSuccessToast(t("hltb_submitted"));
    } catch {
      showErrorToast(t("hltb_submit_failed"));
    }
  };

  // Re-fetch whenever the Edit modal closes — the new mapping is now
  // persisted so the cloud endpoint will return correct data.
  useEffect(() => {
    if (!isEditOpen) refetch();
  }, [isEditOpen, refetch]);

  // Compact sidebar mode renders categories only, no actions.
  if (compact) {
    if (state.status !== "loaded") return null;
    return (
      <div className="hltb-card hltb-card--compact">
        <ul className="hltb-card__list hltb-card__list--compact">
          {state.categories.slice(0, 4).map((category) => (
            <li
              key={category.title}
              className="hltb-card__item hltb-card__item--compact"
            >
              <span className="hltb-card__item-title">{category.title}</span>
              <span className="hltb-card__item-duration">
                {formatDuration(category.duration)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
        <div className="dashboard-card hltb-card">
          <Header />
          <div className="dashboard-card__body">
            <div className="hltb-card__error">
              <span>{t("hltb_error_title")}</span>
              <button
                type="button"
                className="hltb-card__error-btn"
                onClick={() => refetch()}
              >
                {t("hltb_error_retry")}
              </button>
            </div>
          </div>
        </div>
      </SkeletonTheme>
    );
  }

  if (state.status === "empty") {
    return (
      <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
        <div className="dashboard-card hltb-card">
          <Header />
          <div className="dashboard-card__body">
            <div className="hltb-card__empty">
              <h4 className="hltb-card__empty-title">
                {t("hltb_empty_title")}
              </h4>
              <p className="hltb-card__empty-body">{t("hltb_empty_body")}</p>
              <button
                type="button"
                className="hltb-card__empty-action"
                onClick={() => setIsEditOpen(true)}
              >
                <SearchIcon size={14} />
                <span>{t("hltb_empty_action")}</span>
              </button>
            </div>
          </div>
        </div>
        {game && (
          <PlaytimeEditModal
            visible={isEditOpen}
            game={game}
            onClose={() => setIsEditOpen(false)}
          />
        )}
      </SkeletonTheme>
    );
  }

  if (state.status === "loading" || isLoadingProp) {
    return (
      <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
        <div className="dashboard-card hltb-card">
          <Header actions={null} />
          <div className="dashboard-card__body">
            <div className="hltb-card__list">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="hltb-card__skeleton" />
              ))}
            </div>
          </div>
        </div>
      </SkeletonTheme>
    );
  }

  if (state.status === "matched-no-data") {
    const providerMeta = RENDERABLE_PROVIDER_META[state.provider];
    return (
      <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
        <div className="dashboard-card hltb-card">
          <div className="dashboard-card__header hltb-card__header">
            <div className="hltb-card__header-meta">
              <span className="dashboard-card__header-icon">
                <ClockIcon size={16} />
              </span>
              <div className="hltb-card__header-titles">
                <h3 className="dashboard-card__header-title">HowLongToBeat</h3>
                <span className="hltb-card__provider">
                  {t("hltb_provider_label")}: {providerMeta.displayName}
                  <span className="hltb-card__confidence">
                    {" · "}
                    {`Match ${Math.round(state.similarityScore * 100)}%`}
                  </span>
                </span>
              </div>
            </div>
            <div className="hltb-card__header-actions">
              <button
                type="button"
                className="hltb-card__action-btn"
                onClick={() => setIsEditOpen(true)}
                title={t("hltb_edit")}
              >
                <PencilIcon size={14} />
              </button>
            </div>
          </div>
          <div className="dashboard-card__body">
            <div className="hltb-card__empty">
              <p className="hltb-card__empty-body">
                Matched "<strong>{state.providerTitle}</strong>" via{" "}
                {providerMeta.displayName}, but no detailed playtime data is
                available for this provider.
              </p>
              <button
                type="button"
                className="hltb-card__empty-action"
                onClick={() => setIsEditOpen(true)}
              >
                <SearchIcon size={14} />
                <span>{t("playtime_edit_save")}</span>
              </button>
            </div>
          </div>
        </div>
        {game && (
          <PlaytimeEditModal
            visible={isEditOpen}
            game={game}
            initialProvider={state.provider}
            onClose={() => setIsEditOpen(false)}
          />
        )}
      </SkeletonTheme>
    );
  }

  if (state.status !== "loaded") return null;

  const providerMeta = RENDERABLE_PROVIDER_META[state.provider];
  const showConfidenceChip = state.similarityScore > 0;
  const isLowConfidence =
    state.similarityScore > 0 &&
    state.similarityScore < LOW_CONFIDENCE_THRESHOLD;
  const isManual = state.manual;

  const primaryCategories: HowLongToBeatCategory[] = state.categories.slice(
    0,
    4
  );
  const extendedCategories: HowLongToBeatCategory[] = state.categories.slice(4);

  return (
    <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
      <div className="dashboard-card hltb-card">
        <Header
          providerName={providerMeta.displayName}
          confidence={state.similarityScore}
          showConfidenceChip={showConfidenceChip}
          isLowConfidence={isLowConfidence}
          isManual={isManual}
          onEdit={() => setIsEditOpen(true)}
          isExtended={isExtended}
          onToggleExtend={() => setIsExtended((v) => !v)}
          supportsExtend={extendedCategories.length > 0}
        />

        <div className="dashboard-card__body">
          <div className="hltb-card__list">
            {primaryCategories.map((category) => (
              <CardRow
                key={category.title}
                category={category}
                userPlaytimeSeconds={userPlaytimeSeconds}
                formatDuration={formatDuration}
                getProgressPercent={getProgressPercent}
              />
            ))}

            {/* Hidden rows that the Extend toggle reveals */}
            <div
              className={`hltb-card__extended ${
                isExtended ? "hltb-card__extended--open" : ""
              }`}
            >
              {extendedCategories.map((category) => (
                <CardRow
                  key={category.title}
                  category={category}
                  userPlaytimeSeconds={userPlaytimeSeconds}
                  formatDuration={formatDuration}
                  getProgressPercent={getProgressPercent}
                />
              ))}
            </div>

            {userPlaytimeSeconds > 0 && providerMeta.supportsSubmit && (
              <button
                type="button"
                className="hltb-card__submit-btn"
                onClick={handleSubmitPlaytime}
              >
                <PaperAirplaneIcon size={14} />
                <span>{t("hltb_submit_playtime")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {game && (
        <PlaytimeEditModal
          visible={isEditOpen}
          game={game}
          initialProvider={state.provider}
          initialExternalId={
            // ExternalId isn't surfaced directly on `loaded` state; the
            // modal uses its own library cache to suggest the entry that
            // matches the current loaded state by provider.
            undefined
          }
          onClose={() => setIsEditOpen(false)}
        />
      )}
    </SkeletonTheme>
  );
}

interface HeaderProps {
  providerName?: string;
  confidence?: number;
  showConfidenceChip?: boolean;
  isLowConfidence?: boolean;
  isManual?: boolean;
  actions?: React.ReactNode;
  onEdit?: () => void;
  isExtended?: boolean;
  onToggleExtend?: () => void;
  supportsExtend?: boolean;
}

function Header({
  providerName,
  confidence,
  showConfidenceChip,
  isLowConfidence,
  isManual,
  actions,
  onEdit,
  isExtended,
  onToggleExtend,
  supportsExtend,
}: Readonly<HeaderProps>) {
  if (actions === null) {
    return (
      <div className="dashboard-card__header">
        <span className="dashboard-card__header-icon">
          <ClockIcon size={16} />
        </span>
        <h3 className="dashboard-card__header-title">HowLongToBeat</h3>
      </div>
    );
  }
  return (
    <div className="dashboard-card__header hltb-card__header">
      <div className="hltb-card__header-meta">
        <span className="dashboard-card__header-icon">
          <ClockIcon size={16} />
        </span>
        <div className="hltb-card__header-titles">
          <h3 className="dashboard-card__header-title">HowLongToBeat</h3>
          {providerName && (
            <span className="hltb-card__provider">
              Provider: {providerName}
              {isManual && showConfidenceChip && (
                <span className="hltb-card__manual-tag">
                  {" · "}
                  Manual
                </span>
              )}
              {showConfidenceChip && (
                <span
                  className={`hltb-card__confidence ${
                    isLowConfidence ? "hltb-card__confidence--low" : ""
                  }`}
                >
                  {" · "}
                  {`Match ${Math.round((confidence ?? 0) * 100)}%`}
                </span>
              )}
            </span>
          )}
          {isLowConfidence && (
            <button
              type="button"
              className="hltb-card__low-confidence-link"
              onClick={onEdit}
            >
              Not the right game?
            </button>
          )}
        </div>
      </div>

      <div className="hltb-card__header-actions">
        {onEdit && (
          <button
            type="button"
            className="hltb-card__action-btn"
            onClick={onEdit}
            title="Edit"
          >
            <PencilIcon size={14} />
          </button>
        )}
        {onToggleExtend && supportsExtend && (
          <button
            type="button"
            className="hltb-card__action-btn"
            onClick={onToggleExtend}
            title={isExtended ? "Collapse" : "Extend"}
          >
            {isExtended ? (
              <ChevronUpIcon size={14} />
            ) : (
              <ChevronDownIcon size={14} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

interface CardRowProps {
  category: HowLongToBeatCategory;
  userPlaytimeSeconds: number;
  formatDuration: (d: string) => string;
  getProgressPercent: (d: string) => number;
}

function CardRow({
  category,
  userPlaytimeSeconds,
  formatDuration,
  getProgressPercent,
}: Readonly<CardRowProps>) {
  const progress = getProgressPercent(category.duration);
  return (
    <div className="hltb-card__item">
      <span className="hltb-card__item-title">{category.title}</span>
      <span className="hltb-card__item-duration">
        {formatDuration(category.duration)}
      </span>
      {category.accuracy !== "00" && (
        <span className="hltb-card__item-accuracy">
          {`${category.accuracy}% accuracy`}
        </span>
      )}
      {userPlaytimeSeconds > 0 && (
        <div className="hltb-card__progress-container">
          <div className="hltb-card__progress-track">
            <div
              className="hltb-card__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="hltb-card__progress-label">{progress}%</span>
        </div>
      )}
    </div>
  );
}
