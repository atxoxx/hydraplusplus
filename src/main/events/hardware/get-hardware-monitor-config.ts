import { HardwareMonitor } from "@main/services";
import { registerEvent } from "../register-event";

const getHardwareMonitorConfig = async () => {
  return HardwareMonitor.getConfig();
};

registerEvent("getHardwareMonitorConfig", getHardwareMonitorConfig);
