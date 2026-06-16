import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import "./activity-chart.scss";

export interface ChartDataPoint {
  date: string;
  hours: number;
  [key: string]: string | number;
}

export interface ActivityChartProps {
  data: ChartDataPoint[];
}

type ChartMode = "bar" | "line";

export function ActivityChart({ data }: Readonly<ActivityChartProps>) {
  const { t } = useTranslation("activity");
  const [mode, setMode] = useState<ChartMode>("bar");

  if (data.length === 0) {
    return (
      <div className="activity-chart activity-chart--empty">
        {t("no_activity_yet")}
      </div>
    );
  }

  const lineData = [
    {
      id: "hours",
      data: data.map((d) => ({ x: d.date, y: d.hours })),
    },
  ];

  const totalHours = data.reduce((sum, d) => sum + d.hours, 0);

  return (
    <div className="activity-chart">
      <div className="activity-chart__header">
        <span className="activity-chart__subtitle">
          {t("total_playtime")}: {Math.round(totalHours * 10) / 10}h
        </span>
        <div className="activity-chart__toggle">
          <button
            type="button"
            className={`activity-chart__toggle-btn ${mode === "bar" ? "activity-chart__toggle-btn--active" : ""}`}
            onClick={() => setMode("bar")}
            title={t("bar_chart")}
          >
            ▊
          </button>
          <button
            type="button"
            className={`activity-chart__toggle-btn ${mode === "line" ? "activity-chart__toggle-btn--active" : ""}`}
            onClick={() => setMode("line")}
            title={t("line_chart")}
          >
            ▁▂▃
          </button>
        </div>
      </div>

      {mode === "bar" ? (
        <ResponsiveBar
          data={data}
          keys={["hours"]}
          indexBy="date"
          margin={{ top: 8, right: 8, bottom: 24, left: 36 }}
          padding={0.3}
          valueScale={{ type: "linear" }}
          colors={["#16b195"]}
          borderRadius={2}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 0,
            tickPadding: 6,
            tickRotation: 0,
            format: (value: string) => {
              const parts = value.split("-");
              return parts.length === 2 ? `${parts[1]}/${parts[0]}` : value;
            },
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 6,
            tickRotation: 0,
            format: (value: number) => {
              if (value >= 1) return `${Math.trunc(value)}h`;
              return `${Math.round(value * 60)}m`;
            },
          }}
          enableGridY={true}
          gridYValues={4}
          theme={{
            background: "transparent",
            text: {
              fontSize: 10,
              fill: "rgba(255,255,255,0.4)",
              fontFamily: "inherit",
            },
            grid: {
              line: {
                stroke: "rgba(255,255,255,0.06)",
                strokeWidth: 1,
              },
            },
            tooltip: {
              container: {
                background: "#0d0d0d",
                color: "#fff",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              },
            },
          }}
          tooltip={({ value, indexValue }) => {
            const hours = value as number;
            const display =
              hours >= 1
                ? `${Math.round(hours * 10) / 10}h`
                : `${Math.round(hours * 60)}m`;
            return (
              <div className="activity-chart__tooltip">
                <strong>{indexValue}</strong>
                <span>{display}</span>
              </div>
            );
          }}
          labelSkipWidth={24}
          labelSkipHeight={12}
          enableLabel={true}
          label={(d) => {
            const hours = d.value as number;
            if (hours >= 1) return `${Math.round(hours * 10) / 10}h`;
            return `${Math.round(hours * 60)}m`;
          }}
          labelTextColor="rgba(255,255,255,0.85)"
          animate={true}
          motionConfig="gentle"
          role="application"
          ariaLabel={t("activity")}
        />
      ) : (
        <ResponsiveLine
          data={lineData}
          margin={{ top: 8, right: 8, bottom: 24, left: 36 }}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: 0, max: "auto" }}
          colors={["#16b195"]}
          lineWidth={2.5}
          enableArea={true}
          areaOpacity={0.12}
          areaBaselineValue={0}
          enablePoints={true}
          pointSize={6}
          pointColor="#0d0d0d"
          pointBorderWidth={2}
          pointBorderColor={{ from: "serieColor" }}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 0,
            tickPadding: 6,
            tickRotation: 0,
            format: (value: string) => {
              const parts = value.split("-");
              return parts.length === 2 ? `${parts[1]}/${parts[0]}` : value;
            },
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 6,
            tickRotation: 0,
            format: (value: number) => {
              if (value >= 1) return `${Math.trunc(value)}h`;
              return `${Math.round(value * 60)}m`;
            },
          }}
          enableGridY={true}
          gridYValues={4}
          theme={{
            background: "transparent",
            text: {
              fontSize: 10,
              fill: "rgba(255,255,255,0.4)",
              fontFamily: "inherit",
            },
            grid: {
              line: {
                stroke: "rgba(255,255,255,0.06)",
                strokeWidth: 1,
              },
            },
            tooltip: {
              container: {
                background: "#0d0d0d",
                color: "#fff",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              },
            },
          }}
          tooltip={({ point }) => {
            const hours = point.data.y as number;
            const display =
              hours >= 1
                ? `${Math.round(hours * 10) / 10}h`
                : `${Math.round(hours * 60)}m`;
            return (
              <div className="activity-chart__tooltip">
                <strong>{String(point.data.x)}</strong>
                <span>{display}</span>
              </div>
            );
          }}
          animate={true}
          motionConfig="gentle"
          role="application"
          ariaLabel={t("activity")}
        />
      )}
    </div>
  );
}
