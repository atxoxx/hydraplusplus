import { useMemo } from "react";
import { ResponsiveLine } from "@nivo/line";
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
  /** Left Y-axis label */
  yAxisLabel?: string;
  /** Right Y-axis label (for dual-axis charts) */
  yAxisRightLabel?: string;
  /** Series that should use the right Y-axis */
  rightAxisSeries?: string[];
}

function formatSessionTime(
  sampleIndex: number,
  totalSamples: number,
  durationMs: number
): string {
  const elapsedMs = (sampleIndex / Math.max(1, totalSamples - 1)) * durationMs;
  const totalSeconds = Math.round(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const MAX_POINTS = 80;

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
  rightAxisSeries = [],
}: Readonly<CombinedLineChartProps>) {
  const { t } = useTranslation("activity");

  const chartData = useMemo(() => {
    const sessionIndices =
      isolatedSessionIndex !== undefined && isolatedSessionIndex !== null
        ? [isolatedSessionIndex]
        : samples.map((_, i) => i);

    const result: { id: string; data: { x: string; y: number }[] }[] = [];

    for (const s of series) {
      for (const sessionIdx of sessionIndices) {
        const sessionSamples = samples[sessionIdx];
        if (!sessionSamples || sessionSamples.length < 2) continue;

        const step = Math.max(1, Math.floor(sessionSamples.length / MAX_POINTS));
        const downsampled = sessionSamples.filter((_, i) => i % step === 0);
        const duration = sessionDurations[sessionIdx] ?? 0;

        const data = downsampled.map((sample, idx) => ({
          x: formatSessionTime(
            idx * step,
            sessionSamples.length,
            duration
          ),
          y: (sample[s.field] as number) || 0,
        }));

        const label =
          sessionIndices.length > 1 && samples.length > 1
            ? `${s.id} — ${sessionLabels[sessionIdx]}`
            : s.id;

        result.push({ id: label, data });
      }
    }

    return result;
  }, [samples, sessionLabels, sessionDurations, series, isolatedSessionIndex]);

  const tickValues = useMemo(() => {
    if (chartData.length === 0) return [];
    const dataPoints = chartData[0].data;
    if (!dataPoints || dataPoints.length === 0) return [];
    if (dataPoints.length <= 6) return dataPoints.map((d) => d.x);

    const step = Math.max(1, Math.floor(dataPoints.length / 5));
    const values: string[] = [];
    for (let i = 0; i < dataPoints.length; i += step) {
      values.push(dataPoints[i].x);
    }
    const lastX = dataPoints[dataPoints.length - 1].x;
    if (!values.includes(lastX)) {
      values.push(lastX);
    }
    return values;
  }, [chartData]);

  const colors = useMemo(() => {
    if (isolatedSessionIndex !== undefined && isolatedSessionIndex !== null) {
      return series.map((s) => s.color);
    }
    // Flat array matching chartData order: for each series, for each session
    // First session gets full opacity, others get ~45% opacity
    const result: string[] = [];
    for (const s of series) {
      if (samples.length <= 1) {
        result.push(s.color);
      } else {
        for (let si = 0; si < samples.length; si++) {
          // Only push colors for sessions that exist in chartData
          result.push(si === 0 ? s.color : s.color + "73");
        }
      }
    }
    return result;
  }, [series, samples, isolatedSessionIndex]);

  const rightAxis = useMemo(() => {
    if (rightAxisSeries.length === 0) return undefined;
    return {
      tickSize: 0,
      tickPadding: 8,
      tickRotation: 0,
    };
  }, [rightAxisSeries]);

  return (
    <div className="combined-line-chart">
      <div
        className="combined-line-chart__container"
        style={{ height }}
      >
        {chartData.length === 0 ? (
          <div className="combined-line-chart__empty">
            {t("no_performance_data") || "No performance data available yet."}
          </div>
        ) : (
          <ResponsiveLine
            data={chartData}
            margin={{ top: 12, right: rightAxis ? 40 : 20, bottom: 30, left: 50 }}
            xScale={{ type: "point" }}
            yScale={{
              type: "linear",
              min: yMin ?? "auto",
              max: yMax ?? "auto",
            }}
            colors={colors}
            lineWidth={2}
            enableArea={false}
            enablePoints={false}
            enableGridX={false}
            enableGridY={true}
            gridYValues={4}
            axisTop={null}
            axisRight={rightAxis}
            axisBottom={{
              tickSize: 0,
              tickPadding: 8,
              tickRotation: 0,
              tickValues,
              format: (val: string) => val,
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 8,
              tickRotation: 0,
              legend: yAxisLabel,
              legendPosition: "middle",
              legendOffset: -40,
            }}
            theme={{
              background: "transparent",
              text: {
                fontSize: 10,
                fill: "rgba(255,255,255,0.4)",
                fontFamily: "inherit",
              },
              grid: {
                line: {
                  stroke: "rgba(255,255,255,0.05)",
                  strokeWidth: 1,
                },
              },
              tooltip: {
                container: {
                  background: "#0d0d0d",
                  color: "#fff",
                  fontSize: 11,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                },
              },
              crosshair: {
                line: {
                  stroke: "rgba(255,255,255,0.15)",
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                },
              },
            }}
            useMesh={true}
            animate={true}
            motionConfig="gentle"
          />
        )}
      </div>
    </div>
  );
}
