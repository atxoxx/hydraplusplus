import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StarIcon } from "@primer/octicons-react";
import type { SteamReviewSummary } from "@types";
import { gameDetailsContext } from "@renderer/context";
import { useFormat } from "@renderer/hooks";
import { SidebarSection } from "../sidebar-section/sidebar-section";
import { Button } from "@renderer/components/button/button";
import Skeleton from "react-loading-skeleton";
import "./steam-rating-section.scss";

interface SteamRatingSectionProps {
  onOpenDetails: () => void;
}

function getSteamScoreColor(descriptor: string): string {
  const desc = descriptor.toLowerCase();
  if (
    desc.includes("overwhelmingly positive") ||
    desc.includes("very positive") ||
    desc.includes("positive")
  ) {
    return "#66c0f4";
  }
  if (desc.includes("mostly positive")) {
    return "#66c0f4";
  }
  if (desc.includes("mixed")) {
    return "#b9a074";
  }
  if (
    desc.includes("mostly negative") ||
    desc.includes("negative") ||
    desc.includes("very negative") ||
    desc.includes("overwhelmingly negative")
  ) {
    return "#a34c25";
  }
  return "#d0d1d7";
}

export function SteamRatingSection({
  onOpenDetails,
}: Readonly<SteamRatingSectionProps>) {
  const { objectId, shop, gameTitle } = useContext(gameDetailsContext);
  const { t } = useTranslation("game_details");
  const { numberFormatter } = useFormat();

  const [reviewSummary, setReviewSummary] =
    useState<SteamReviewSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setReviewSummary(null);
    setIsLoading(true);
    setHasError(false);

    if (!objectId || !shop) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    let cancelled = false;

    window.electron
      .getSteamReviewSummary(shop, objectId, gameTitle)
      .then((result) => {
        if (!cancelled) {
          if (result) {
            setReviewSummary(result);
          } else {
            setHasError(true);
          }
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [objectId, shop, gameTitle]);

  if (isLoading) {
    return (
      <SidebarSection title={t("steam_rating")}>
        <div className="steam-rating-section__skeleton">
          <Skeleton width="60%" height={20} />
          <Skeleton width="100%" height={8} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="70%" height={14} />
          <Skeleton width="50%" height={14} />
        </div>
      </SidebarSection>
    );
  }

  if (hasError || !reviewSummary) {
    return (
      <SidebarSection title={t("steam_rating")}>
        <div className="steam-rating-section__placeholder">
          <p>{t("data_unavailable")}</p>
        </div>
      </SidebarSection>
    );
  }

  const scoreColor = getSteamScoreColor(reviewSummary.reviewScoreDescriptor);
  const positiveRatio =
    reviewSummary.totalReviews > 0
      ? (reviewSummary.totalPositive / reviewSummary.totalReviews) * 100
      : 0;

  return (
    <SidebarSection title={t("steam_rating")}>
      <div className="steam-rating-section">
        <div className="steam-rating-section__header">
          <div className="steam-rating-section__score-group">
            <span
              className="steam-rating-section__descriptor"
              style={{ color: scoreColor }}
            >
              {reviewSummary.reviewScoreDescriptor}
            </span>
            <span
              className="steam-rating-section__percentage"
              style={{ color: scoreColor }}
            >
              {reviewSummary.reviewScore}%
            </span>
          </div>
          <Button
            theme="outline"
            className="steam-rating-section__details-button"
            onClick={onOpenDetails}
          >
            <StarIcon size={14} />
            {t("see_details")}
          </Button>
        </div>

        <div className="steam-rating-section__bar">
          <div
            className="steam-rating-section__bar-fill"
            style={{
              width: `${positiveRatio}%`,
              backgroundColor: scoreColor,
            }}
          />
        </div>

        <div className="steam-rating-section__breakdown">
          <div className="steam-rating-section__breakdown-row">
            <span>{t("positive")}</span>
            <span className="steam-rating-section__breakdown-count">
              {numberFormatter.format(reviewSummary.totalPositive)}
            </span>
          </div>
          <div className="steam-rating-section__breakdown-row">
            <span>{t("negative")}</span>
            <span className="steam-rating-section__breakdown-count">
              {numberFormatter.format(reviewSummary.totalNegative)}
            </span>
          </div>
          <div className="steam-rating-section__breakdown-row steam-rating-section__breakdown-row--total">
            <span>{t("total_reviews")}</span>
            <span className="steam-rating-section__breakdown-count">
              {numberFormatter.format(reviewSummary.totalReviews)}
            </span>
          </div>
        </div>

        {reviewSummary.recentTotal !== null && (
          <div className="steam-rating-section__recent">
            <p className="steam-rating-section__recent-title">
              {t("recent_reviews")}
            </p>
            <p className="steam-rating-section__recent-detail">
              <span
                className="steam-rating-section__recent-descriptor"
                style={{
                  color: getSteamScoreColor(
                    reviewSummary.recentReviewScoreDescriptor ?? ""
                  ),
                }}
              >
                {reviewSummary.recentReviewScoreDescriptor}
              </span>
              {" — "}
              {reviewSummary.recentReviewScore}% (
              {numberFormatter.format(reviewSummary.recentTotal ?? 0)}{" "}
              {t("review_count").toLowerCase()})
            </p>
          </div>
        )}
      </div>
    </SidebarSection>
  );
}
