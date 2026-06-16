import { useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { GameReviews } from "../game-reviews";
import { useUserDetails, useLibrary } from "@renderer/hooks";
import { useContext, useEffect, useMemo, useState } from "react";
import { gameDetailsContext } from "@renderer/context";
import "./details-tab.scss";

export function DetailsTab() {
  const [searchParams] = useSearchParams();
  const reviewsRef = useRef<HTMLDivElement>(null);
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

  // Scroll to reviews section if reviews=true in URL
  useEffect(() => {
    const shouldScrollToReviews = searchParams.get("reviews") === "true";
    if (shouldScrollToReviews && reviewsRef.current) {
      setTimeout(() => {
        reviewsRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 500);
    }
  }, [searchParams, objectId]);

  return (
    <div className="details-tab">
      {shop && objectId && (
        <div ref={reviewsRef}>
          <GameReviews
            shop={effectiveShop}
            objectId={effectiveObjectId}
            game={game}
            userDetailsId={userDetails?.id}
            isGameInLibrary={isGameInLibrary}
            hasUserReviewed={hasUserReviewed}
            onUserReviewedChange={setHasUserReviewed}
          />
        </div>
      )}
    </div>
  );
}
