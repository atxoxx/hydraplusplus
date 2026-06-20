import { ResponsiveLine } from "@nivo/line";
import type { HardwareSample } from "../../declaration";
import "./activity-sparkline.scss";

export interface ActivitySparklineProps {
  data: { x: number; y: number }[];
  label: string;
  unit: string;
  value: number;
  max?: number;
  min?: number;
  thresholds?: { warn: number; danger: number };
  inverted?: boolean;
}

export function ActivitySparkline({
  data,
  label,
  unit,
  value,
  max,
  min,
  thresholds,
  inverted,
}: Readonly<ActivitySparklineProps>) {
  const getStatus = (): "good" | "warn" | "danger" => {
    if (!thresholds) return "good";
    if (inverted) {
      if (value <= thresholds.danger) return "danger";
      if (value <= thresholds.warn) return "warn";
      return "good";
    }
    if (value >= thresholds.danger) return "danger";
    if (value >= thresholds.warn) return "warn";
    return "good";
  };

  const status = getStatus();
  const statusColors = {
    good: "#16b195",
    warn: "#d4a853",
    danger: "#e74c3c",
  };

  function formatTimestamp(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  const renderValueGroup = () => (
    <div className="activity-sparkline__value-group">
      <div className="activity-sparkline__value-item">
        <span className="activity-sparkline__value-item-label">avg</span>
        <span
          className={`activity-sparkline__value activity-sparkline__value--${status}`}
        >
          {value}
          {unit}
        </span>
      </div>
      {max !== undefined && max > 0 && (
        <div className="activity-sparkline__value-item">
          <span className="activity-sparkline__value-item-label">max</span>
          <span className="activity-sparkline__value activity-sparkline__value--max">
            {max}
            {unit}
          </span>
        </div>
      )}
      {min !== undefined && min > 0 && (
        <div className="activity-sparkline__value-item">
          <span className="activity-sparkline__value-item-label">min</span>
          <span className="activity-sparkline__value activity-sparkline__value--min">
            {min}
            {unit}
          </span>
        </div>
      )}
    </div>
  );

  if (data.length < 2) {
    return (
      <div className="activity-sparkline">
        <span className="activity-sparkline__label">{label}</span>
        {renderValueGroup()}
      </div>
    );
  }

  const seriesData = data.map((d) => ({ x: String(d.x), y: d.y }));
  const chartData = [{ id: label, data: seriesData }];

  return (
    <div className="activity-sparkline">
      <span className="activity-sparkline__label">{label}</span>
      <div className="activity-sparkline__chart">
        <ResponsiveLine
          data={chartData}
          margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: "auto", max: "auto" }}
          axisTop={null}
          axisRight={null}
          axisBottom={null}
          axisLeft={null}
          enableGridX={false}
          enableGridY={false}
          enablePoints={false}
          colors={[statusColors[status]]}
          lineWidth={1.5}
          enableArea={true}
          areaOpacity={0.08}
          areaBaselineValue={0}
          isInteractive={true}
          enableCrosshair={false}
          useMesh={true}
          tooltip={({ point }) => {
            const timestamp = Number(point.data.x);
            const val = point.data.y as number;
            return (
              <div className="activity-sparkline__tooltip">
                <span className="activity-sparkline__tooltip-label">
                  {label}
                </span>
                <span className="activity-sparkline__tooltip-value">
                  {val}
                  {unit}
                </span>
                <span className="activity-sparkline__tooltip-time">
                  {formatTimestamp(timestamp)}
                </span>
              </div>
            );
          }}
          animate={false}
        />
      </div>
      {renderValueGroup()}
    </div>
  );
}

export function samplesToSparklineData(
  samples: HardwareSample[],
  metric: keyof HardwareSample
): { x: number; y: number }[] {
  const step = Math.max(1, Math.floor(samples.length / 30));
  return samples
    .filter((_, i) => i % step === 0)
    .map((sample) => ({
      x: sample.timestamp,
      y: sample[metric] as number,
    }));
}
