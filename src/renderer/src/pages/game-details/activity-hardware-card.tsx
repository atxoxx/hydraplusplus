import { useTranslation } from "react-i18next";
import type { HardwareMetricsSnapshot } from "../../declaration";
import {
  ActivitySparkline,
  samplesToSparklineData,
} from "./activity-sparkline";
import "./activity-hardware-card.scss";

export interface ActivityHardwareCardProps {
  metrics?: HardwareMetricsSnapshot | null;
}

export function ActivityHardwareCard({
  metrics,
}: Readonly<ActivityHardwareCardProps>) {
  const { t } = useTranslation("activity");

  if (!metrics || metrics.samples.length === 0) {
    return (
      <div className="activity-hardware-card activity-hardware-card--empty">
        <h4 className="activity-hardware-card__title">
          {t("hardware_summary")}
        </h4>
        <p className="activity-hardware-card__empty">{t("no_hardware_data")}</p>
      </div>
    );
  }

  const hasValidMetrics =
    metrics.avgCpuUsage > 0 ||
    metrics.avgGpuUsage > 0 ||
    metrics.avgCpuTemp > 0 ||
    metrics.avgGpuTemp > 0;

  if (!hasValidMetrics) {
    return (
      <div className="activity-hardware-card">
        <h4 className="activity-hardware-card__title">
          {t("hardware_summary")}
        </h4>
        <p className="activity-hardware-card__empty">{t("no_hardware_data")}</p>
      </div>
    );
  }

  const samples = metrics.samples;

  return (
    <div className="activity-hardware-card">
      <h4 className="activity-hardware-card__title">{t("hardware_summary")}</h4>

      <div className="activity-hardware-card__metrics">
        {metrics.avgCpuUsage > 0 && (
          <ActivitySparkline
            data={samplesToSparklineData(samples, "cpuUsage")}
            label={t("cpu")}
            unit="%"
            value={metrics.avgCpuUsage}
            max={metrics.maxCpuUsage}
            thresholds={{ warn: 70, danger: 90 }}
          />
        )}

        {metrics.avgGpuUsage > 0 && (
          <ActivitySparkline
            data={samplesToSparklineData(samples, "gpuUsage")}
            label={t("gpu")}
            unit="%"
            value={metrics.avgGpuUsage}
            max={metrics.maxGpuUsage}
            thresholds={{ warn: 70, danger: 90 }}
          />
        )}

        {metrics.avgCpuTemp > 0 && (
          <ActivitySparkline
            data={samplesToSparklineData(samples, "cpuTemp")}
            label={t("cpu_temp")}
            unit="°C"
            value={metrics.avgCpuTemp}
            max={metrics.maxCpuTemp}
            thresholds={{ warn: 75, danger: 85 }}
          />
        )}

        {metrics.avgGpuTemp > 0 && (
          <ActivitySparkline
            data={samplesToSparklineData(samples, "gpuTemp")}
            label={t("gpu_temp")}
            unit="°C"
            value={metrics.avgGpuTemp}
            max={metrics.maxGpuTemp}
            thresholds={{ warn: 75, danger: 85 }}
          />
        )}

        {metrics.avgRamUsageMB > 0 && (
          <ActivitySparkline
            data={samplesToSparklineData(samples, "ramUsageMB")}
            label={t("ram")}
            unit="MB"
            value={metrics.avgRamUsageMB}
            max={metrics.maxRamUsageMB}
          />
        )}

        {metrics.avgFps > 0 && (
          <ActivitySparkline
            data={samplesToSparklineData(samples, "fps")}
            label={t("fps")}
            unit=""
            value={metrics.avgFps}
            max={metrics.maxFps}
            min={metrics.minFps}
            thresholds={{ warn: 60, danger: 30 }}
            inverted
          />
        )}
      </div>
    </div>
  );
}
