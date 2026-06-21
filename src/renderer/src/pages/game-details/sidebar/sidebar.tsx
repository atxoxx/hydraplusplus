import { lazy, Suspense, useContext, useEffect, useState } from "react";
import type { CrackWatchStatus, ProtonDBData } from "@types";
import { gameDetailsContext } from "@renderer/context";
import { CrackWatchSection } from "./crackwatch-section";
import { LaunchboxDetailsSection } from "./launchbox-details-section";
import "./sidebar.scss";
import { GameLanguageSection } from "./game-language-section";
import { ControllerSupportSection } from "./controller-support-section";
import { SteamRatingSection } from "./steam-rating-section";
import { SteamReviewModal } from "../modals/steam-review-modal";
import type { GameTabId } from "../tabs/tab-bar";

const ProtonDBSection = lazy(async () => {
  const mod = await import("./protondb-section");
  return { default: mod.ProtonDBSection };
});

const protonDBResponseCache = new Map<string, ProtonDBData | null>();
const protonDBInFlightRequests = new Map<
  string,
  Promise<ProtonDBData | null>
>();

const getProtonDBData = (shop: string, objectId: string) => {
  const cacheKey = `${shop}:${objectId}`;

  if (protonDBResponseCache.has(cacheKey)) {
    return Promise.resolve(protonDBResponseCache.get(cacheKey) ?? null);
  }

  const inFlightRequest = protonDBInFlightRequests.get(cacheKey);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const request = window.electron.hydraApi
    .get<ProtonDBData | null>(`/games/${shop}/${objectId}/protondb`, {
      needsAuth: false,
    })
    .then((protonData) => {
      protonDBResponseCache.set(cacheKey, protonData);
      return protonData;
    })
    .catch(() => null)
    .finally(() => {
      protonDBInFlightRequests.delete(cacheKey);
    });

  protonDBInFlightRequests.set(cacheKey, request);
  return request;
};

export function Sidebar({ activeTab }: Readonly<{ activeTab: GameTabId }>) {
  const shouldShowProtonFeatures = window.electron.platform === "linux";
  const [protonDB, setProtonDB] = useState<{
    isLoading: boolean;
    data: ProtonDBData | null;
  }>({ isLoading: shouldShowProtonFeatures, data: null });
  const [crackwatch, setCrackwatch] = useState<{
    isLoading: boolean;
    data: CrackWatchStatus | null;
  }>({ isLoading: true, data: null });

  const {
    gameTitle,
    shopDetails,
    objectId,
    shop,
    effectiveShop,
    effectiveObjectId,
  } = useContext(gameDetailsContext);

  const [showSteamReviewModal, setShowSteamReviewModal] = useState(false);

  useEffect(() => {
    if (!shouldShowProtonFeatures || !effectiveObjectId) {
      setProtonDB({ isLoading: false, data: null });
      return;
    }

    setProtonDB({ isLoading: true, data: null });

    getProtonDBData(effectiveShop, effectiveObjectId)
      .then((protonData) => {
        setProtonDB({ isLoading: false, data: protonData });
      })
      .catch(() => {
        setProtonDB({ isLoading: false, data: null });
      });
  }, [shouldShowProtonFeatures, effectiveObjectId, effectiveShop]);

  useEffect(() => {
    if (!objectId || shop !== "steam" || !gameTitle) {
      setCrackwatch({ isLoading: false, data: null });
      return;
    }

    setCrackwatch({ isLoading: true, data: null });

    window.electron
      .getCrackWatchStatus(objectId, shop, gameTitle)
      .then((data) => {
        setCrackwatch({ isLoading: false, data });
      })
      .catch(() => {
        setCrackwatch({ isLoading: false, data: null });
      });
  }, [objectId, shop, gameTitle]);

  return (
    <aside className="content-sidebar">
      {/* Overview tab: all sidebar sections */}
      {activeTab === "overview" && (
        <>
          {shouldShowProtonFeatures && (
            <Suspense fallback={null}>
              <ProtonDBSection
                protonDBData={protonDB.data}
                isLoading={protonDB.isLoading}
                objectId={objectId ?? ""}
              />
            </Suspense>
          )}

          <CrackWatchSection
            data={crackwatch.data}
            isLoading={crackwatch.isLoading}
          />

          <ControllerSupportSection />

          {shop === "launchbox" && (
            <LaunchboxDetailsSection
              platform={shopDetails?.platform}
              genres={shopDetails?.genres?.map((g) => g.name)}
              skus={shopDetails?.skus}
            />
          )}

          <SteamRatingSection
            onOpenDetails={() => setShowSteamReviewModal(true)}
          />

          <GameLanguageSection />
        </>
      )}

      {activeTab === "overview" && (
        <SteamReviewModal
          visible={showSteamReviewModal}
          onClose={() => setShowSteamReviewModal(false)}
        />
      )}
    </aside>
  );
}
