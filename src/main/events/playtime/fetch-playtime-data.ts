import { registerEvent } from "../register-event";
import { getProvider } from "@main/services/playtime-providers/playtime-aggregator";
import {
  getCachedFetch,
  setCachedFetch,
} from "@main/services/playtime-providers/cache";
import type { PlaytimeGameData, PlaytimeProviderId } from "@types";

export interface FetchPlaytimeDataArgs {
  provider: PlaytimeProviderId;
  externalId: string;
}

export function registerFetchPlaytimeData() {
  registerEvent(
    "fetchPlaytimeData",
    async (
      _event,
      { provider, externalId }: FetchPlaytimeDataArgs
    ): Promise<PlaytimeGameData | null> => {
      try {
        if (!externalId) return null;

        const cached = getCachedFetch(provider, externalId);
        if (cached) return cached;

        const result = await getProvider(provider).fetchById(externalId);
        if (result) setCachedFetch(provider, externalId, result);
        return result;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[fetchPlaytimeData] failed:", error);
        return null;
      }
    }
  );
}
