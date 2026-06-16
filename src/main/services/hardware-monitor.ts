import si from "systeminformation";
import type { HardwareSample, HardwareMetricsSnapshot } from "@main/level";
import { logger } from "./logger";
import { db, levelKeys } from "@main/level";
import type { UserPreferences } from "@types";
import { NativeAddon } from "./native-addon";

export type HardwareMonitorConfig = {
  enabled: boolean;
  pollingIntervalMs: number;
  alertsEnabled: boolean;
  fpsAlertThreshold: number;
  cpuTempAlertThreshold: number;
  gpuTempAlertThreshold: number;
  cpuUsageAlertThreshold: number;
  ramUsageAlertThresholdMB: number;
};

const DEFAULT_CONFIG: HardwareMonitorConfig = {
  enabled: true,
  pollingIntervalMs: 5000,
  alertsEnabled: false,
  fpsAlertThreshold: 30,
  cpuTempAlertThreshold: 90,
  gpuTempAlertThreshold: 85,
  cpuUsageAlertThreshold: 95,
  ramUsageAlertThresholdMB: 0,
};

export class HardwareMonitor {
  private static activeSamples = new Map<string, HardwareSample[]>();
  private static pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private static config: HardwareMonitorConfig = { ...DEFAULT_CONFIG };

  static getConfig(): HardwareMonitorConfig {
    return { ...this.config };
  }

  static updateConfig(partial: Partial<HardwareMonitorConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  static async loadConfigFromPreferences(): Promise<void> {
    try {
      const prefs = await db.get<string, UserPreferences | null>(
        levelKeys.userPreferences,
        { valueEncoding: "json" }
      );

      if (prefs?.hardwareMonitorConfig) {
        this.config = { ...DEFAULT_CONFIG, ...prefs.hardwareMonitorConfig };
      }
    } catch {
      // Preferences not yet set, use defaults
    }
  }

  static start(gameKey: string): void {
    if (!this.config.enabled) return;

    this.activeSamples.set(gameKey, []);
    const interval = setInterval(() => {
      this.collectSample(gameKey);
    }, this.config.pollingIntervalMs);

    this.pollingIntervals.set(gameKey, interval);
    logger.info("Hardware monitoring started", { gameKey });
  }

  static async collectSample(gameKey: string): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const sample = await this.readHardwareMetrics();
      const samples = this.activeSamples.get(gameKey);
      if (samples) {
        samples.push(sample);
      }
    } catch (error) {
      logger.error("Hardware sample collection failed", error);
    }
  }

  static stop(gameKey: string): HardwareMetricsSnapshot | undefined {
    const interval = this.pollingIntervals.get(gameKey);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(gameKey);
    }

    const samples = this.activeSamples.get(gameKey);
    this.activeSamples.delete(gameKey);

    if (!samples || samples.length === 0) return undefined;

    const snapshot = this.aggregateSamples(samples);
    logger.info("Hardware monitoring stopped", {
      gameKey,
      sampleCount: samples.length,
    });

    return snapshot;
  }

  static isActive(gameKey: string): boolean {
    return this.pollingIntervals.has(gameKey);
  }

  static shutdown(): void {
    for (const [gameKey] of this.pollingIntervals) {
      this.stop(gameKey);
    }
  }

  private static async readHardwareMetrics(): Promise<HardwareSample> {
    // Try native addon first (MSI Afterburner / RTSS shared memory on Windows)
    const nativeMetrics = NativeAddon.readHardwareMetrics();

    if (nativeMetrics) {
      const hasAnyData =
        nativeMetrics.fps > 0 ||
        nativeMetrics.gpu_usage > 0 ||
        nativeMetrics.gpu_temp > 0 ||
        nativeMetrics.cpu_temp > 0;

      if (hasAnyData) {
        // Get CPU usage and RAM from systeminformation since native addon may not have them
        let cpuUsage = Math.round(nativeMetrics.cpu_usage);
        let ramUsageMB = Math.round(nativeMetrics.ram_usage_mb);

        if (cpuUsage <= 0 || ramUsageMB <= 0) {
          try {
            const [cpuLoad, mem] = await Promise.all([
              si.currentLoad(),
              si.mem(),
            ]);
            if (cpuUsage <= 0) cpuUsage = Math.round(cpuLoad.currentLoad);
            if (ramUsageMB <= 0)
              ramUsageMB = Math.round(mem.used / (1024 * 1024));
          } catch {
            // Ignore read failures
          }
        }

        return {
          timestamp: Date.now(),
          fps: Math.round(nativeMetrics.fps),
          cpuUsage,
          gpuUsage: Math.round(nativeMetrics.gpu_usage),
          cpuTemp: Math.round(nativeMetrics.cpu_temp),
          gpuTemp: Math.round(nativeMetrics.gpu_temp),
          ramUsageMB,
        };
      }
    }

    // Fallback to systeminformation
    const [cpuLoad, cpuTemp, mem, graphics] = await Promise.all([
      si.currentLoad(),
      si.cpuTemperature(),
      si.mem(),
      si.graphics(),
    ]);

    const gpuController = graphics.controllers?.[0];

    return {
      timestamp: Date.now(),
      fps: 0, // FPS requires DirectX/Vulkan hook — not available at system level
      cpuUsage: Math.round(cpuLoad.currentLoad),
      gpuUsage: gpuController?.utilizationGpu ?? 0,
      cpuTemp: Math.round(cpuTemp.main ?? 0),
      gpuTemp: gpuController?.temperatureGpu ?? 0,
      ramUsageMB: Math.round(mem.used / (1024 * 1024)),
    };
  }

  private static aggregateSamples(
    samples: HardwareSample[]
  ): HardwareMetricsSnapshot {
    const fpsValues = samples.map((s) => s.fps).filter((f) => f > 0);
    const cpuUsageValues = samples.map((s) => s.cpuUsage);
    const gpuUsageValues = samples.map((s) => s.gpuUsage);
    const cpuTempValues = samples.map((s) => s.cpuTemp).filter((t) => t > 0);
    const gpuTempValues = samples.map((s) => s.gpuTemp).filter((t) => t > 0);
    const ramValues = samples.map((s) => s.ramUsageMB);

    const avg = (arr: number[]): number =>
      arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const min = (arr: number[]): number => (arr.length > 0 ? Math.min(...arr) : 0);
    const max = (arr: number[]): number => (arr.length > 0 ? Math.max(...arr) : 0);

    return {
      avgFps: avg(fpsValues),
      minFps: min(fpsValues),
      maxFps: max(fpsValues),
      avgCpuUsage: avg(cpuUsageValues),
      maxCpuUsage: max(cpuUsageValues),
      avgGpuUsage: avg(gpuUsageValues),
      maxGpuUsage: max(gpuUsageValues),
      avgCpuTemp: avg(cpuTempValues),
      maxCpuTemp: max(cpuTempValues),
      avgGpuTemp: avg(gpuTempValues),
      maxGpuTemp: max(gpuTempValues),
      avgRamUsageMB: avg(ramValues),
      maxRamUsageMB: max(ramValues),
      samples,
    };
  }
}

// Initialize config from saved preferences on module load
HardwareMonitor.loadConfigFromPreferences().catch(() => {});
