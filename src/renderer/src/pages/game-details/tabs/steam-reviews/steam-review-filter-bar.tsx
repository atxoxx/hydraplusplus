import { useTranslation } from "react-i18next";
import "./steam-review-filter-bar.scss";

export type SteamReviewTypeFilterValue = "all" | "positive" | "negative";
export type SteamReviewPurchaseFilterValue = "all" | "steam";
export type SteamReviewPlaytimePreset = "any" | "over_1" | "over_10" | "over_100";
export type SteamReviewLanguageFilterValue =
  | "all"
  | "english"
  | "schinese"
  | "tchinese"
  | "japanese"
  | "koreana"
  | "russian"
  | "french"
  | "german"
  | "spanish"
  | "latam"
  | "portuguese"
  | "brazilian"
  | "polish"
  | "turkish"
  | "thai"
  | "ukrainian"
  | "vietnamese"
  | "italian"
  | "indonesian"
  | "arabic";

export interface SteamReviewFiltersState {
  reviewType: SteamReviewTypeFilterValue;
  purchaseType: SteamReviewPurchaseFilterValue;
  playtime: SteamReviewPlaytimePreset;
  language: SteamReviewLanguageFilterValue;
}

export const DEFAULT_FILTERS: SteamReviewFiltersState = {
  reviewType: "all",
  purchaseType: "all",
  playtime: "any",
  language: "all",
};

/** Map from PlaytimePreset to (min, max) minutes. */
export function getPlaytimeMinutes(
  preset: SteamReviewPlaytimePreset
): { min: number; max: number } {
  switch (preset) {
    case "over_1":
      return { min: 60, max: 0 };
    case "over_10":
      return { min: 600, max: 0 };
    case "over_100":
      return { min: 6000, max: 0 };
    case "any":
    default:
      return { min: 0, max: 0 };
  }
}

interface SteamReviewFilterBarProps {
  filters: SteamReviewFiltersState;
  onChange: <K extends keyof SteamReviewFiltersState>(
    key: K,
    value: SteamReviewFiltersState[K]
  ) => void;
  onClear: () => void;
}

const LANGUAGE_VALUES: SteamReviewLanguageFilterValue[] = [
  "all",
  "english",
  "schinese",
  "tchinese",
  "japanese",
  "koreana",
  "russian",
  "french",
  "german",
  "spanish",
  "latam",
  "portuguese",
  "brazilian",
  "polish",
  "turkish",
  "thai",
  "ukrainian",
  "vietnamese",
  "italian",
  "indonesian",
  "arabic",
];

export function isDefaultFilterState(filters: SteamReviewFiltersState): boolean {
  return (
    filters.reviewType === DEFAULT_FILTERS.reviewType &&
    filters.purchaseType === DEFAULT_FILTERS.purchaseType &&
    filters.playtime === DEFAULT_FILTERS.playtime &&
    filters.language === DEFAULT_FILTERS.language
  );
}

export function SteamReviewFilterBar({
  filters,
  onChange,
  onClear,
}: Readonly<SteamReviewFilterBarProps>) {
  const { t } = useTranslation("game_details");

  const showClear = !isDefaultFilterState(filters);

  return (
    <div className="steam-review-filter-bar" role="group" aria-label={t("steam_reviews")}>
      <div className="steam-review-filter-bar__group">
        <span className="steam-review-filter-bar__label">{t("filter_review_type")}</span>
        <SegmentedControl
          options={[
            { value: "all", label: t("filter_review_type_all") },
            { value: "positive", label: t("filter_review_type_positive") },
            { value: "negative", label: t("filter_review_type_negative") },
          ]}
          value={filters.reviewType}
          onChange={(value) => onChange("reviewType", value)}
        />
      </div>

      <div className="steam-review-filter-bar__group">
        <span className="steam-review-filter-bar__label">
          {t("filter_purchase_type")}
        </span>
        <SegmentedControl
          options={[
            { value: "all", label: t("filter_purchase_type_all") },
            { value: "steam", label: t("filter_purchase_type_steam") },
          ]}
          value={filters.purchaseType}
          onChange={(value) => onChange("purchaseType", value)}
        />
      </div>

      <div className="steam-review-filter-bar__group">
        <label className="steam-review-filter-bar__label" htmlFor="steam-reviews-filter-playtime">
          {t("filter_playtime")}
        </label>
        <select
          id="steam-reviews-filter-playtime"
          className="steam-review-filter-bar__select"
          value={filters.playtime}
          onChange={(event) =>
            onChange("playtime", event.target.value as SteamReviewPlaytimePreset)
          }
        >
          <option value="any">{t("filter_playtime_any")}</option>
          <option value="over_1">{t("filter_playtime_over_1_hour")}</option>
          <option value="over_10">{t("filter_playtime_over_10_hours")}</option>
          <option value="over_100">{t("filter_playtime_over_100_hours")}</option>
        </select>
      </div>

      <div className="steam-review-filter-bar__group">
        <label className="steam-review-filter-bar__label" htmlFor="steam-reviews-filter-language">
          {t("filter_language")}
        </label>
        <select
          id="steam-reviews-filter-language"
          className="steam-review-filter-bar__select"
          value={filters.language}
          onChange={(event) =>
            onChange(
              "language",
              event.target.value as SteamReviewLanguageFilterValue
            )
          }
        >
          {LANGUAGE_VALUES.map((value) => (
            <option key={value} value={value}>
              {t(`filter_language_${value}`)}
            </option>
          ))}
        </select>
      </div>

      {showClear && (
        <button
          type="button"
          className="steam-review-filter-bar__clear"
          onClick={onClear}
        >
          {t("review_clear_filters")}
        </button>
      )}
    </div>
  );
}

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="steam-review-filter-bar__segmented" role="radiogroup">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`steam-review-filter-bar__segmented-option ${
              isActive ? "steam-review-filter-bar__segmented-option--active" : ""
            }`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
