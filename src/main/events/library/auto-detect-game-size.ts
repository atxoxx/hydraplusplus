import { registerEvent } from "../register-event";
import { gamesSublevel, levelKeys } from "@main/level";
import { getDirectorySize } from "../helpers/get-directory-size";
import { logger } from "@main/services";
import type { GameShop } from "@types";
import path from "node:path";

const SUBFOLDER_NAMES = new Set([
  "bin",
  "bin32",
  "bin64",
  "binaries",
  "win32",
  "win64",
  "x64",
  "x86",
  "runtime",
  "engine",
  "plugins",
  "win",
  "osx",
  "linux",
  "retail",
  "system",
  "release",
  "debug",
  "build",
  "dist",
  "launcher",
  "executable",
  "executables",
  "cfg",
  "src",
  "res",
  "app",
  "pkg",
  "lib",
  "dll",
  "sys",
  "dev",
  "out",
  "mac",
]);

const LIBRARY_ROOT_NAMES = new Set([
  "games",
  "steamapps",
  "common",
  "steamlibrary",
  "hydra games",
  "downloads",
  "library",
  "epic games",
  "gog galaxy",
  "gog games",
]);

const getDirectoriesChain = (filePath: string): string[] => {
  const chain: string[] = [];
  let current = path.dirname(filePath);
  while (true) {
    const parent = path.dirname(current);
    if (parent === current || !current) break;
    const parsed = path.parse(current);
    if (current === parsed.root) {
      break;
    }
    chain.push(current);
    current = parent;
  }
  return chain;
};

const isSubfolder = (dirName: string): boolean => {
  const name = dirName.toLowerCase();
  if (SUBFOLDER_NAMES.has(name)) return true;
  // Any 1 or 2 character folder name is considered a subfolder (e.g. "xx", "r6")
  if (name.length <= 2) return true;
  return false;
};

const findGameRoot = (chain: string[]): string => {
  if (chain.length === 0) return "";
  if (chain.length === 1) return chain[0];

  for (let i = 0; i < chain.length; i++) {
    const currentDir = chain[i];
    const dirName = path.basename(currentDir).toLowerCase();

    if (i + 1 < chain.length) {
      const parentDirName = path.basename(chain[i + 1]).toLowerCase();
      if (LIBRARY_ROOT_NAMES.has(parentDirName)) {
        return currentDir;
      }
    }

    if (isSubfolder(dirName)) {
      continue;
    }

    return currentDir;
  }

  return chain[chain.length - 1];
};

const autoDetectGameSize = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<{ ok: boolean; size?: number; error?: string }> => {
  try {
    const gameKey = levelKeys.game(shop, objectId);
    const game = await gamesSublevel.get(gameKey).catch(() => null);
    if (!game) {
      return { ok: false, error: "Game not found" };
    }

    let targetPath = game.installPath;

    if (!targetPath) {
      if (!game.executablePath) {
        return { ok: false, error: "No game folder or executable path set" };
      }
      const chain = getDirectoriesChain(game.executablePath);
      targetPath = findGameRoot(chain);
    }

    if (!targetPath) {
      logger.warn(`Could not determine game root for: ${game.executablePath}`);
      return { ok: false, error: "Could not determine game root" };
    }

    logger.log(`Auto detecting game size at: ${targetPath}`);
    const size = await getDirectorySize(targetPath);

    const currentGame = await gamesSublevel.get(gameKey).catch(() => null);
    if (currentGame) {
      await gamesSublevel.put(gameKey, {
        ...currentGame,
        installedSizeInBytes: size,
      });
    }

    return { ok: true, size };
  } catch (err) {
    logger.error(`Failed to auto detect game size: ${err}`);
    return { ok: false, error: String(err) };
  }
};

registerEvent("autoDetectGameSize", autoDetectGameSize);
