import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ClockIcon,
  ThumbsupIcon,
  SunIcon,
  GiftIcon,
  ZapIcon,
} from "@primer/octicons-react";
import { ThumbsUp } from "lucide-react";
import type { SteamReview } from "@types";
import { useDate, useFormat } from "@renderer/hooks";
import { formatNumber } from "@renderer/helpers";
import { getFlagEmojiFromCountryCode } from "@shared";
import "./steam-review-card.scss";

interface SteamReviewCardProps {
  review: SteamReview;
  /** When true, the body is rendered fully expanded by default. */
  initiallyExpanded?: boolean;
}

/** Steam language code → ISO 639-1 for the flag emoji helper. */
const STEAM_LANG_TO_ISO: Record<string, string> = {
  english: "en",
  schinese: "zh",
  tchinese: "zh",
  japanese: "ja",
  koreana: "ko",
  russian: "ru",
  french: "fr",
  german: "de",
  spanish: "es",
  latam: "es",
  portuguese: "pt",
  brazilian: "pt",
  polish: "pl",
  turkish: "tr",
  thai: "th",
  ukrainian: "uk",
  vietnamese: "vi",
  italian: "it",
  indonesian: "id",
  arabic: "ar",
};

/** Map Steam's `weighted_vote_score` text (e.g. "0.7960433825798008") into a
 * 0-100% Steam-style quality percentage. */
function getWeightedVotePercentage(weighted: string): number | null {
  const parsed = Number.parseFloat(weighted);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  // Steam reports a decimal in the 0–1 range; if we receive values like "79.6"
  // we still coerce. Clamp at 100.
  const ratio = parsed <= 1 ? parsed : parsed / 100;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

export function SteamReviewCard({
  review,
  initiallyExpanded = false,
}: Readonly<SteamReviewCardProps>) {
  const { t } = useTranslation("game_details");
  const { formatDistance } = useDate();
  const { numberFormatter } = useFormat();
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  const recommended = review.voted_up;
  const isoLang = STEAM_LANG_TO_ISO[review.language] ?? null;
  const flagEmoji = isoLang
    ? getFlagEmojiFromCountryCode(STEAM_LANG_TO_ISO[review.language])
    : null;

  const createdAt = new Date(review.timestamp_created * 1000);

  const hoursAtReview = review.author.playtime_at_review / 60;
  const hoursTotal = review.author.playtime_forever / 60;

  const bodyText = (review.review ?? "").trim();
  const bodyIsLong = bodyText.length > 320;

  const weightedScorePct = getWeightedVotePercentage(
    review.weighted_vote_score
  );

  return (
    <article
      className={`steam-review-card ${
        recommended
          ? "steam-review-card--recommended"
          : "steam-review-card--not-recommended"
      }`}
    >
      <header className="steam-review-card__header">
        <div className="steam-review-card__badges">
          <span
            className="steam-review-card__badge steam-review-card__badge--recommendation"
            data-recommendation={recommended ? "up" : "down"}
          >
            {recommended ? (
              <ThumbsupIcon size={12} />
            ) : (
              <ThumbsUp size={12} style={{ transform: "scaleY(-1)" }} />
            )}
            {recommended
              ? t("review_recommended")
              : t("review_not_recommended")}
          </span>
          {review.steam_purchase && (
            <span className="steam-review-card__pill steam-review-card__pill--purchase">
              {t("review_steam_purchase")}
            </span>
          )}
          {review.received_for_free && (
            <span className="steam-review-card__pill steam-review-card__pill--free">
              <GiftIcon size={12} />
              {t("review_received_for_free")}
            </span>
          )}
          {review.written_during_early_access && (
            <span className="steam-review-card__pill steam-review-card__pill--early-access">
              <ZapIcon size={12} />
              {t("review_early_access")}
            </span>
          )}
        </div>
        <time
          className="steam-review-card__posted"
          dateTime={createdAt.toISOString()}
          title={createdAt.toLocaleString()}
        >
          {formatDistance(createdAt, new Date(), { addSuffix: true })}
        </time>
      </header>

      <div className="steam-review-card__author">
        <button
          type="button"
          className="steam-review-card__author-name"
          onClick={() => window.electron.openExternal(review.author.profileUrl)}
          title={t("review_open_in_steam")}
        >
          {review.author.personaname || "Anonymous"}
        </button>
        {Boolean(review.author.num_reviews) && (
          <span className="steam-review-card__author-reviews">
            {formatNumber(review.author.num_reviews)}
          </span>
        )}
      </div>

      <div className="steam-review-card__meta">
        <span
          className="steam-review-card__meta-item"
          title={t("review_hours_at_review_other", { count: hoursAtReview })}
        >
          <ClockIcon size={12} />
          {hoursAtReview >= 1
            ? `${numberFormatter.format(Math.round(hoursAtReview))} h`
            : `${Math.max(1, Math.round(hoursAtReview * 60))} m`}
        </span>

        {hoursTotal > 0 && (
          <span
            className="steam-review-card__meta-item"
            title={t("review_hours_total_other", { count: hoursTotal })}
          >
            · Σ {numberFormatter.format(Math.round(hoursTotal))} h
          </span>
        )}

        {review.language && (
          <span className="steam-review-card__language" title={review.language}>
            {flagEmoji && (
              <span className="steam-review-card__language-flag">
                {flagEmoji}
              </span>
            )}
            <span className="steam-review-card__language-code">
              {review.language.slice(0, 2).toUpperCase()}
            </span>
          </span>
        )}
      </div>

      {bodyText && (
        <>
          <div
            className={`steam-review-card__body ${
              isExpanded || !bodyIsLong
                ? "steam-review-card__body--expanded"
                : ""
            }`}
          >
            <p className="steam-review-card__body-text">{bodyText}</p>
          </div>
          {bodyIsLong && (
            <button
              type="button"
              className="steam-review-card__expand-toggle"
              onClick={() => setIsExpanded((value) => !value)}
            >
              {isExpanded ? t("review_show_less") : t("review_show_more")}
            </button>
          )}
        </>
      )}

      <footer className="steam-review-card__footer">
        <span className="steam-review-card__metric steam-review-card__metric--helpful">
          <ThumbsupIcon size={14} />
          <span className="steam-review-card__metric-count">
            {formatNumber(review.votes_up)}
          </span>
          <span className="steam-review-card__metric-label">
            {t("review_helpful_label")}
          </span>
        </span>
        {review.votes_funny > 0 && (
          <span className="steam-review-card__metric steam-review-card__metric--funny">
            <SunIcon size={14} />
            <span className="steam-review-card__metric-count">
              {formatNumber(review.votes_funny)}
            </span>
            <span className="steam-review-card__metric-label">
              {t("review_funny_badge")}
            </span>
          </span>
        )}
        {weightedScorePct !== null && (
          <span
            className="steam-review-card__metric steam-review-card__metric--quality"
            title={t("review_quality_label")}
          >
            <span className="steam-review-card__metric-value">
              {weightedScorePct}%
            </span>
            <span className="steam-review-card__metric-label">
              {t("review_quality_label")}
            </span>
          </span>
        )}
      </footer>
    </article>
  );
}
