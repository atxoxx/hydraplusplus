import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, BarChart3, Info } from "lucide-react";
import type { SessionWithGame, HardwareSample } from "../../declaration";
import {
  CombinedLineChart,
  type MetricSeries,
} from "../../components/performance-charts/combined-line-chart";
import { PerformanceStatCards } from "../../components/performance-charts/performance-stat-cards";
import "./performance-timeline.scss";

export interface PerformanceTimelineProps {
  allSessions: SessionWithGame[];
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

export function PerformanceTimeline({
  allSessions,
}: Readonly<PerformanceTimelineProps>) {
  const { t } = useTranslation("activity");

  // Filter sessions with hardware data
  const hwSessions = useMemo(
    () =>
      allSessions.filter(
        (s) =>
          s.hardwareMetrics &&
          s.hardwareMetrics.samples &&
          s.hardwareMetrics.samples.length >= 2
      ),
    [allSessions]
  );

  // Build unique game list for selector
  const gameList = useMemo(() => {
    const map = new Map<string, { title: string; sessions: SessionWithGame[] }>();
    for (const s of hwSessions) {
      if (!map.has(s.gameTitle)) {
        map.set(s.gameTitle, { title: s.gameTitle, sessions: [] });
      }
      map.get(s.gameTitle)!.sessions.push(s);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.title.localeCompare(b.title)
    );
  }, [hwSessions]);

  const [selectedGame, setSelectedGame] = useState<string>("all");
  const [isolatedSessionIndex, setIsolatedSessionIndex] = useState<number | null>(null);

  // Filter sessions by selected game
  const filteredSessions = useMemo(() => {
    if (selectedGame === "all") return hwSessions;
    return hwSessions.filter((s) => s.gameTitle === selectedGame);
  }, [hwSessions, selectedGame]);

  // Flatten all samples for stat cards
  const allSamples = useMemo(() => {
    const flat: HardwareSample[] = [];
    for (const s of filteredSessions) {
      if (s.hardwareMetrics?.samples) {
        flat.push(...s.hardwareMetrics.samples);
      }
    }
    return flat;
  }, [filteredSessions]);

  const sessionLabels = useMemo(
    () =>
      filteredSessions.map((s) =>
        `${s.gameTitle} — ${formatSessionDate(s.startTime)}`
      ),
    [filteredSessions]
  );

  const sessionSamples = useMemo(
    () =>
      filteredSessions.map((s) => s.hardwareMetrics?.samples ?? []),
    [filteredSessions]
  );

  const sessionDurations = useMemo(
    () => filteredSessions.map((s) => s.durationMs),
    [filteredSessions]
  );

  if (hwSessions.length === 0) {
    return (
      <div className="section-panel">
        <h3 className="section-panel__title">
          <Activity size={14} style={{ marginRight: 6 }} />
          {t("session_performance_timeline") || "Session Performance Timeline"}
        </h3>
        <div className="performance-timeline__empty">
          <Info size={24} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>
            {t("no_performance_data") || "No performance data available yet."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section-panel">
      <div className="performance-timeline">
        {/* Header with game selector */}
        <div className="performance-timeline__header">
          <h3 className="performance-timeline__title">
            <Activity size={14} />
            {t("session_performance_timeline") || "Session Performance Timeline"}
          </h3>

          <div className="performance-timeline__controls">
            {/* Game selector */}
            <div className="performance-timeline__game-selector">
              <span className="performance-timeline__game-selector-label">
                {t("filter_by_game") || "GAME"}
              </span>
              <select
                className="performance-timeline__game-select"
                value={selectedGame}
                onChange={(e) => {
                  setSelectedGame(e.target.value);
                  setIsolatedSessionIndex(null);
                }}
              >
                <option value="all">
                  {t("all_games") || "All Games"}
                </option>
                {gameList.map((g) => (
                  <option key={g.title} value={g.title}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Session selector for isolation */}
            {filteredSessions.length > 1 && (
              <div className="performance-timeline__session-selector">
                <span className="performance-timeline__session-selector-label">
                  SESSION
                </span>
                <select
                  className="performance-timeline__session-select"
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
                  {filteredSessions.map((s, i) => (
                    <option key={s.id} value={String(i)}>
                      {sessionLabels[i]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Stat Cards */}
        <PerformanceStatCards allSamples={allSamples} />

        {/* Charts */}
        <div className="performance-timeline__charts">
          <div className="performance-timeline__chart-card">
            <div className="performance-timeline__chart-title">
              <BarChart3 size={13} />
              {t("cpu_gpu_usage") || "CPU & GPU Usage"}
            </div>
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

          <div className="performance-timeline__chart-card">
            <div className="performance-timeline__chart-title">
              <BarChart3 size={13} />
              {t("cpu_gpu_temps") || "CPU & GPU Temperatures"}
            </div>
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

          <div className="performance-timeline__chart-card">
            <div className="performance-timeline__chart-title">
              <BarChart3 size={13} />
              {t("ram_fps") || "RAM & FPS"}
            </div>
            <CombinedLineChart
              samples={sessionSamples}
              sessionLabels={sessionLabels}
              sessionDurations={sessionDurations}
              series={RAM_FPS_SERIES}
              height={220}
              isolatedSessionIndex={isolatedSessionIndex}
              rightAxisSeries={["FPS"]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
