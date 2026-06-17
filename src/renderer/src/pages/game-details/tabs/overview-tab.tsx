import { useContext } from "react";
import { gameDetailsContext } from "@renderer/context";
import { PlayStatusCard } from "../dashboard-cards/play-status-card";
import { StatsCard } from "../dashboard-cards/stats-card";
import { HowLongToBeatCard } from "../dashboard-cards/how-long-to-beat-card";
import { DescriptionCard } from "../dashboard-cards/description-card";
import { GalleryCard } from "../dashboard-cards/gallery-card";
import { MetadataChipsRow } from "../dashboard-cards/metadata-chips-row";
import { SystemRequirementsCard } from "../widgets/system-requirements-card";
import { AchievementsOverview } from "../widgets/achievements-overview";
import { SimilarGames } from "../similar-games/similar-games";
import "./overview-tab.scss";
import "../widgets/system-requirements-card.scss";
import "../widgets/achievements-overview.scss";

export function OverviewTab() {
  const { effectiveObjectId, effectiveShop } = useContext(gameDetailsContext);

  return (
    <div className="overview-tab">
      <MetadataChipsRow />

      <div className="overview-tab__dashboard-grid">
        <PlayStatusCard />
        <StatsCard />
        <HowLongToBeatCard />
        <div className="overview-tab__full-width">
          <DescriptionCard />
        </div>
        <div className="overview-tab__full-width overview-tab__widgets-row">
          <SystemRequirementsCard />
          <AchievementsOverview />
        </div>
        <div className="overview-tab__full-width">
          <GalleryCard />
        </div>
      </div>

      <SimilarGames shop={effectiveShop} objectId={effectiveObjectId} />
    </div>
  );
}
