import { useTranslation } from "react-i18next";
import Skeleton from "react-loading-skeleton";
import type { SteamReviewSummary } from "@types";
import { useFormat } from "@renderer/hooks";
import {
  getSteamPositiveRatio,
  getSteamScoreColor,
} from "./steam-review-score";
import "./steam-review-summary-banner.scss";

interface SteamReviewSummaryBannerProps {
  summary: SteamReviewSummary | null;
  isLoading: boolean;
  hasError: boolean;
}

export function SteamReviewSummaryBanner({
  summary,
  isLoading,
  hasError,
}: Readonly<SteamReviewSummaryBannerProps>) {
  const { t } = useTranslation("game_details");
  const { numberFormatter } = useFormat();

  if (isLoading) {
    return (
      <div className="steam-review-summary-banner steam-review-summary-banner--loading">
        <Skeleton height={28} width="40%" />
        <Skeleton height={14} width="60%" />
        <Skeleton height={10} width="100%" />
      </div>
    );
  }

  if (hasError || !summary) {
    return (
      <div className="steam-review-summary-banner steam-review-summary-banner--error">
        <p>{t("data_unavailable")}</p>
      </div>
    );
  }

  const scoreColor = getSteamScoreColor(summary.reviewScoreDescriptor);
  const positiveRatio = getSteamPositiveRatio(summary);
  const totalReviews = summary.totalReviews ?? 0;
  const positiveRatioLabel =
    summary.totalReviews > 0 ? `${summary.reviewScore}%` : "—";

  return (
    <div className="steam-review-summary-banner">
      <div className="steam-review-summary-banner__row">
        <span
          className="steam-review-summary-banner__descriptor"
          style={{ color: scoreColor }}
        >
          {summary.reviewScoreDescriptor}
        </span>
        <span
          className="steam-review-summary-banner__percentage"
          style={{ color: scoreColor }}
        >
          {positiveRatioLabel}
        </span>
        <span className="steam-review-summary-banner__count">
          {numberFormatter.format(totalReviews)}{" "}
          {t("total_reviews").toLowerCase()}
        </span>
      </div>

      <div
        className="steam-review-summary-banner__bar"
        role="progressbar"
        aria-label={t("steam_rating")}
      >
        <div
          className="steam-review-summary-banner__bar-fill"
          style={{
            width: `${positiveRatio}%`,
            backgroundColor: scoreColor,
          }}
        />
      </div>
    </div>
  );
}
