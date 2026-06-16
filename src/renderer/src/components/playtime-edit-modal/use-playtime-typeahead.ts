import { useEffect, useRef, useState } from "react";
import type { Game, PlaytimeProviderId, PlaytimeSearchResult } from "@types";

export interface UsePlaytimeTypeaheadArgs {
  provider: PlaytimeProviderId;
  query: string;
  enabled: boolean;
  game: Game;
}

interface State {
  liveResults: PlaytimeSearchResult[];
  libraryResults: PlaytimeSearchResult[];
  isSearching: boolean;
  searchError: string | null;
}

const INITIAL_STATE: State = {
  liveResults: [],
  libraryResults: [],
  isSearching: false,
  searchError: null,
};

/**
 * Combines two result streams for the Edit picker:
 *   - `liveResults`: provider-backed typeahead (debounced 250ms)
 *   - `libraryResults`: in-memory cache of previously-selected mappings,
 *     filtered locally by query so the user sees suggestions before the
 *     network round-trip returns.
 *
 * The cache is sourced from `window.electron.leveldb.values("metadataCache")`
 * fall-throughs to a tiny module-level Map keyed by query because the
 * LevelDB cache only stores the resolved metadata, not past selections.
 * For simplicity and to avoid a new IPC roundtrip per query, we maintain
 * a local module-level selection cache that survives re-mounts inside
 * the same renderer.
 */
const localSelectionCache: PlaytimeSearchResult[] = [];

export function usePlaytimeTypeahead({
  provider,
  query,
  enabled,
  game,
}: UsePlaytimeTypeaheadArgs): State {
  const [state, setState] = useState<State>(INITIAL_STATE);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState(INITIAL_STATE);
      return;
    }
    const trimmed = (query ?? "").trim();

    // Always compute library results synchronously so the UI updates
    // instantly as the user types.
    const libraryResults =
      trimmed.length < 1
        ? []
        : localSelectionCache
            .filter((r) => r.provider === provider)
            .filter(
              (r) =>
                r.title.toLowerCase().includes(trimmed.toLowerCase()) ||
                r.providerGameId === trimmed
            )
            .slice(0, 5);

    if (trimmed.length < 2) {
      setState({
        liveResults: [],
        libraryResults,
        isSearching: false,
        searchError: null,
      });
      return;
    }

    lastControllerRef.current?.abort();
    setState((prev) => ({
      ...prev,
      libraryResults,
      isSearching: true,
      searchError: null,
    }));

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      lastControllerRef.current = controller;

      try {
        const results = await window.electron.searchPlaytimeGames({
          provider,
          query: trimmed,
        });

        if (controller.signal.aborted) return;

        // Side effect: remember this game's successful lookup so it
        // surfaces via `libraryResults` on subsequent opens.
        rememberSelection(game.title, provider, results);

        setState({
          liveResults: results,
          libraryResults,
          isSearching: false,
          searchError: null,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          liveResults: [],
          libraryResults,
          isSearching: false,
          searchError: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [provider, query, enabled, game.title, game.objectId]);

  return state;
}

function rememberSelection(
  gameTitle: string,
  provider: PlaytimeProviderId,
  results: PlaytimeSearchResult[]
) {
  if (results.length === 0) return;
  const top = results[0];
  const exists = localSelectionCache.some(
    (r) => r.provider === provider && r.providerGameId === top.providerGameId
  );
  if (exists) return;
  localSelectionCache.push({
    provider,
    providerGameId: top.providerGameId,
    title: top.title || gameTitle,
    releaseYear: top.releaseYear,
    platforms: top.platforms,
    imageUrl: top.imageUrl,
    similarityScore: top.similarityScore,
    estimatedSeconds: top.estimatedSeconds,
  });
  // Cap the cache so it doesn't grow unbounded.
  if (localSelectionCache.length > 50) {
    localSelectionCache.splice(0, localSelectionCache.length - 50);
  }
}
