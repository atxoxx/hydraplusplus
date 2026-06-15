import fs from "node:fs";
import path from "node:path";
import { registerEvent } from "../register-event";

export interface FoundExe {
  filePath: string;
  fileName: string;
  folderName: string;
}

const scanFolderForExes = async (
  _event: Electron.IpcMainInvokeEvent,
  folderPath: string
): Promise<FoundExe[]> => {
  const results: FoundExe[] = [];

  async function scanDir(dir: string) {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
          results.push({
            filePath: fullPath,
            fileName: entry.name,
            folderName: path.basename(dir),
          });
        }
      }
    } catch {
      // Skip directories we don't have permission to read
    }
  }

  await scanDir(folderPath);
  return results;
};

registerEvent("scanFolderForExes", scanFolderForExes);
