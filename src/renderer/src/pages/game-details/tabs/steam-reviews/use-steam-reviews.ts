import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GameShop,
  SteamReview,
  SteamReviewSortFilter,
  SteamReviewTypeFilter,
  SteamReviewPurchaseTypeFilter,
  SteamReviewLanguageFilter,
} from "@types";

/** Compact filter shape consumed by the hook; playtime is already in minutes. */
export interface SteamReviewsFetchFilters {
  filter: SteamReviewSortFilter;
  reviewType: SteamReviewTypeFilter;
  purchaseType: SteamReviewPurchaseTypeFilter;
  language: SteamReviewLanguageFilter;
  playtimeMinMinutes: number;
  playtimeMaxMinutes: number;
}

const DEFAULT_NUM_PER_PAGE = 20;

interface UseSteamReviewsOpts {
  shop: GameShop | null | undefined;
  objectId: string | null | undefined;
  gameTitle: string;
  filters: SteamReviewsFetchFilters;
  /** Page size; the Steam API caps at 100. */
  numPerPage?: number;
}

interface UseSteamReviewsResult {
  reviews: SteamReview[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  hasError: boolean;
  loadMore: () => void;
  reload: () => void;
}

interface InternalState {
  reviews: SteamReview[];
  cursor: string;
  totalReviews: number | null;
  hasError: boolean;
}

const INITIAL_STATE: InternalState = {
  reviews: [],
  cursor: "*",
  totalReviews: null,
  hasError: false,
};

/**
 * Cursor-based infinite-scroll hook for Steam reviews. Designed for the
 * Playnite-ReviewViewer parity list rendering. Cancels any in-flight request
 * when filters change or the consumer unmounts.
 */
export function useSteamReviews({
  shop,
  objectId,
  gameTitle,
  filters,
  numPerPage = DEFAULT_NUM_PER_PAGE,
}: Readonly<UseSteamReviewsOpts>): UseSteamReviewsResult {
  const [state, setState] = useState<InternalState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Latest filter snapshot for stable dependency comparison.
  const filterKey =
    `${filters.filter}|${filters.reviewType}|${filters.purchaseType}|` +
    `${filters.language}|${filters.playtimeMinMinutes}|${filters.playtimeMaxMinutes}|` +
    `${numPerPage}`;

  const filterKeyRef = useRef(filterKey);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (
      cursor: string,
      mode: "initial" | "more"
    ): Promise<{ reviews: SteamReview[]; nextCursor: string } | null> => {
      // Without a response target, no fetch is possible; bail out cleanly.
      if (!shop || !objectId) {
        if (mode === "initial") {
          setState({ ...INITIAL_STATE, hasError: true });
        }
        return null;
      }

      // Tear down any in-flight request before issuing a new one.
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const page = await window.electron.getSteamReviews(
          shop,
          objectId,
          gameTitle,
          {
            cursor,
            filter: filters.filter,
            reviewType: filters.reviewType,
            purchaseType: filters.purchaseType,
            language: filters.language,
            playtimeMinMinutes: filters.playtimeMinMinutes,
            playtimeMaxMinutes: filters.playtimeMaxMinutes,
            numPerPage,
          }
        );
        if (controller.signal.aborted || filterKeyRef.current !== filterKey) {
          return null;
        }

        if (!page) {
          setState((prev) => ({ ...prev, hasError: true }));
          return null;
        }

        const reachedEnd =
          !page.cursor ||
          page.cursor === "" ||
          page.reviews.length < numPerPage;

        setState((prev) => {
          if (mode === "initial") {
            return {
              reviews: page.reviews,
              cursor: reachedEnd ? "" : page.cursor,
              totalReviews: page.query_summary?.total_reviews ?? null,
              hasError: false,
            };
          }
          return {
            ...prev,
            reviews: [...prev.reviews, ...page.reviews],
            cursor: reachedEnd ? "" : page.cursor,
            totalReviews: page.query_summary?.total_reviews ?? prev.totalReviews,
            hasError: false,
          };
        });

        return { reviews: page.reviews, nextCursor: page.cursor };
      } catch (err) {
        if (controller.signal.aborted) return null;
        // eslint-disable-next-line no-console
        console.error("Failed to fetch Steam reviews page", err);
        setState((prev) => ({ ...prev, hasError: true }));
        return null;
      } finally {
        if (controller === abortRef.current) {
          abortRef.current = null;
        }
      }
    },
    [shop, objectId, gameTitle, filters, numPerPage, filterKey]
  );

  // Initial fetch / reset on filter or game change.
  useEffect(() => {
    filterKeyRef.current = filterKey;
    setState(INITIAL_STATE);
    setIsLoading(true);

    fetchPage("*", "initial").finally(() => {
      if (filterKeyRef.current === filterKey) {
        setIsLoading(false);
      }
    });

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
    // We intentionally depend on filterKey (composed string) and the build
    // identity of fetchPage, so this only runs when the user changes a filter
    // or navigates to a different game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, shop, objectId, gameTitle]);

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore) return;
    if (!state.cursor) return;
    setIsLoadingMore(true);
    fetchPage(state.cursor, "more").finally(() => {
      setIsLoadingMore(false);
    });
  }, [state.cursor, isLoading, isLoadingMore, fetchPage]);

  const reload = useCallback(() => {
    filterKeyRef.current = filterKey;
    setState(INITIAL_STATE);
    setIsLoading(true);
    fetchPage("*", "initial").finally(() => {
      if (filterKeyRef.current === filterKey) {
        setIsLoading(false);
      }
    });
  }, [fetchPage, filterKey]);

  return {
    reviews: state.reviews,
    isLoading,
    isLoadingMore,
    hasMore: Boolean(state.cursor),
    hasError: state.hasError && !isLoading,
    loadMore,
    reload,
  };
}
