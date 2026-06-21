import si from "systeminformation";
import { registerEvent } from "../register-event";

export interface SystemGpu {
  index: number;
  model: string;
  vendor: string;
  vram: number;
}

const getSystemGpus = async (): Promise<SystemGpu[]> => {
  try {
    const graphics = await si.graphics();
    return (graphics.controllers ?? []).map((ctrl, index) => ({
      index,
      model: ctrl.model || `GPU ${index}`,
      vendor: ctrl.vendor || "Unknown",
      vram: ctrl.vram ?? 0,
    }));
  } catch {
    return [];
  }
};

registerEvent("getSystemGpus", getSystemGpus);
