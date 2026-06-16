import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import {
  CommentDiscussionIcon,
  ClockIcon,
  SunIcon,
} from "@primer/octicons-react";
import Skeleton from "react-loading-skeleton";
import type {
  GameShop,
  SteamReviewSummary,
  SteamReviewSortFilter,
  SteamReviewTypeFilter,
} from "@types";
import { gameDetailsContext } from "@renderer/context";
import { SteamReviewSummaryBanner } from "../steam-reviews/steam-review-summary-banner";
import {
  SteamReviewCard,
} from "../steam-reviews/steam-review-card";
import {
  SteamReviewFilterBar,
  DEFAULT_FILTERS,
  getPlaytimeMinutes,
  type SteamReviewFiltersState,
} from "../steam-reviews/steam-review-filter-bar";
import { useSteamReviews } from "../steam-reviews/use-steam-reviews";
import { SubTabBar } from "./sub-tab-bar";
import "./steam-reviews-tab.scss";

type SteamReviewsSortTab = SteamReviewSortFilter;

interface SteamReviewsSortTabDef {
  id: SteamReviewsSortTab;
  labelKey: string;
}

const SORT_TABS: SteamReviewsSortTabDef[] = [
  { id: "all", labelKey: "sort_most_helpful" },
  { id: "recent", labelKey: "sort_recent" },
  { id: "funny", labelKey: "sort_funny" },
];

/**
 * Map our UI `reviewType` value to Steam's `review_type` enum. They're the
 * same set today, but the indirection keeps a future split cheap.
 */
function toSteamReviewType(
  value: SteamReviewFiltersState["reviewType"]
): SteamReviewTypeFilter {
  return value;
}

function toSteamPurchaseType(
  value: SteamReviewFiltersState["purchaseType"]
): "all" | "steam" {
  return value === "steam" ? "steam" : "all";
}

/**
 * Steam Reviews sub-tab — Playnite ReviewViewer parity.
 * Summary banner + filter chips + sub-sort tabs + cursor-paginated card list
 * with an IntersectionObserver sentinel for infinite scroll.
 */
export function SteamReviewsTab() {
  const { t } = useTranslation("game_details");
  const { shop, objectId, gameTitle } = useContext(gameDetailsContext);

  /* ----- summary ----- */
  const [summary, setSummary] = useState<SteamReviewSummary | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [hasSummaryError, setHasSummaryError] = useState(false);

  /* ----- filter / sort state ----- */
  const [activeSortTab, setActiveSortTab] =
    useState<SteamReviewsSortTab>("all");
  const [filters, setFilters] =
    useState<SteamReviewFiltersState>(DEFAULT_FILTERS);

  /* ----- list data (cursor pagination) ----- */
  const playtimeMinutes = useMemo(() => getPlaytimeMinutes(filters.playtime), [
    filters.playtime,
  ]);

  const sortFilterForHook: SteamReviewSortFilter = activeSortTab; // "all" | "recent" | "funny"
  // Steam requires numeric dayRange for recent reviews; default to 30 days.
  const dayRange = activeSortTab === "recent" ? 30 : undefined;

  const { reviews, isLoading, isLoadingMore, hasMore, hasError, loadMore, reload } =
    useSteamReviewsExtended({
      shop,
      objectId,
      gameTitle,
      sortFilter: sortFilterForHook,
      reviewType: toSteamReviewType(filters.reviewType),
      purchaseType: toSteamPurchaseType(filters.purchaseType),
      language: filters.language,
      playtimeMinMinutes: playtimeMinutes.min,
      playtimeMaxMinutes: playtimeMinutes.max,
      dayRange,
    });

  /* ----- summary fetch ----- */
  useEffect(() => {
    setSummary(null);
    setIsSummaryLoading(true);
    setHasSummaryError(false);

    if (!objectId || !shop) {
      setIsSummaryLoading(false);
      setHasSummaryError(true);
      return;
    }

    let cancelled = false;

    window.electron
      .getSteamReviewSummary(shop, objectId, gameTitle)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setSummary(result);
        } else {
          setHasSummaryError(true);
        }
        setIsSummaryLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setHasSummaryError(true);
        setIsSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [shop, objectId, gameTitle]);

  const handleFilterChange = useCallback(
    <K extends keyof SteamReviewFiltersState>(
      key: K,
      value: SteamReviewFiltersState[K]
    ) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  /* ----- infinite-scroll sentinel (IntersectionObserver) ----- */
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          loadMore();
        }
      },
      { rootMargin: "320px 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isLoading, loadMore]);

  const sortTabs = SORT_TABS.map((tab) => ({
    id: tab.id,
    label: t(tab.labelKey),
  }));

  /* Render sub-sort tab icons by id (avoids inline JSX in array literal) */
  const iconForSort = (id: SteamReviewsSortTab) => {
    switch (id) {
      case "all":
        return <CommentDiscussionIcon size={14} />;
      case "recent":
        return <ClockIcon size={14} />;
      case "funny":
        return <SunIcon size={14} />;
    }
  };
  const sortTabsForRender = sortTabs.map((tab) => ({
    ...tab,
    icon: iconForSort(tab.id),
  }));

  return (
    <div className="steam-reviews-tab">
      <SteamReviewSummaryBanner
        summary={summary}
        isLoading={isSummaryLoading}
        hasError={hasSummaryError}
      />

      <SubTabBar
        tabs={sortTabsForRender}
        activeSubTab={activeSortTab}
        onSubTabChange={setActiveSortTab}
        ariaLabel={t("steam_reviews")}
      />

      <SteamReviewFilterBar
        filters={filters}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
      />

      <div className="steam-reviews-tab__list">
        {isLoading && reviews.length === 0 && (
          <div className="steam-reviews-tab__skeletons">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`steam-review-skeleton-${index}`}
                className="steam-reviews-tab__skeleton-card"
              >
                <Skeleton height={20} width="35%" />
                <Skeleton height={14} width="55%" />
                <Skeleton height={14} width="80%" />
                <Skeleton count={3} />
              </div>
            ))}
          </div>
        )}

        {hasError && !isLoading && reviews.length === 0 && (
          <div className="steam-reviews-tab__empty">
            <p>{t("review_load_failed")}</p>
            <button
              type="button"
              className="steam-reviews-tab__retry"
              onClick={reload}
            >
              {t("review_load_again")}
            </button>
          </div>
        )}

        {!isLoading && !hasError && reviews.length === 0 && (
          <div className="steam-reviews-tab__empty">
            <p>{t("review_no_results")}</p>
          </div>
        )}

        {reviews.length > 0 && (
          <div className="steam-reviews-tab__cards">
            {reviews.map((review) => (
              <SteamReviewCard
                key={review.recommendationid}
                review={review}
              />
            ))}
          </div>
        )}

        <div
          ref={sentinelRef}
          className="steam-reviews-tab__sentinel"
          aria-hidden="true"
        />

        {isLoadingMore && (
          <div className="steam-reviews-tab__more-indicator">
            <Skeleton height={20} width="60%" />
            <Skeleton height={14} width="40%" />
          </div>
        )}

        {!hasMore && reviews.length > 0 && !isLoadingMore && (
          <div className="steam-reviews-tab__end">
            {t("review_list_end")}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Thin wrapper that maps our UI sort tab + dayRange to the hook's filter set.
 */
function useSteamReviewsExtended(args: {
  shop: GameShop | null | undefined;
  objectId: string | null | undefined;
  gameTitle: string;
  sortFilter: SteamReviewSortFilter;
  reviewType: SteamReviewTypeFilter;
  purchaseType: "all" | "steam";
  language: SteamReviewFiltersState["language"];
  playtimeMinMinutes: number;
  playtimeMaxMinutes: number;
  dayRange?: number;
}) {
  return useSteamReviews({
    shop: args.shop,
    objectId: args.objectId,
    gameTitle: args.gameTitle,
    filters: {
      filter: args.sortFilter,
      reviewType: args.reviewType,
      purchaseType: args.purchaseType,
      language: args.language,
      playtimeMinMinutes: args.playtimeMinMinutes,
      playtimeMaxMinutes: args.playtimeMaxMinutes,
    },
    numPerPage: 20,
  });
}
