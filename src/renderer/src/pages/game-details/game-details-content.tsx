import { useContext, useEffect, useState } from "react";
import { PencilIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";

import { HeroPlayerCounter } from "./hero/hero-player-counter";
import { HeroBackdrop } from "./hero/hero-backdrop";
import { Sidebar } from "./sidebar/sidebar";
import { GameLogo } from "./game-logo";
import { TabBar } from "./tabs/tab-bar";
import type { GameTabId } from "./tabs/tab-bar";
import { OverviewTab } from "./tabs/overview-tab";
import { DetailsTab } from "./tabs/details-tab";
import { ActivityTab } from "./tabs/activity-tab";
import { AchievementsTab } from "./tabs/achievements-tab";
import { WeblinksTab } from "./tabs/weblinks-tab";

import { AuthPage } from "@shared";
import { cloudSyncContext, gameDetailsContext } from "@renderer/context";

import cloudIconAnimated from "@renderer/assets/icons/cloud-animated.gif";
import { useUserDetails } from "@renderer/hooks";
import "./game-details.scss";
import "./hero.scss";
import "./hero/hero-backdrop.scss";

export function GameDetailsContent() {
  const { t } = useTranslation("game_details");
  const [activeTab, setActiveTab] = useState<GameTabId>("overview");

  const {
    shopDetails,
    game,
    hasNSFWContentBlocked,
    effectiveShop,
    setShowGameOptionsModal,
    setGameOptionsInitialCategory,
  } = useContext(gameDetailsContext);

  const { userDetails, hasActiveSubscription } = useUserDetails();
  const { getGameArtifacts } = useContext(cloudSyncContext);

  const handleCloudSaveButtonClick = () => {
    if (!userDetails) {
      window.electron.openAuthWindow(AuthPage.SignIn);
      return;
    }

    if (!hasActiveSubscription) {
      setGameOptionsInitialCategory("hydra_cloud");
      setShowGameOptionsModal(true);
      return;
    }

    setGameOptionsInitialCategory("hydra_cloud");
    setShowGameOptionsModal(true);
  };

  const handleEditGameClick = () => {
    setGameOptionsInitialCategory("metadata");
    setShowGameOptionsModal(true);
  };

  useEffect(() => {
    getGameArtifacts();
  }, [getGameArtifacts]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab />;
      case "reviews":
        return <DetailsTab />;
      case "activity":
        return <ActivityTab />;
      case "achievements":
        return <AchievementsTab />;
      case "weblinks":
        return <WeblinksTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <div
      className={`game-details__wrapper ${hasNSFWContentBlocked ? "game-details__wrapper--blurred" : ""}`}
    >
      <section className="game-details__container">
        <div className="game-details__hero">
          <HeroBackdrop />

          <div className="game-details__hero-logo-backdrop">
            <HeroPlayerCounter />

            <div className="game-details__hero-content">
              <GameLogo game={game} shopDetails={shopDetails} />

              <div className="game-details__hero-buttons game-details__hero-buttons--right">
                {game && (
                  <button
                    type="button"
                    className="game-details__edit-custom-game-button"
                    onClick={handleEditGameClick}
                    title={t("edit_game_modal_button")}
                  >
                    <PencilIcon size={16} />
                  </button>
                )}

                {game && game.shop !== "custom" && (
                  <button
                    type="button"
                    className="game-details__cloud-sync-button"
                    onClick={handleCloudSaveButtonClick}
                  >
                    <div className="game-details__cloud-icon-container">
                      <img
                        src={cloudIconAnimated}
                        alt=""
                        className="game-details__cloud-icon"
                      />
                    </div>
                    {t("cloud_save")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab Content + Sidebar */}
        <div className="game-details__description-container">
          <div className="game-details__description-content">
            {renderTabContent()}
          </div>

          {effectiveShop !== "custom" &&
            activeTab !== "weblinks" &&
            activeTab !== "achievements" &&
            activeTab !== "reviews" &&
            activeTab !== "activity" && <Sidebar activeTab={activeTab} />}
        </div>
      </section>
    </div>
  );
}
