import { WindowManager } from "./window-manager";
import { updateGameExecutablePath } from "@main/helpers/update-executable-path";
import { createGame, trackGamePlaytime } from "./library-sync";
import type { Game, GameRunning, GameShop, UserPreferences } from "@types";
import axios from "axios";
import {
  db,
  gamesSublevel,
  levelKeys,
  dailyPlaytimeSublevel,
  sessionsSublevel,
} from "@main/level";
import type { GameSession } from "@main/level";
import { CloudSync } from "./cloud-sync";
import { logger, networkLogger } from "./logger";
import { PowerSaveBlockerManager } from "./power-save-blocker";
import path from "node:path";
import { AchievementWatcherManager } from "./achievements/achievement-watcher-manager";
import { INTERVALS } from "@main/constants";
import { envConfig } from "@main/env-config";
import { Wine } from "./wine";
import { NativeAddon } from "./native-addon";
import { HardwareMonitor } from "./hardware-monitor";
import { emulatorSessions } from "./emulators/emulator-session-tracker";

export const gamesPlaytime = new Map<
  string,
  { lastTick: number; firstTick: number; lastSyncTick: number }
>();

const activeSessions = new Map<string, { id: string; startTime: number }>();

const generateSessionId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const getGamesRunning = () => {
  const now = performance.now();
  const gamesRunning = Array.from(gamesPlaytime.entries()).map((entry) => {
    return {
      id: entry[0],
      sessionDurationInMillis: now - entry[1].firstTick,
    } as Pick<GameRunning, "id" | "sessionDurationInMillis">;
  });

  for (const [gameKey, session] of emulatorSessions) {
    gamesRunning.push({
      id: gameKey,
      sessionDurationInMillis: now - session.startedAt,
    });
  }

  return gamesRunning;
};

interface ExecutableInfo {
  name: string;
  os: string;
  exe: string;
}

interface GameExecutables {
  [key: string]: ExecutableInfo[];
}

interface LinuxProcessInfo {
  name: string;
  cwd: string;
  exe: string;
  steamCompatDataPath: string | null;
}

const TICKS_TO_UPDATE_API = (3 * 60 * 1000) / INTERVALS.processWatcher; // 3 minutes
let currentTick = 1;

const platform = process.platform;

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const updateDailyPlaytime = async (
  shop: GameShop,
  objectId: string,
  deltaMs: number
) => {
  const today = getTodayDateString();
  const key = levelKeys.dailyPlaytimeEntry(shop, objectId, today);

  try {
    const existing = await dailyPlaytimeSublevel.get(key);
    await dailyPlaytimeSublevel.put(key, {
      shop,
      objectId,
      date: today,
      totalMilliseconds: (existing ? existing.totalMilliseconds : 0) + deltaMs,
    });
  } catch (error) {
    logger.error("Failed to update daily playtime snapshot", error);
  }
};

const logPlaytimeTrace = (
  event: string,
  game: Game,
  payload?: Record<string, unknown>
) => {
  networkLogger.info("[playtime-trace]", event, {
    gameKey: levelKeys.game(game.shop, game.objectId),
    shop: game.shop,
    objectId: game.objectId,
    remoteId: game.remoteId,
    localPlayTimeInMilliseconds: Math.trunc(game.playTimeInMilliseconds ?? 0),
    unsyncedDeltaPlayTimeInMilliseconds:
      game.unsyncedDeltaPlayTimeInMilliseconds ?? 0,
    lastTimePlayed:
      game.lastTimePlayed instanceof Date
        ? game.lastTimePlayed.toISOString()
        : game.lastTimePlayed,
    ...payload,
  });
};

const getGameExecutables = async () => {
  const gameExecutables = (
    await axios
      .get(envConfig.externalResourcesUrl + "/game-executables.json")
      .catch(() => {
        return { data: {} };
      })
  ).data as GameExecutables;

  Object.keys(gameExecutables).forEach((key) => {
    gameExecutables[key] = gameExecutables[key]
      .filter((executable) => {
        if (platform === "win32") {
          return executable.os === "win32";
        } else if (platform === "linux") {
          return executable.os === "linux" || executable.os === "win32";
        }

        return false;
      })
      .map((executable) => {
        return {
          name:
            platform === "win32"
              ? executable.name.replace(/\//g, "\\")
              : executable.name,
          os: executable.os,
          exe: executable.name.slice(executable.name.lastIndexOf("/") + 1),
        };
      });
  });

  return gameExecutables;
};

export const gameExecutables = await getGameExecutables();

const findGamePathByProcess = async (
  processMap: Map<string, Set<string>>,
  winePrefixMap: Map<string, string>,
  gameId: string
) => {
  const executables = gameExecutables[gameId];

  for (const executable of executables) {
    const executablewithoutExtension = executable.exe.replace(/\.exe$/i, "");

    const pathSet =
      processMap.get(executable.exe) ??
      processMap.get(executablewithoutExtension);

    if (pathSet) {
      for (const path of pathSet) {
        if (
          path.toLowerCase().endsWith(executable.name) ||
          path.toLowerCase().endsWith(executablewithoutExtension)
        ) {
          const gameKey = levelKeys.game("steam", gameId);
          const game = await gamesSublevel.get(gameKey);

          if (game) {
            const updatedGame: Game = {
              ...updateGameExecutablePath(game, path),
            };

            if (process.platform === "linux" && winePrefixMap.has(path)) {
              updatedGame.winePrefixPath = winePrefixMap.get(path)!;
            }

            await gamesSublevel.put(gameKey, updatedGame);
            logger.info("Set game path", gameKey, path);
          }
        }
      }
    }
  }
};

const getSystemProcessMap = async () => {
  const {
    processMap: rawMap,
    winePrefixMap: rawWineMap,
    linuxProcesses,
  } = await NativeAddon.getSystemProcessMap();

  const processMap = new Map<string, Set<string>>(
    Object.entries(rawMap).map(([k, v]) => [k, new Set(v)])
  );

  const winePrefixMap = new Map<string, string>(Object.entries(rawWineMap));

  return { processMap, winePrefixMap, linuxProcesses };
};

const hasLinuxCompatibilityProcessMatch = (
  game: Game,
  executablePath: string,
  linuxProcesses: LinuxProcessInfo[]
) => {
  if (path.extname(executablePath).toLowerCase() !== ".exe") {
    return false;
  }

  const executableName = path.basename(executablePath).toLowerCase();
  const executableNameWithoutExtension = executableName.replace(/\.exe$/i, "");
  const executableDirectory = path.dirname(executablePath).toLowerCase();
  const expectedWinePrefix = Wine.getEffectivePrefixPath(
    game.winePrefixPath,
    game.objectId
  )?.toLowerCase();

  return linuxProcesses.some((process) => {
    if (process.cwd !== executableDirectory) {
      return false;
    }

    if (
      expectedWinePrefix &&
      process.steamCompatDataPath &&
      process.steamCompatDataPath !== expectedWinePrefix
    ) {
      return false;
    }

    if (
      process.name === executableName ||
      process.name === executableNameWithoutExtension
    ) {
      return true;
    }

    const processRunsUnderWine = process.exe.includes("wine");

    return processRunsUnderWine && process.name.length > 0;
  });
};

export const watchProcesses = async () => {
  const games = await gamesSublevel
    .values()
    .all()
    .then((results) => {
      return results.filter((game) => game.isDeleted === false);
    });

  if (!games.length) return;

  const { processMap, winePrefixMap, linuxProcesses } =
    await getSystemProcessMap();

  for (const game of games) {
    const gameKey = levelKeys.game(game.shop, game.objectId);
    const executablePath = game.executablePath;
    if (!executablePath) {
      if (gameExecutables[game.objectId]) {
        await findGamePathByProcess(processMap, winePrefixMap, game.objectId);
      }

      continue;
    }

    const executable = executablePath
      .slice(executablePath.lastIndexOf(platform === "win32" ? "\\" : "/") + 1)
      .toLowerCase();

    let hasProcess = processMap.get(executable)?.has(executablePath) ?? false;

    if (!hasProcess && platform === "linux") {
      hasProcess = hasLinuxCompatibilityProcessMatch(
        game,
        executablePath,
        linuxProcesses
      );
    }

    if (hasProcess) {
      if (gamesPlaytime.has(gameKey)) {
        onTickGame(game);
      } else {
        onOpenGame(game);
      }
    } else if (gamesPlaytime.has(gameKey)) {
      await onCloseGame(game);
    }
  }

  currentTick++;

  WindowManager.sendToAppWindows("on-games-running", getGamesRunning());
};

function onOpenGame(game: Game) {
  const now = performance.now();
  const gameKey = levelKeys.game(game.shop, game.objectId);

  gamesPlaytime.set(gameKey, {
    lastTick: now,
    firstTick: now,
    lastSyncTick: now,
  });

  // Create new session record
  const sessionId = generateSessionId();
  activeSessions.set(gameKey, { id: sessionId, startTime: now });

  // Start hardware monitoring if enabled
  HardwareMonitor.start(gameKey);

  logPlaytimeTrace("session-open", game, {
    performanceNow: now,
  });

  // On Linux, keep the launcher visible briefly and let it auto-close itself.
  if (process.platform !== "linux") {
    WindowManager.closeGameLauncherWindow();
  }

  // Hide Hydra to tray on game startup if enabled
  db.get<string, UserPreferences | null>(levelKeys.userPreferences, {
    valueEncoding: "json",
  })
    .then((userPreferences) => {
      if (userPreferences?.hideToTrayOnGameStart) {
        WindowManager.mainWindow?.hide();
      }
    })
    .catch(() => {});

  if (game.shop === "custom") return;

  AchievementWatcherManager.firstSyncWithRemoteIfNeeded(
    game.shop,
    game.objectId
  );

  if (game.remoteId) {
    const deltaToSync = game.unsyncedDeltaPlayTimeInMilliseconds ?? 0;
    const syncTimestamp = new Date();

    logPlaytimeTrace("open-sync-track-request", game, {
      deltaToSync,
      syncTimestamp: syncTimestamp.toISOString(),
    });

    trackGamePlaytime(game, deltaToSync, syncTimestamp)
      .then(() => {
        logPlaytimeTrace("open-sync-track-success", game, {
          deltaToSync,
        });

        gamesSublevel.put(gameKey, {
          ...game,
          unsyncedDeltaPlayTimeInMilliseconds: 0,
        });
      })
      .catch((error) => {
        logPlaytimeTrace("open-sync-track-failed", game, {
          deltaToSync,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    if (game.automaticCloudSync) {
      CloudSync.uploadSaveGame(
        game.objectId,
        game.shop,
        null,
        CloudSync.getBackupLabel(true)
      );
    }
  } else {
    const payload = { ...game, lastTimePlayed: new Date() };

    logPlaytimeTrace("open-sync-create-request", payload, {
      syncTimestamp:
        payload.lastTimePlayed instanceof Date
          ? payload.lastTimePlayed.toISOString()
          : payload.lastTimePlayed,
    });

    createGame(payload)
      .then(() => {
        logPlaytimeTrace("open-sync-create-success", payload);
      })
      .catch((error) => {
        logPlaytimeTrace("open-sync-create-failed", payload, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }
}

function onTickGame(game: Game) {
  const now = performance.now();
  const gamePlaytime = gamesPlaytime.get(
    levelKeys.game(game.shop, game.objectId)
  )!;

  const delta = now - gamePlaytime.lastTick;

  updateDailyPlaytime(game.shop, game.objectId, delta);

  const updatedGame: Game = {
    ...game,
    playTimeInMilliseconds: (game.playTimeInMilliseconds ?? 0) + delta,
    lastTimePlayed: new Date(),
  };

  gamesSublevel.put(levelKeys.game(game.shop, game.objectId), updatedGame);

  gamesPlaytime.set(levelKeys.game(game.shop, game.objectId), {
    ...gamePlaytime,
    lastTick: now,
  });

  if (currentTick % TICKS_TO_UPDATE_API === 0 && game.shop !== "custom") {
    const deltaToSync =
      now -
      gamePlaytime.lastSyncTick +
      (game.unsyncedDeltaPlayTimeInMilliseconds ?? 0);

    logPlaytimeTrace("periodic-sync-request", game, {
      method: game.remoteId ? "track" : "create",
      deltaToSync,
      performanceNow: now,
      lastSyncTick: gamePlaytime.lastSyncTick,
      lastTick: gamePlaytime.lastTick,
    });

    const gamePromise = game.remoteId
      ? trackGamePlaytime(game, deltaToSync, game.lastTimePlayed!)
      : createGame(game);

    gamePromise
      .then(() => {
        logPlaytimeTrace("periodic-sync-success", game, {
          method: game.remoteId ? "track" : "create",
          deltaToSync,
        });

        gamesSublevel.put(levelKeys.game(game.shop, game.objectId), {
          ...updatedGame,
          unsyncedDeltaPlayTimeInMilliseconds: 0,
        });
      })
      .catch((error) => {
        logPlaytimeTrace("periodic-sync-failed", game, {
          method: game.remoteId ? "track" : "create",
          deltaToSync,
          error: error instanceof Error ? error.message : String(error),
        });

        gamesSublevel.put(levelKeys.game(game.shop, game.objectId), {
          ...updatedGame,
          unsyncedDeltaPlayTimeInMilliseconds: deltaToSync,
        });
      })
      .finally(() => {
        gamesPlaytime.set(levelKeys.game(game.shop, game.objectId), {
          ...gamePlaytime,
          lastTick: now,
          lastSyncTick: now,
        });
      });
  }
}

const onCloseGame = async (game: Game) => {
  const gameKey = levelKeys.game(game.shop, game.objectId);
  const now = performance.now();
  const gamePlaytime = gamesPlaytime.get(gameKey)!;
  gamesPlaytime.delete(gameKey);
  PowerSaveBlockerManager.markGameClosed(gameKey);

  const delta = now - gamePlaytime.lastTick;

  await updateDailyPlaytime(game.shop, game.objectId, delta);

  // Finalize hardware monitoring and attach metrics to session
  const hardwareMetrics = HardwareMonitor.stop(gameKey);

  // Finalize and persist session
  const activeSession = activeSessions.get(gameKey);
  if (activeSession) {
    const sessionDurationMs = now - activeSession.startTime;
    const session: GameSession = {
      id: activeSession.id,
      shop: game.shop,
      objectId: game.objectId,
      startTime: new Date(activeSession.startTime).toISOString(),
      endTime: new Date(now).toISOString(),
      durationMs: sessionDurationMs,
      hardwareMetrics,
    };

    const sessionId = activeSession.id;
    try {
      await sessionsSublevel.put(levelKeys.session(game.shop, game.objectId, sessionId), session);
      activeSessions.delete(gameKey);
    } catch (error) {
      logger.error("Failed to persist game session", error);
    }
  }

  logPlaytimeTrace("session-close", game, {
    performanceNow: now,
    delta,
    firstTick: gamePlaytime.firstTick,
    lastTick: gamePlaytime.lastTick,
    lastSyncTick: gamePlaytime.lastSyncTick,
  });

  const updatedGame: Game = {
    ...game,
    playTimeInMilliseconds: (game.playTimeInMilliseconds ?? 0) + delta,
    lastTimePlayed: new Date(),
  };

  await gamesSublevel.put(gameKey, updatedGame);

  if (game.shop === "custom") return;

  if (game.remoteId) {
    if (game.automaticCloudSync) {
      CloudSync.uploadSaveGame(
        game.objectId,
        game.shop,
        null,
        CloudSync.getBackupLabel(true)
      );
    }

    const deltaToSync =
      now -
      gamePlaytime.lastSyncTick +
      (game.unsyncedDeltaPlayTimeInMilliseconds ?? 0);

    logPlaytimeTrace("close-sync-track-request", game, {
      deltaToSync,
      syncTimestamp:
        game.lastTimePlayed instanceof Date
          ? game.lastTimePlayed.toISOString()
          : game.lastTimePlayed,
    });

    try {
      await trackGamePlaytime(game, deltaToSync, game.lastTimePlayed!);
      logPlaytimeTrace("close-sync-track-success", game, {
        deltaToSync,
      });

      await gamesSublevel.put(gameKey, {
        ...updatedGame,
        unsyncedDeltaPlayTimeInMilliseconds: 0,
      });
    } catch (error) {
      logPlaytimeTrace("close-sync-track-failed", game, {
        deltaToSync,
        error: error instanceof Error ? error.message : String(error),
      });

      await gamesSublevel.put(gameKey, {
        ...updatedGame,
        unsyncedDeltaPlayTimeInMilliseconds: deltaToSync,
      });
    }
  } else {
    logPlaytimeTrace("close-sync-create-request", game, {
      syncTimestamp:
        game.lastTimePlayed instanceof Date
          ? game.lastTimePlayed.toISOString()
          : game.lastTimePlayed,
    });

    try {
      await createGame(game);
      logPlaytimeTrace("close-sync-create-success", game);
    } catch (error) {
      logPlaytimeTrace("close-sync-create-failed", game, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

export const clearGamesPlaytime = async () => {
  for (const game of gamesPlaytime.keys()) {
    const gameData = await gamesSublevel.get(game);

    if (gameData) {
      await onCloseGame(gameData);
    }
  }

  gamesPlaytime.clear();
};
