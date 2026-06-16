import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CommentDiscussionIcon,
  PeopleIcon,
} from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import { GameReviews } from "../game-reviews";
import { useUserDetails, useLibrary } from "@renderer/hooks";
import { gameDetailsContext } from "@renderer/context";
import { SubTabBar } from "./sub-tabs/sub-tab-bar";
import { SteamReviewsTab } from "./sub-tabs/steam-reviews-tab";
import "./details-tab.scss";

type ReviewSubTabId = "steam_reviews" | "community_reviews";

const DEFAULT_STEAM_SUB_TAB: ReviewSubTabId = "steam_reviews";

function readReviewSubTab(
  params: URLSearchParams
): ReviewSubTabId | null {
  const value = params.get("reviewsTab");
  if (value === "steam_reviews" || value === "community_reviews") {
    return value;
  }
  return null;
}

export function DetailsTab() {
  const { t } = useTranslation("game_details");
  const [searchParams, setSearchParams] = useSearchParams();

  const reviewsRef = useRef<HTMLDivElement | null>(null);
  const [hasUserReviewed, setHasUserReviewed] = useState(false);

  const { shop, objectId, effectiveShop, effectiveObjectId, game } =
    useContext(gameDetailsContext);

  const { userDetails } = useUserDetails();
  const { library } = useLibrary();

  const isGameInLibrary = useMemo(() => {
    if (!library || !shop || !objectId) return false;
    return library.some(
      (libItem) => libItem.shop === shop && libItem.objectId === objectId
    );
  }, [library, shop, objectId]);

  // Steam reviews sub-tab is only shown when the effective shop is Steam.
  // Non-Steam games fall straight through to community reviews (spec §5).
  const isOnSteam = effectiveShop === "steam";

  // URL is the source of truth for the active sub-tab.
  const urlSubTab = readReviewSubTab(searchParams);
  const activeSubTab: ReviewSubTabId = isOnSteam
    ? urlSubTab ?? DEFAULT_STEAM_SUB_TAB
    : "community_reviews";

  const handleSubTabChange = (id: ReviewSubTabId) => {
    const next = new URLSearchParams(searchParams);
    if (id === DEFAULT_STEAM_SUB_TAB) {
      next.delete("reviewsTab");
    } else {
      next.set("reviewsTab", id);
    }
    setSearchParams(next, { replace: true });
  };

  // Effect 1 — URL hygiene. Keep the URL consistent with the resolved display
  // state so refreshes land cleanly and non-Steam games don't carry stale
  // `reviewsTab=steam_reviews` state. This runs before any scroll effect so
  // the ref can be relied on by the next effect.
  useEffect(() => {
    const wantsDeepLink = searchParams.get("reviews") === "true";
    const deepLinkNeedsCommunity =
      wantsDeepLink && isOnSteam && urlSubTab !== "community_reviews";

    if (!isOnSteam && searchParams.has("reviewsTab")) {
      const next = new URLSearchParams(searchParams);
      next.delete("reviewsTab");
      setSearchParams(next, { replace: true });
      return;
    }

    if (deepLinkNeedsCommunity) {
      const next = new URLSearchParams(searchParams);
      next.set("reviewsTab", "community_reviews");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnSteam, searchParams]);

  // Effect 2 — scroll-to after the URL has settled. Depends on the active
  // sub-tab so it always runs *after* `<div ref={reviewsRef}>` has mounted.
  useEffect(() => {
    if (searchParams.get("reviews") !== "true") return;
    if (activeSubTab !== "community_reviews") return;
    if (!reviewsRef.current) return;
    const timer = setTimeout(() => {
      reviewsRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab, searchParams, objectId]);

  return (
    <div className="details-tab">
      {isOnSteam && (
        <SubTabBar
          tabs={[
            {
              id: "steam_reviews",
              label: t("tab_steam_reviews"),
              icon: <CommentDiscussionIcon size={14} />,
            },
            {
              id: "community_reviews",
              label: t("tab_community_reviews"),
              icon: <PeopleIcon size={14} />,
            },
          ]}
          activeSubTab={activeSubTab}
          onSubTabChange={handleSubTabChange}
          ariaLabel={t("tab_reviews")}
        />
      )}

      {isOnSteam && activeSubTab === "steam_reviews" && <SteamReviewsTab />}

      {(activeSubTab === "community_reviews" || !isOnSteam) && (
        <div ref={reviewsRef}>
          {shop && objectId && (
            <GameReviews
              shop={effectiveShop}
              objectId={effectiveObjectId}
              game={game}
              userDetailsId={userDetails?.id}
              isGameInLibrary={isGameInLibrary}
              hasUserReviewed={hasUserReviewed}
              onUserReviewedChange={setHasUserReviewed}
            />
          )}
        </div>
      )}
    </div>
  );
}
