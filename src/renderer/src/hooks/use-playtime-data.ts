import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Game,
  HowLongToBeatCategory,
  PlaytimeGameData,
  PlaytimeProviderId,
  PlaytimeSearchResult,
} from "@types";

export interface UsePlaytimeDataArgs {
  game: Game | null;
  /** Disabled-on-mount path (e.g. for the sidebar mirror). */
  disabled?: boolean;
}

export type PlaytimeState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "loaded";
      provider: PlaytimeProviderId;
      categories: HowLongToBeatCategory[];
      platforms: string[];
      title: string;
      imageUrl: string | null;
      similarityScore: number;
      manual: boolean;
    }
  | {
      /**
       * Auto-match or manual mapping identified a provider entry but the
       * detailed category data is unavailable. We still surface the
       * provider chip + confidence, just without durations.
       */
      status: "matched-no-data";
      provider: PlaytimeProviderId;
      providerTitle: string;
      similarityScore: number;
      manual: boolean;
    }
  | { status: "empty"; reason: "no-match" | "fetch-failed" }
  | { status: "error"; message: string };

/**
 * Renderer-side orchestrator for HLTB / Backlogged / IGDB+Steam data.
 *
 * Flow on mount:
 *   1. Hit the existing Hydra cloud endpoint `/games/:shop/:objectId/how-long-to-beat`
 *      — if it returns rows, we render `loaded` immediately and skip the
 *      auto-match path (the cloud already produced authoritative data).
 *   2. If cloud returned no rows, run `autoMatchPlaytime` across providers.
 *      - 0 hits → `empty / no-match`.
 *      - Hit + `fetchPlaytimeData` returns rows → `loaded`.
 *      - Hit + `fetchPlaytimeData` returns null → `matched-no-data`
 *        (we keep the chip visible rather than falsely claim "no match").
 *   3. Persist the best hit as an `auto` mapping on the Game record so
 *      subsequent visits don't repeat the roundtrip.
 */
export function usePlaytimeData({ game, disabled }: UsePlaytimeDataArgs): {
  state: PlaytimeState;
  refetch: () => Promise<void>;
} {
  const [state, setState] = useState<PlaytimeState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const performFetch = useCallback(async () => {
    if (!game || disabled) {
      setState({ status: "idle" });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: "loading" });

    // Step 1: cloud-side fetch — authoritatively returns categories.
    try {
      const remoteShot = await window.electron.hydraApi.get<
        HowLongToBeatCategory[] | null
      >(`/games/${game.shop}/${game.objectId}/how-long-to-beat`);

      if (controller.signal.aborted) return;
      if (remoteShot && remoteShot.length > 0) {
        const mapping = game.playtimeMapping;
        setState({
          status: "loaded",
          provider: mapping?.provider ?? "howlongtobeat",
          categories: remoteShot,
          platforms: [],
          title: game.title,
          imageUrl: null,
          similarityScore:
            mapping?.matchedSimilarityScore ?? AUTO_MATCH_DEFAULT_SCORE,
          manual: mapping?.source === "manual",
        });
        return;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[usePlaytimeData] cloud fetch failed:", err);
    }

    // Step 2: cross-provider auto-match fallback.
    try {
      const result: PlaytimeSearchResult | null =
        await window.electron.autoMatchPlaytime({
          title: game.title,
          appId: game.shop === "steam" ? Number(game.objectId) : null,
        });

      if (controller.signal.aborted) return;

      if (!result) {
        setState({ status: "empty", reason: "no-match" });
        return;
      }

      // Persist the auto mapping best-effort; the card still renders
      // regardless of whether the save succeeds.
      try {
        await window.electron.saveGamePlaytimeMapping({
          shop: game.shop,
          objectId: game.objectId,
          provider: result.provider,
          externalId: result.providerGameId,
          matchedSimilarityScore: result.similarityScore,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[usePlaytimeData] mapping save failed:", e);
      }

      // Step 3: hydrate detailed data for the match.
      let data: PlaytimeGameData | null = null;
      try {
        data = await window.electron.fetchPlaytimeData({
          provider: result.provider,
          externalId: result.providerGameId,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[usePlaytimeData] direct fetch failed:", e);
      }

      if (controller.signal.aborted) return;

      if (data && data.categories.length > 0) {
        setState({
          status: "loaded",
          provider: result.provider,
          title: data.title || result.title,
          platforms: data.platforms,
          imageUrl: data.imageUrl,
          categories: data.categories,
          similarityScore: result.similarityScore,
          manual: false,
        });
        return;
      }

      // Match succeeded but no detailed data — keep the chip visible so
      // the user knows where the entry came from and can pick a different
      // provider via the Edit picker.
      setState({
        status: "matched-no-data",
        provider: result.provider,
        providerTitle: result.title,
        similarityScore: result.similarityScore,
        manual: false,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [game, disabled]);

  useEffect(() => {
    void performFetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [performFetch]);

  const refetch = useCallback(() => performFetch(), [performFetch]);

  return { state, refetch };
}

const AUTO_MATCH_DEFAULT_SCORE = 0.95;
