import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { samplesToSparklineData, ActivitySparkline } from "../../pages/game-details/activity-sparkline";
import type { HardwareSample } from "../../declaration";
import "./performance-stat-cards.scss";

export interface PerformanceStat {
  label: string;
  metric: keyof HardwareSample;
  unit: string;
  thresholds?: { warn: number; danger: number };
  inverted?: boolean;
}

const DEFAULT_STATS: PerformanceStat[] = [
  { label: "Avg FPS", metric: "fps", unit: "", thresholds: { warn: 60, danger: 30 }, inverted: true },
  { label: "CPU Usage", metric: "cpuUsage", unit: "%", thresholds: { warn: 70, danger: 90 } },
  { label: "GPU Usage", metric: "gpuUsage", unit: "%", thresholds: { warn: 70, danger: 90 } },
  { label: "CPU Temp", metric: "cpuTemp", unit: "°C", thresholds: { warn: 75, danger: 85 } },
  { label: "GPU Temp", metric: "gpuTemp", unit: "°C", thresholds: { warn: 75, danger: 85 } },
  { label: "RAM Usage", metric: "ramUsageMB", unit: "GB" },
];

export interface PerformanceStatCardsProps {
  allSamples: HardwareSample[];
}

function computeAvg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function computeMax(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.max(...arr);
}

export function PerformanceStatCards({ allSamples }: Readonly<PerformanceStatCardsProps>) {
  const { t } = useTranslation("activity");

  const stats = useMemo(() => {
    if (allSamples.length === 0) return [];

    return DEFAULT_STATS.map((stat) => {
      let values = allSamples
        .map((s) => s[stat.metric] as number)
        .filter((v) => v > 0);

      // For RAM, convert MB to GB for display
      let displayUnit = stat.unit;
      let sparklineData = samplesToSparklineData(allSamples, stat.metric);
      if (stat.metric === "ramUsageMB") {
        values = values.map((v) => Math.round((v / 1024) * 10) / 10);
        sparklineData = sparklineData.map((d) => ({
          x: d.x,
          y: Math.round((d.y / 1024) * 10) / 10,
        }));
        displayUnit = "GB";
      }

      const avg = computeAvg(values);
      const max = computeMax(values);

      return {
        ...stat,
        avg,
        max,
        unit: displayUnit,
        data: sparklineData,
      };
    });
  }, [allSamples]);

  if (stats.length === 0 || allSamples.length === 0) {
    return (
      <div className="performance-stat-cards">
        <div className="performance-stat-cards__empty">
          {t("no_performance_data") || "No performance data available yet."}
        </div>
      </div>
    );
  }

  return (
    <div className="performance-stat-cards">
      {stats.map((stat) => (
        <div key={stat.label} className="performance-stat-cards__card">
          <span className="performance-stat-cards__label">
            {t(stat.label.toLowerCase().replace(" ", "_")) || stat.label}
          </span>
          <div className="performance-stat-cards__sparkline">
            <ActivitySparkline
              data={stat.data}
              label=""
              unit={stat.unit}
              value={stat.avg}
              max={stat.max}
              thresholds={stat.thresholds}
              inverted={stat.inverted}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
