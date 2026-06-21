import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  ChipInput,
  GameStatusDropdown,
  TextField,
} from "@renderer/components";
import { SearchIcon } from "@primer/octicons-react";
import type { LibraryGame, ShopDetails, UserGameStatus } from "@types";
import { useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";

import "./metadata-general-section.scss";

export interface MetadataGeneralSectionProps {
  game: LibraryGame;
  /** Shop details from the catalogue, used as fallback when game has no saved metadata. */
  shopDetails?: ShopDetails | null;
  /** Called when the user wants to search/download metadata from external sources. */
  onDownloadMetadata: () => void;
  /** Called after successful save to refresh the game context. */
  onSaved: () => void;
}

interface MetadataState {
  title: string;
  releaseDate: string;
  genres: string[];
  developers: string[];
  publishers: string[];
  tags: string[];
  userStatus: UserGameStatus | null;
}

function initializeState(
  game: LibraryGame,
  shopDetails?: ShopDetails | null
): MetadataState {
  return {
    title: game.title ?? "",
    releaseDate: getReleaseDate(game, shopDetails),
    genres: getArray(
      game.genres,
      shopDetails?.genres?.map((g) => g.name)
    ),
    developers: getArray(game.developers, shopDetails?.developers),
    publishers: getArray(game.publishers, shopDetails?.publishers),
    tags: game.tags ?? [],
    userStatus: (game.userStatus as UserGameStatus | null) ?? null,
  };
}

/** Returns the first non-empty array from the two sources. */
function getArray(
  primary: string[] | null | undefined,
  fallback: string[] | null | undefined
): string[] {
  if (primary && primary.length > 0) return primary;
  if (fallback && fallback.length > 0) return fallback;
  return [];
}

/** Returns the release date from game metadata, or falls back to Steam release date. */
function getReleaseDate(
  game: LibraryGame,
  shopDetails?: ShopDetails | null
): string {
  if (game.releaseDate) return game.releaseDate;
  if (shopDetails?.release_date?.date) return shopDetails.release_date.date;
  return "";
}

/**
 * Library-wide suggestion aggregator.
 *
 * Collects unique values for genres, developers, publishers, and tags
 * from all games in the library for the ChipInput suggestion dropdowns.
 */
function useLibrarySuggestions() {
  // In the future this should read from a LevelDB index or Redux store.
  // For now we return an empty array — the user can still type custom values.
  return useMemo(
    () => ({
      genres: [] as string[],
      developers: [] as string[],
      publishers: [] as string[],
      tags: [] as string[],
    }),
    []
  );
}

export function MetadataGeneralSection({
  game,
  shopDetails,
  onDownloadMetadata,
  onSaved,
}: Readonly<MetadataGeneralSectionProps>) {
  const { t } = useTranslation("game_details");
  const { showSuccessToast, showErrorToast } = useToast();

  const [state, setState] = useState<MetadataState>(() =>
    initializeState(game, shopDetails)
  );
  const [saving, setSaving] = useState(false);

  const suggestions = useLibrarySuggestions();

  // Reset state when the game identity changes
  useEffect(() => {
    setState(initializeState(game, shopDetails));
  }, [game.shop, game.objectId, shopDetails]);

  const hasChanges = useMemo(() => {
    const original = initializeState(game, shopDetails);
    return (
      state.title !== original.title ||
      state.releaseDate !== original.releaseDate ||
      JSON.stringify(state.genres) !== JSON.stringify(original.genres) ||
      JSON.stringify(state.developers) !==
        JSON.stringify(original.developers) ||
      JSON.stringify(state.publishers) !==
        JSON.stringify(original.publishers) ||
      JSON.stringify(state.tags) !== JSON.stringify(original.tags) ||
      state.userStatus !== original.userStatus
    );
  }, [state, game]);

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const result = await window.electron.saveGameMetadata({
        shop: game.shop,
        objectId: game.objectId,
        metadata: {
          releaseDate: state.releaseDate || null,
          genres: state.genres.length > 0 ? state.genres : null,
          developers: state.developers.length > 0 ? state.developers : null,
          publishers: state.publishers.length > 0 ? state.publishers : null,
          tags: state.tags.length > 0 ? state.tags : null,
          userStatus: state.userStatus,
        },
      });

      if (result.ok) {
        showSuccessToast(t("metadata_changes_saved"));
        onSaved();
      } else {
        showErrorToast(result.error || t("edit_game_modal_failed"));
      }
    } catch (err) {
      logger.error("Failed to save metadata:", err);
      showErrorToast(t("edit_game_modal_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="metadata-general-section">
      {/* Status dropdown — prominent at top */}
      <div className="metadata-general-section__field">
        <label className="metadata-general-section__label">
          {t("game_status", "Game Status")}
        </label>
        <GameStatusDropdown
          value={state.userStatus}
          onChange={(status) =>
            setState((prev) => ({
              ...prev,
              userStatus: status === "none" ? null : status,
            }))
          }
          disabled={saving}
        />
      </div>

      {/* Title */}
      <div className="metadata-general-section__field">
        <TextField
          label={t("metadata_field_title", "Title")}
          value={state.title}
          onChange={(e) =>
            setState((prev) => ({ ...prev, title: e.target.value }))
          }
          placeholder={t("edit_game_modal_enter_title")}
          disabled={saving}
          theme="dark"
        />
      </div>

      {/* Release Date */}
      <div className="metadata-general-section__field">
        <TextField
          label={t("metadata_field_release_date", "Release Date")}
          value={state.releaseDate}
          onChange={(e) =>
            setState((prev) => ({ ...prev, releaseDate: e.target.value }))
          }
          placeholder="YYYY-MM-DD"
          disabled={saving}
          theme="dark"
          type="date"
        />
      </div>

      {/* Genres */}
      <div className="metadata-general-section__field">
        <label className="metadata-general-section__label">
          {t("metadata_field_genres", "Genres")}
        </label>
        <ChipInput
          value={state.genres}
          onChange={(genres) => setState((prev) => ({ ...prev, genres }))}
          suggestions={suggestions.genres}
          placeholder={t("chip_input_placeholder", "Type and press Enter...")}
          disabled={saving}
        />
      </div>

      {/* Developers */}
      <div className="metadata-general-section__field">
        <label className="metadata-general-section__label">
          {t("metadata_field_developers", "Developers")}
        </label>
        <ChipInput
          value={state.developers}
          onChange={(developers) =>
            setState((prev) => ({ ...prev, developers }))
          }
          suggestions={suggestions.developers}
          placeholder={t("chip_input_placeholder", "Type and press Enter...")}
          disabled={saving}
        />
      </div>

      {/* Publishers */}
      <div className="metadata-general-section__field">
        <label className="metadata-general-section__label">
          {t("metadata_field_publishers", "Publishers")}
        </label>
        <ChipInput
          value={state.publishers}
          onChange={(publishers) =>
            setState((prev) => ({ ...prev, publishers }))
          }
          suggestions={suggestions.publishers}
          placeholder={t("chip_input_placeholder", "Type and press Enter...")}
          disabled={saving}
        />
      </div>

      {/* Tags */}
      <div className="metadata-general-section__field">
        <label className="metadata-general-section__label">
          {t("metadata_field_tags", "Tags")}
        </label>
        <ChipInput
          value={state.tags}
          onChange={(tags) => setState((prev) => ({ ...prev, tags }))}
          suggestions={suggestions.tags}
          placeholder={t("chip_input_placeholder", "Type and press Enter...")}
          disabled={saving}
        />
      </div>

      {/* Action buttons */}
      <div className="metadata-general-section__actions">
        <Button theme="outline" onClick={onDownloadMetadata} disabled={saving}>
          <SearchIcon size={14} />
          {t("metadata_download_button", "Download Metadata")}
        </Button>

        <Button
          theme="primary"
          onClick={handleSave}
          disabled={!hasChanges || saving}
        >
          {saving
            ? t("saving", "Saving...")
            : t("save_changes", "Save Changes")}
        </Button>
      </div>
    </div>
  );
}
