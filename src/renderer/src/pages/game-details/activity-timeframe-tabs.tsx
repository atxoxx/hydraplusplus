import { useTranslation } from "react-i18next";
import "./activity-timeframe-tabs.scss";

export type Timeframe = "7d" | "30d" | "90d" | "all";

export interface ActivityTimeframeTabsProps {
  active: Timeframe;
  onChange: (timeframe: Timeframe) => void;
}

const TIMEFRAMES: { id: Timeframe; labelKey: string; days: number }[] = [
  { id: "7d", labelKey: "timeframe_7d", days: 7 },
  { id: "30d", labelKey: "timeframe_30d", days: 30 },
  { id: "90d", labelKey: "timeframe_90d", days: 90 },
  { id: "all", labelKey: "timeframe_all", days: 0 },
];

export function ActivityTimeframeTabs({
  active,
  onChange,
}: Readonly<ActivityTimeframeTabsProps>) {
  const { t } = useTranslation("activity");

  return (
    <div className="activity-timeframe-tabs">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf.id}
          type="button"
          className={`activity-timeframe-tabs__tab ${active === tf.id ? "activity-timeframe-tabs__tab--active" : ""}`}
          onClick={() => onChange(tf.id)}
        >
          {t(tf.labelKey)}
        </button>
      ))}
    </div>
  );
}

export function getTimeframeDays(timeframe: Timeframe): number {
  return TIMEFRAMES.find((t) => t.id === timeframe)?.days ?? 0;
}
