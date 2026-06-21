import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Activity, Info } from "lucide-react";
import type { GameSession } from "../../declaration";
import type { HardwareSample } from "../../declaration";
import {
  CombinedLineChart,
  type MetricSeries,
} from "../../components/performance-charts/combined-line-chart";
import { PerformanceStatCards } from "../../components/performance-charts/performance-stat-cards";
import "./game-performance-view.scss";

export interface GamePerformanceViewProps {
  sessions: GameSession[];
}

const CPU_GPU_USAGE_SERIES: MetricSeries[] = [
  { id: "CPU Usage", color: "#3e62c0", field: "cpuUsage" },
  { id: "GPU Usage", color: "#9b59b6", field: "gpuUsage" },
];

const TEMPS_SERIES: MetricSeries[] = [
  { id: "CPU Temp", color: "#e74c3c", field: "cpuTemp" },
  { id: "GPU Temp", color: "#f39c12", field: "gpuTemp" },
];

const RAM_FPS_SERIES: MetricSeries[] = [
  { id: "RAM", color: "#2ecc71", field: "ramUsageMB" },
  { id: "FPS", color: "#16b195", field: "fps" },
];

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GamePerformanceView({
  sessions,
}: Readonly<GamePerformanceViewProps>) {
  const { t } = useTranslation("activity");

  // Filter sessions with hardware data
  const hwSessions = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.hardwareMetrics &&
          s.hardwareMetrics.samples &&
          s.hardwareMetrics.samples.length >= 2
      ),
    [sessions]
  );

  // Flatten all samples for stat cards
  const allSamples = useMemo(() => {
    const flat: HardwareSample[] = [];
    for (const s of hwSessions) {
      if (s.hardwareMetrics?.samples) {
        flat.push(...s.hardwareMetrics.samples);
      }
    }
    return flat;
  }, [hwSessions]);

  // Session labels and data for charts
  const sessionLabels = useMemo(
    () => hwSessions.map((s) => formatSessionDate(s.startTime)),
    [hwSessions]
  );

  const sessionSamples = useMemo(
    () =>
      hwSessions.map(
        (s) => s.hardwareMetrics?.samples ?? []
      ),
    [hwSessions]
  );

  const sessionDurations = useMemo(
    () => hwSessions.map((s) => s.durationMs),
    [hwSessions]
  );

  // Session isolation state - shared across all three charts
  const [isolatedSessionIndex, setIsolatedSessionIndex] = useState<number | null>(null);

  if (hwSessions.length === 0) {
    return (
      <div className="game-performance-view">
        <div className="game-performance-view__empty">
          <Info size={28} style={{ opacity: 0.4 }} />
          <span>
            {t("no_performance_data") || "No performance data available yet."}
          </span>
          <small>
            {t("hw_monitoring_disabled") ||
              "Hardware monitoring is not enabled."}
          </small>
        </div>
      </div>
    );
  }

  return (
    <div className="game-performance-view">
      {/* Stat Cards Row */}
      <PerformanceStatCards allSamples={allSamples} />

      {/* Charts Section */}
      <div className="game-performance-view__charts-section">
        {/* Session selector shared across all charts */}
        {hwSessions.length > 1 && (
          <div className="game-performance-view__chart-header">
            <span className="game-performance-view__chart-title">
              <Activity size={14} />
              {t("session_performance_timeline") ||
                "Session Performance Timeline"}
            </span>
            <div className="game-performance-view__session-selector">
              <BarChart3 size={12} />
              <select
                className="game-performance-view__session-select"
                value={
                  isolatedSessionIndex !== null
                    ? String(isolatedSessionIndex)
                    : "all"
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setIsolatedSessionIndex(
                    val === "all" ? null : Number(val)
                  );
                }}
              >
                <option value="all">
                  {t("all_sessions") || "All Sessions"}
                </option>
                {hwSessions.map((s, i) => (
                  <option key={s.id} value={String(i)}>
                    {sessionLabels[i]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Chart 1: CPU + GPU Usage */}
        <div className="game-performance-view__chart-card">
          {hwSessions.length <= 1 && (
            <div className="game-performance-view__chart-header">
              <span className="game-performance-view__chart-title">
                <BarChart3 size={14} />
                {t("cpu_gpu_usage") || "CPU & GPU Usage"}
              </span>
            </div>
          )}
          <CombinedLineChart
            samples={sessionSamples}
            sessionLabels={sessionLabels}
            sessionDurations={sessionDurations}
            series={CPU_GPU_USAGE_SERIES}
            height={220}
            isolatedSessionIndex={isolatedSessionIndex}
            yMin={0}
            yMax={100}
            yAxisLabel="%"
          />
        </div>

        {/* Chart 2: CPU + GPU Temps */}
        <div className="game-performance-view__chart-card">
          {hwSessions.length <= 1 && (
            <div className="game-performance-view__chart-header">
              <span className="game-performance-view__chart-title">
                <BarChart3 size={14} />
                {t("cpu_gpu_temps") || "CPU & GPU Temperatures"}
              </span>
            </div>
          )}
          <CombinedLineChart
            samples={sessionSamples}
            sessionLabels={sessionLabels}
            sessionDurations={sessionDurations}
            series={TEMPS_SERIES}
            height={220}
            isolatedSessionIndex={isolatedSessionIndex}
            yAxisLabel="°C"
          />
        </div>

        {/* Chart 3: RAM + FPS */}
        <div className="game-performance-view__chart-card">
          {hwSessions.length <= 1 && (
            <div className="game-performance-view__chart-header">
              <span className="game-performance-view__chart-title">
                <BarChart3 size={14} />
                {t("ram_fps") || "RAM & FPS"}
              </span>
            </div>
          )}
          <CombinedLineChart
            samples={sessionSamples}
            sessionLabels={sessionLabels}
            sessionDurations={sessionDurations}
            series={RAM_FPS_SERIES}
            height={220}
            isolatedSessionIndex={isolatedSessionIndex}
            yAxisLabel="MB"
            rightAxisSeries={["FPS"]}
          />
        </div>
      </div>
    </div>
  );
}
