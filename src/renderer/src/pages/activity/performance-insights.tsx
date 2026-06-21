import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveBar } from "@nivo/bar";
import { Cpu, Flame, BarChart3, Info } from "lucide-react";
import type { SessionWithGame } from "../../declaration";
import { PerformanceTimeline } from "./performance-timeline";
import "./performance-insights.scss";

interface GamePerformanceAvg {
  gameTitle: string;
  gameIconUrl: string | null;
  avgFps: number;
  avgCpuTemp: number;
  avgGpuTemp: number;
  avgRamUsageMB: number;
  avgCpuUsage: number;
  avgGpuUsage: number;
  sessionsCount: number;
}

type CompareMetric = "fps" | "temps" | "ram";

export function PerformanceInsights() {
  const { t } = useTranslation("activity");
  const [sessions, setSessions] = useState<SessionWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<CompareMetric>("fps");
  const [totalRam, setTotalRam] = useState<number>(16);

  useEffect(() => {
    window.electron.getSystemRam().then((ram) => {
      if (ram > 0) setTotalRam(ram);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const all = await window.electron.getAllSessions();
        if (!cancelled) setSessions(all);
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const averages = useMemo((): GamePerformanceAvg[] => {
    const performanceMap = new Map<
      string,
      {
        iconUrl: string | null;
        fpsSum: number;
        fpsCount: number;
        cpuTempSum: number;
        cpuTempCount: number;
        gpuTempSum: number;
        gpuTempCount: number;
        ramSum: number;
        ramCount: number;
        cpuUsageSum: number;
        cpuUsageCount: number;
        gpuUsageSum: number;
        gpuUsageCount: number;
        sessionsCount: number;
      }
    >();

    for (const s of sessions) {
      if (!s.hardwareMetrics) continue;
      const m = s.hardwareMetrics;
      const game = s.gameTitle;

      const existing = performanceMap.get(game) || {
        iconUrl: s.gameIconUrl,
        fpsSum: 0,
        fpsCount: 0,
        cpuTempSum: 0,
        cpuTempCount: 0,
        gpuTempSum: 0,
        gpuTempCount: 0,
        ramSum: 0,
        ramCount: 0,
        cpuUsageSum: 0,
        cpuUsageCount: 0,
        gpuUsageSum: 0,
        gpuUsageCount: 0,
        sessionsCount: 0,
      };

      existing.sessionsCount++;

      if (m.avgFps > 0) {
        existing.fpsSum += m.avgFps;
        existing.fpsCount++;
      }
      if (m.avgCpuTemp > 0) {
        existing.cpuTempSum += m.avgCpuTemp;
        existing.cpuTempCount++;
      }
      if (m.avgGpuTemp > 0) {
        existing.gpuTempSum += m.avgGpuTemp;
        existing.gpuTempCount++;
      }
      if (m.avgRamUsageMB > 0) {
        existing.ramSum += m.avgRamUsageMB;
        existing.ramCount++;
      }
      if (m.avgCpuUsage > 0) {
        existing.cpuUsageSum += m.avgCpuUsage;
        existing.cpuUsageCount++;
      }
      if (m.avgGpuUsage > 0) {
        existing.gpuUsageSum += m.avgGpuUsage;
        existing.gpuUsageCount++;
      }

      performanceMap.set(game, existing);
    }

    return Array.from(performanceMap.entries())
      .map(([gameTitle, info]) => ({
        gameTitle,
        gameIconUrl: info.iconUrl,
        avgFps: info.fpsCount > 0 ? Math.round(info.fpsSum / info.fpsCount) : 0,
        avgCpuTemp:
          info.cpuTempCount > 0
            ? Math.round(info.cpuTempSum / info.cpuTempCount)
            : 0,
        avgGpuTemp:
          info.gpuTempCount > 0
            ? Math.round(info.gpuTempSum / info.gpuTempCount)
            : 0,
        avgRamUsageMB:
          info.ramCount > 0 ? Math.round(info.ramSum / info.ramCount) : 0,
        avgCpuUsage:
          info.cpuUsageCount > 0
            ? Math.round(info.cpuUsageSum / info.cpuUsageCount)
            : 0,
        avgGpuUsage:
          info.gpuUsageCount > 0
            ? Math.round(info.gpuUsageSum / info.gpuUsageCount)
            : 0,
        sessionsCount: info.sessionsCount,
      }))
      .filter((g) => g.avgFps > 0 || g.avgCpuTemp > 0 || g.avgGpuTemp > 0);
  }, [sessions]);

  // Sort and slice data for horizontal bar charts
  const chartData = useMemo<Record<string, string | number>[]>(() => {
    if (metric === "fps") {
      return [...averages]
        .sort((a, b) => b.avgFps - a.avgFps)
        .slice(0, 8)
        .map((g) => ({
          game: g.gameTitle,
          FPS: g.avgFps,
        }))
        .reverse(); // Reverse for bottom-to-top layout in horizontal bar
    }
    if (metric === "temps") {
      return [...averages]
        .sort(
          (a, b) =>
            Math.max(b.avgCpuTemp, b.avgGpuTemp) -
            Math.max(a.avgCpuTemp, a.avgGpuTemp)
        )
        .slice(0, 8)
        .map((g) => ({
          game: g.gameTitle,
          CPU: g.avgCpuTemp,
          GPU: g.avgGpuTemp,
        }))
        .reverse();
    }
    if (metric === "ram") {
      return [...averages]
        .sort((a, b) => b.avgRamUsageMB - a.avgRamUsageMB)
        .slice(0, 8)
        .map((g) => ({
          game: g.gameTitle,
          RAM: Math.round(g.avgRamUsageMB / 100) / 10, // Convert to GB
        }))
        .reverse();
    }
    return [];
  }, [averages, metric]);

  const keys = useMemo(() => {
    if (metric === "fps") return ["FPS"];
    if (metric === "temps") return ["CPU", "GPU"];
    return ["RAM"];
  }, [metric]);

  const colors = useMemo(() => {
    if (metric === "fps") return ["#16b195"];
    if (metric === "temps") return ["#e74c3c", "#f39c12"];
    return ["#3e62c0"];
  }, [metric]);

  if (loading) {
    return (
      <div className="section-panel">
        <h3 className="section-panel__title">
          {t("performance_insights", "Performance Insights")}
        </h3>
        <div className="section-panel__empty">{t("loading")}</div>
      </div>
    );
  }

  if (averages.length === 0) {
    return (
      <div className="section-panel">
        <h3 className="section-panel__title">
          {t("performance_insights", "Performance Insights")}
        </h3>
        <div className="section-panel__empty">
          <Info size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div>
            {t("no_hardware_data", "No performance insights available yet.")}
          </div>
          <small
            style={{
              color: "rgba(255,255,255,0.3)",
              marginTop: 4,
              display: "block",
            }}
          >
            {t("hw_monitoring_hint", "Play games with hardware monitoring enabled to see metrics here.")}
          </small>
        </div>
      </div>
    );
  }

  return (
    <div className="performance-insights">
      {/* Comparison Chart Section */}
      <div className="section-panel performance-insights__chart-panel">
        <div className="performance-insights__chart-header">
          <h3 className="section-panel__title">
            <BarChart3 size={14} style={{ marginRight: 6 }} />
            {t("game_comparisons", "Game Comparisons")}
          </h3>
          <div className="performance-insights__tabs">
            {(["fps", "temps", "ram"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`performance-insights__tab-btn ${
                  metric === m ? "performance-insights__tab-btn--active" : ""
                }`}
                onClick={() => setMetric(m)}
              >
                {m === "fps" && <BarChart3 size={12} />}
                {m === "temps" && <Flame size={12} />}
                {m === "ram" && <Cpu size={12} />}
                {m === "fps"
                  ? t("avg_fps", "Avg FPS")
                  : m === "temps"
                    ? t("temps_c", "Temps (°C)")
                    : t("ram_gb", "RAM (GB)")}
              </button>
            ))}
          </div>
        </div>

        <div className="performance-insights__chart-container">
          <ResponsiveBar
            data={chartData}
            keys={keys}
            indexBy="game"
            margin={{ top: 10, right: 30, bottom: 30, left: 130 }}
            padding={0.3}
            layout="horizontal"
            valueScale={{
              type: "linear",
              max: metric === "ram" ? totalRam : "auto",
            }}
            colors={colors}
            groupMode="grouped"
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 0,
              tickPadding: 6,
              tickRotation: 0,
              format: (v) =>
                `${v}${metric === "ram" ? " GB" : metric === "temps" ? "°C" : " FPS"}`,
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 10,
              tickRotation: 0,
            }}
            enableGridX={true}
            enableGridY={false}
            gridXValues={4}
            theme={{
              background: "transparent",
              text: {
                fontSize: 10,
                fill: "rgba(255,255,255,0.45)",
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
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                },
              },
            }}
            labelSkipWidth={12}
            labelTextColor="rgba(255,255,255,0.9)"
            animate={true}
            motionConfig="gentle"
          />
        </div>
      </div>

      {/* Tabular List Section */}
      <div className="section-panel performance-insights__table-panel">
        <h3 className="section-panel__title">
          {t("all_performance_records", "Detailed Performance Board")}
        </h3>
        <div className="performance-insights__table-wrapper">
          <table className="performance-insights__table">
            <thead>
              <tr>
                <th>{t("game", "Game")}</th>
                <th>{t("sessions", "Sessions")}</th>
                <th>{t("avg_fps", "Avg FPS")}</th>
                <th>{t("avg_cpu_temp", "Avg CPU Temp")}</th>
                <th>{t("avg_gpu_temp", "Avg GPU Temp")}</th>
                <th>{t("avg_ram", "Avg RAM")}</th>
                <th>{t("avg_cpu_usage", "Avg CPU Usage")}</th>
                <th>{t("avg_gpu_usage", "Avg GPU Usage")}</th>
              </tr>
            </thead>
            <tbody>
              {averages.map((g) => {
                const isFpsHigh = g.avgFps >= 60;
                const isCpuHot = g.avgCpuTemp >= 75;
                const isGpuHot = g.avgGpuTemp >= 75;

                return (
                  <tr key={g.gameTitle}>
                    <td>
                      <div className="performance-insights__game-cell">
                        {g.gameIconUrl ? (
                          <img
                            src={g.gameIconUrl}
                            alt={g.gameTitle}
                            className="performance-insights__game-icon"
                          />
                        ) : (
                          <div className="performance-insights__game-icon-placeholder" />
                        )}
                        <span className="performance-insights__game-title">
                          {g.gameTitle}
                        </span>
                      </div>
                    </td>
                    <td>{g.sessionsCount}</td>
                    <td className={isFpsHigh ? "text-high-fps" : ""}>
                      {g.avgFps > 0 ? `${g.avgFps} FPS` : "—"}
                    </td>
                    <td className={isCpuHot ? "text-hot-temp" : ""}>
                      {g.avgCpuTemp > 0 ? `${g.avgCpuTemp}°C` : "—"}
                    </td>
                    <td className={isGpuHot ? "text-hot-temp" : ""}>
                      {g.avgGpuTemp > 0 ? `${g.avgGpuTemp}°C` : "—"}
                    </td>
                    <td>
                      {g.avgRamUsageMB > 0
                        ? `${(g.avgRamUsageMB / 1024).toFixed(1)} GB`
                        : "—"}
                    </td>
                    <td>{g.avgCpuUsage > 0 ? `${g.avgCpuUsage}%` : "—"}</td>
                    <td>{g.avgGpuUsage > 0 ? `${g.avgGpuUsage}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Time-series charts section */}
      <PerformanceTimeline allSessions={sessions} />
    </div>
  );
}
