import { useTranslation } from "react-i18next";
import "./sub-tab-bar.scss";

export interface SubTab<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface SubTabBarProps<T extends string = string> {
  tabs: SubTab<T>[];
  activeSubTab: T;
  onSubTabChange: (id: T) => void;
  /** Falls back to `t("sub_tabs_aria_label")` when omitted. */
  ariaLabel?: string;
}

export function SubTabBar<T extends string = string>({
  tabs,
  activeSubTab,
  onSubTabChange,
  ariaLabel,
}: Readonly<SubTabBarProps<T>>) {
  const { t } = useTranslation("game_details");
  const resolvedAriaLabel = ariaLabel ?? t("sub_tabs_aria_label");

  return (
    <div
      className="sub-tab-bar"
      role="tablist"
      aria-label={resolvedAriaLabel}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`sub-tab-bar__tab ${
            activeSubTab === tab.id ? "sub-tab-bar__tab--active" : ""
          }`}
          onClick={() => onSubTabChange(tab.id)}
          role="tab"
          aria-selected={activeSubTab === tab.id}
        >
          {tab.icon && <span className="sub-tab-bar__tab-icon">{tab.icon}</span>}
          <span className="sub-tab-bar__tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
