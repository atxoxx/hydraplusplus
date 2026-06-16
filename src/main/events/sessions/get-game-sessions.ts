import type { GameShop } from "@types";
import type { GameSession } from "@main/level";
import { sessionsSublevel, levelKeys } from "@main/level";
import { registerEvent } from "../register-event";

const getGameSessions = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  limit?: number,
  offset?: number
): Promise<GameSession[]> => {
  const sessions: GameSession[] = [];
  const prefix = levelKeys.session(shop, objectId, "");

  for await (const [key, value] of sessionsSublevel.iterator()) {
    if (!key.startsWith(prefix)) continue;
    sessions.push(value);
  }

  // Sort by start time descending (most recent first)
  sessions.sort(
    (a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  const start = offset ?? 0;
  const end = limit ? start + limit : sessions.length;

  return sessions.slice(start, end);
};

registerEvent("getGameSessions", getGameSessions);
