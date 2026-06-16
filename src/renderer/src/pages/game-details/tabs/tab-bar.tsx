import { useTranslation } from "react-i18next";
import {
  CommentDiscussionIcon,
  GraphIcon,
  InfoIcon,
  LinkExternalIcon,
  TrophyIcon,
} from "@primer/octicons-react";
import "./tab-bar.scss";

export type GameTabId =
  | "overview"
  | "reviews"
  | "activity"
  | "achievements"
  | "weblinks";

export interface GameTab {
  id: GameTabId;
  label: string;
  icon: React.ReactNode;
}

export interface TabBarProps {
  activeTab: GameTabId;
  onTabChange: (tab: GameTabId) => void;
}

export function TabBar({ activeTab, onTabChange }: Readonly<TabBarProps>) {
  const { t } = useTranslation("game_details");

  const tabs: GameTab[] = [
    {
      id: "overview",
      label: t("tab_overview"),
      icon: <InfoIcon size={14} />,
    },
    {
      id: "reviews",
      label: t("tab_reviews"),
      icon: <CommentDiscussionIcon size={14} />,
    },
    {
      id: "activity",
      label: t("tab_activity"),
      icon: <GraphIcon size={14} />,
    },
    {
      id: "achievements",
      label: t("tab_achievements"),
      icon: <TrophyIcon size={14} />,
    },
    {
      id: "weblinks",
      label: t("tab_weblinks"),
      icon: <LinkExternalIcon size={14} />,
    },
  ];

  return (
    <div className="tab-bar" role="tablist" aria-label={t("game_page_tabs")}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab-bar__tab ${activeTab === tab.id ? "tab-bar__tab--active" : ""}`}
          onClick={() => onTabChange(tab.id)}
          role="tab"
          aria-selected={activeTab === tab.id}
        >
          <span className="tab-bar__tab-icon">{tab.icon}</span>
          <span className="tab-bar__tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
