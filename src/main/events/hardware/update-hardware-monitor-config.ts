import { HardwareMonitor } from "@main/services";
import { db, levelKeys } from "@main/level";
import type { UserPreferences } from "@types";
import { registerEvent } from "../register-event";
import { logger } from "@main/services";

const updateHardwareMonitorConfig = async (
  _event: Electron.IpcMainInvokeEvent,
  config: Partial<{
    enabled: boolean;
    pollingIntervalMs: number;
    alertsEnabled: boolean;
    selectedGpuIndex: number;
    fpsAlertThreshold: number;
    cpuTempAlertThreshold: number;
    gpuTempAlertThreshold: number;
    cpuUsageAlertThreshold: number;
    ramUsageAlertThresholdMB: number;
  }>
): Promise<{ success: boolean; error?: string }> => {
  try {
    HardwareMonitor.updateConfig(config);

    // Persist to preferences
    const prefs = await db.get<string, UserPreferences | null>(
      levelKeys.userPreferences,
      { valueEncoding: "json" }
    );

    const updatedPrefs: UserPreferences = {
      ...(prefs || {}),
      hardwareMonitorConfig: {
        ...HardwareMonitor.getConfig(),
      },
    };

    await db.put(levelKeys.userPreferences, JSON.stringify(updatedPrefs));
    return { success: true };
  } catch (error) {
    logger.error("Failed to update hardware monitor config", error);
    return { success: false, error: String(error) };
  }
};

registerEvent("updateHardwareMonitorConfig", updateHardwareMonitorConfig);
