import { registerEvent } from "../register-event";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ASSETS_PATH } from "@main/constants";
import { networkLogger as logger } from "@main/services/logger";

const downloadRemoteAsset = async (
  _event: Electron.IpcMainInvokeEvent,
  remoteUrl: string,
  assetType: "icon" | "logo" | "hero"
): Promise<string> => {
  if (!remoteUrl) {
    throw new Error("No URL provided");
  }

  logger.log(`Downloading remote asset: ${remoteUrl}`);

  // Download the remote image
  const response = await axios.get<ArrayBuffer>(remoteUrl, {
    responseType: "arraybuffer",
    timeout: 15000,
    maxRedirects: 5,
    maxContentLength: 20 * 1024 * 1024, // 20 MB limit
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  // Validate response is actually an image
  const contentType = response.headers["content-type"] as string | undefined;
  if (!contentType || !contentType.startsWith("image/")) {
    throw new Error(
      `Unexpected content type: ${contentType ?? "unknown"}. Expected an image.`
    );
  }

  // Determine file extension from Content-Type
  let extension = ".png";

  if (contentType) {
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      extension = ".jpg";
    } else if (contentType.includes("webp")) {
      extension = ".webp";
    } else if (contentType.includes("gif")) {
      extension = ".gif";
    } else if (contentType.includes("png")) {
      extension = ".png";
    }
  } else {
    // Try to guess from URL
    const urlLower = remoteUrl.toLowerCase();
    if (urlLower.endsWith(".jpg") || urlLower.endsWith(".jpeg"))
      extension = ".jpg";
    else if (urlLower.endsWith(".webp")) extension = ".webp";
    else if (urlLower.endsWith(".gif")) extension = ".gif";
  }

  // Ensure assets directory exists
  if (!fs.existsSync(ASSETS_PATH)) {
    fs.mkdirSync(ASSETS_PATH, { recursive: true });
  }

  const customGamesAssetsPath = path.join(ASSETS_PATH, "custom-games");
  if (!fs.existsSync(customGamesAssetsPath)) {
    fs.mkdirSync(customGamesAssetsPath, { recursive: true });
  }

  const uniqueId = randomUUID();
  const fileName = `${assetType}-${uniqueId}${extension}`;
  const destinationPath = path.join(customGamesAssetsPath, fileName);

  // Write downloaded data to destination
  const buffer = Buffer.from(response.data);
  await fs.promises.writeFile(destinationPath, buffer);

  logger.log(`Remote asset saved: ${destinationPath}`);

  return `local:${destinationPath}`;
};

registerEvent("downloadRemoteAsset", downloadRemoteAsset);
