import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { HardwareSample } from "../../declaration";
import { useTranslation } from "react-i18next";
import "./combined-line-chart.scss";

export interface MetricSeries {
  id: string;
  color: string;
  /** Which sample field to read */
  field: keyof HardwareSample;
}

export interface CombinedLineChartProps {
  /** All sessions' samples to overlay */
  samples: HardwareSample[][];
  /** Labels for each session (e.g., ["Jan 15, 3:00 PM", "Jan 14, 8:00 PM"]) */
  sessionLabels: string[];
  /** Duration of each session in ms (for X-axis time mapping) */
  sessionDurations: number[];
  /** Which metrics to plot */
  series: MetricSeries[];
  /** Chart height */
  height?: number;
  /** Which session to isolate (null = all sessions) */
  isolatedSessionIndex?: number | null;
  /** Y-axis min/max override */
  yMin?: number;
  yMax?: number;
  /** Y-axis label/unit suffix */
  yAxisLabel?: string;
}

function formatTimeTick(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

const MAX_POINTS = 60;

export function CombinedLineChart({
  samples,
  sessionLabels,
  sessionDurations,
  series,
  height = 220,
  isolatedSessionIndex,
  yMin,
  yMax,
  yAxisLabel,
}: Readonly<CombinedLineChartProps>) {
  const { t } = useTranslation("activity");

  // Determine active session indices to plot
  const activeSessionIndices = useMemo(() => {
    if (isolatedSessionIndex !== undefined && isolatedSessionIndex !== null) {
      return [isolatedSessionIndex];
    }
    return samples.map((_, i) => i);
  }, [samples, isolatedSessionIndex]);

  const isMultiple = activeSessionIndices.length > 1 && samples.length > 1;

  // Construct unified data array downsampled to exactly MAX_POINTS points
  const chartData = useMemo(() => {
    // 1. Downsample/interpolate every active session to exactly MAX_POINTS
    const sessionData = activeSessionIndices
      .map((sessionIdx) => {
        const sessionSamples = samples[sessionIdx];
        const duration = sessionDurations[sessionIdx] ?? 0;
        if (!sessionSamples || sessionSamples.length === 0) {
          return null;
        }

        const interpolated: HardwareSample[] = [];
        for (let i = 0; i < MAX_POINTS; i++) {
          const sampleIdx = Math.min(
            sessionSamples.length - 1,
            Math.round((i / (MAX_POINTS - 1)) * (sessionSamples.length - 1))
          );
          interpolated.push(sessionSamples[sampleIdx]);
        }
        return {
          sessionIdx,
          samples: interpolated,
          duration,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    if (sessionData.length === 0) return [];

    const points: Record<string, any>[] = [];

    for (let i = 0; i < MAX_POINTS; i++) {
      const progressPercent = Math.round((i / (MAX_POINTS - 1)) * 100);
      const pointObj: Record<string, any> = {
        progressPercent,
        elapsedSeconds:
          sessionData.length === 1
            ? Math.round((i / (MAX_POINTS - 1)) * (sessionData[0].duration / 1000))
            : 0,
      };

      for (const s of series) {
        for (const data of sessionData) {
          const sample = data.samples[i];
          if (!sample) continue;

          let val = (sample[s.field] as number) || 0;
          if (s.field === "ramUsageMB") {
            val = Math.round((val / 1024) * 10) / 10;
          }

          const lineKey = `${s.id}_${data.sessionIdx}`;
          pointObj[lineKey] = val;

          const elapsedSec = Math.round(
            (i / (MAX_POINTS - 1)) * (data.duration / 1000)
          );
          pointObj[`elapsedSeconds_${data.sessionIdx}`] = elapsedSec;
        }
      }
      points.push(pointObj);
    }

    return points;
  }, [samples, sessionDurations, series, activeSessionIndices]);

  // Helper to determine line color based on session order
  const getLineColor = (s: MetricSeries, sessionIdx: number) => {
    if (isolatedSessionIndex !== undefined && isolatedSessionIndex !== null) {
      return s.color;
    }
    if (samples.length <= 1 || sessionIdx === 0) {
      return s.color;
    }
    return s.color + "73"; // Appends ~45% opacity to trailing session lines
  };

  // Custom tooltips
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="combined-line-chart__tooltip">
        <div className="combined-line-chart__tooltip-time">
          {isMultiple
            ? `${t("session_progress", "Session Progress")}: ${label}%`
            : `${t("elapsed_time", "Elapsed Time")}: ${formatTimeTick(label)}`}
        </div>
        <div className="combined-line-chart__tooltip-items">
          {payload.map((item: any) => {
            let elapsedStr = "";
            if (isMultiple) {
              const parts = item.dataKey.split("_");
              const sessionIdx = parts[parts.length - 1];
              const sec = item.payload[`elapsedSeconds_${sessionIdx}`];
              if (typeof sec === "number") {
                elapsedStr = ` (at ${formatTimeTick(sec)})`;
              }
            }

            return (
              <div
                key={item.name}
                className="combined-line-chart__tooltip-item"
              >
                <span
                  className="combined-line-chart__tooltip-color-indicator"
                  style={{ backgroundColor: item.stroke }}
                />
                <span className="combined-line-chart__tooltip-item-name">
                  {item.name}:
                </span>
                <span className="combined-line-chart__tooltip-item-value">
                  {item.value}
                  {yAxisLabel ?? ""}
                  {elapsedStr}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="combined-line-chart">
      <div className="combined-line-chart__container" style={{ height }}>
        {chartData.length === 0 ? (
          <div className="combined-line-chart__empty">
            {t("no_performance_data") || "No performance data available yet."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{
                top: 12,
                right: 20,
                bottom: 5,
                left: -10,
              }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(255,255,255,0.05)"
              />
              <XAxis
                type="number"
                dataKey={isMultiple ? "progressPercent" : "elapsedSeconds"}
                tickFormatter={isMultiple ? (v) => `${v}%` : formatTimeTick}
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                tickLine={false}
                axisLine={false}
                domain={isMultiple ? [0, 100] : [0, "auto"]}
              />
              <YAxis
                domain={[yMin ?? "auto", yMax ?? "auto"]}
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                tickLine={false}
                axisLine={false}
                width={45}
                tickFormatter={(v) => `${v}${yAxisLabel ?? ""}`}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  stroke: "rgba(255,255,255,0.15)",
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                }}
              />
              {series.flatMap((s) =>
                activeSessionIndices.map((sessionIdx) => {
                  const lineKey = `${s.id}_${sessionIdx}`;

                  let translationKey = s.id
                    .toLowerCase()
                    .replace(" & ", "_")
                    .replace(" ", "_");
                  if (translationKey === "ram") translationKey = "ram_usage";
                  if (translationKey === "fps") translationKey = "avg_fps";

                  const translatedId = t(translationKey, s.id);

                  const label =
                    activeSessionIndices.length > 1 && samples.length > 1
                      ? `${translatedId} (${sessionLabels[sessionIdx]})`
                      : translatedId;

                  return (
                    <Line
                      key={lineKey}
                      type="monotone"
                      dataKey={lineKey}
                      name={label}
                      stroke={getLineColor(s, sessionIdx)}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      connectNulls={true}
                    />
                  );
                })
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
