import type { GameShop } from "@types";
import { db } from "../level";
import { levelKeys } from "./keys";

export interface HardwareSample {
  timestamp: number;
  fps: number;
  cpuUsage: number;
  gpuUsage: number;
  cpuTemp: number;
  gpuTemp: number;
  ramUsageMB: number;
}

export interface HardwareMetricsSnapshot {
  avgFps: number;
  minFps: number;
  maxFps: number;
  avgCpuUsage: number;
  maxCpuUsage: number;
  avgGpuUsage: number;
  maxGpuUsage: number;
  avgCpuTemp: number;
  maxCpuTemp: number;
  avgGpuTemp: number;
  maxGpuTemp: number;
  avgRamUsageMB: number;
  maxRamUsageMB: number;
  gpuPowerWatts?: number;
  cpuPowerWatts?: number;
  samples: HardwareSample[];
}

export interface GameSession {
  id: string;
  shop: GameShop;
  objectId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  hardwareMetrics?: HardwareMetricsSnapshot;
}

export const sessionsSublevel = db.sublevel<string, GameSession>(
  levelKeys.sessions,
  {
    valueEncoding: "json",
  }
);
