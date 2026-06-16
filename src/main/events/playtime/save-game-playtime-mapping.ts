import { registerEvent } from "../register-event";
import { db, levelKeys } from "@main/level";
import { invalidateProvider } from "@main/services/playtime-providers/cache";
import type { Game, PlaytimeMapping } from "@types";

export interface SaveGamePlaytimeMappingArgs {
  shop: string;
  objectId: string;
  provider: PlaytimeMapping["provider"];
  externalId: string;
  matchedSimilarityScore?: number;
}

export interface SaveGamePlaytimeMappingResult {
  ok: boolean;
  mapping: PlaytimeMapping | null;
  error?: string;
}

export function registerSaveGamePlaytimeMapping() {
  registerEvent(
    "saveGamePlaytimeMapping",
    async (
      _event,
      args: SaveGamePlaytimeMappingArgs
    ): Promise<SaveGamePlaytimeMappingResult> => {
      try {
        const { shop, objectId, provider, externalId } = args;
        if (!shop || !objectId || !provider || !externalId) {
          return {
            ok: false,
            mapping: null,
            error: "Missing required fields",
          };
        }

        const key = levelKeys.game(shop as Game["shop"], objectId);
        const existing = (await db.get(key, {
          valueEncoding: "json",
        })) as unknown as Game | undefined;

        if (!existing) {
          return {
            ok: false,
            mapping: null,
            error: "Game not found",
          };
        }

        const mapping: PlaytimeMapping = {
          provider,
          externalId,
          source: "manual",
          matchedSimilarityScore: args.matchedSimilarityScore ?? undefined,
          updatedAt: new Date().toISOString(),
        };

        const updated: Game = {
          ...existing,
          playtimeMapping: mapping,
        };

        await db.put(key, updated, { valueEncoding: "json" });

        // Evict any cached entries tied to the previous provider so
        // the renderer's next request fires against fresh state.
        invalidateProvider(provider);

        return { ok: true, mapping };
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[saveGamePlaytimeMapping] failed:", error);
        return {
          ok: false,
          mapping: null,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );
}
