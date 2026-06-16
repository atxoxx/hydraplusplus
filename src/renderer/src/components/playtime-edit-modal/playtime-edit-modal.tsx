import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchIcon, SyncIcon, ClockIcon } from "@primer/octicons-react";
import { Modal, Button, TextField } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import type { Game, PlaytimeProviderId, PlaytimeSearchResult } from "@types";
import { PROVIDER_ORDER, RENDERABLE_PROVIDER_META } from "@shared";

import { usePlaytimeTypeahead } from "./use-playtime-typeahead";
import "./playtime-edit-modal.scss";

export interface PlaytimeEditModalProps {
  visible: boolean;
  game: Game;
  initialProvider?: PlaytimeProviderId;
  initialExternalId?: string;
  onClose: () => void;
  onSaved?: (provider: PlaytimeProviderId, externalId: string) => void;
}

export function PlaytimeEditModal({
  visible,
  game,
  initialProvider,
  initialExternalId,
  onClose,
  onSaved,
}: Readonly<PlaytimeEditModalProps>) {
  const { t } = useTranslation("game_details");
  const { showSuccessToast, showErrorToast } = useToast();

  const [provider, setProvider] = useState<PlaytimeProviderId>(
    initialProvider ?? "howlongtobeat"
  );
  const [query, setQuery] = useState(game.title);
  const [selected, setSelected] = useState<PlaytimeSearchResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { liveResults, libraryResults, isSearching, searchError } =
    usePlaytimeTypeahead({
      provider,
      query,
      enabled: visible,
      game,
    });

  // Reset state whenever the modal opens or the game changes.
  useEffect(() => {
    if (!visible) return;
    setQuery(game.title);
    setSelected(null);
    setProvider(initialProvider ?? "howlongtobeat");
  }, [visible, game.title, game.objectId, game.shop, initialProvider]);

  // If the modal opens with an existing mapping, render the currently
  // selected row by reusing the existing search result via `selected`.
  useEffect(() => {
    if (visible && initialExternalId && !selected && liveResults.length > 0) {
      const match = liveResults.find(
        (r) => r.providerGameId === initialExternalId
      );
      if (match) setSelected(match);
    }
  }, [visible, initialExternalId, liveResults, selected]);

  // Allow Enter in the search field to pick the top live result.
  const handleEnter = useCallback(() => {
    if (liveResults.length > 0 && !selected) {
      setSelected(liveResults[0]);
    }
  }, [liveResults, selected]);

  const handleSave = useCallback(async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      const result = await window.electron.saveGamePlaytimeMapping({
        shop: game.shop,
        objectId: game.objectId,
        provider: selected.provider,
        externalId: selected.providerGameId,
        matchedSimilarityScore: selected.similarityScore,
      });

      if (!result.ok) {
        showErrorToast(
          t("playtime_edit_save_failed", result.error ?? "Save failed")
        );
        return;
      }

      showSuccessToast(t("playtime_edit_saved"));
      onSaved?.(selected.provider, selected.providerGameId);
      onClose();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [
    game.shop,
    game.objectId,
    onClose,
    onSaved,
    selected,
    showErrorToast,
    showSuccessToast,
    t,
  ]);

  const providerLabel = useMemo(
    () =>
      PROVIDER_ORDER.map((id) => ({
        value: id,
        label: RENDERABLE_PROVIDER_META[id].displayName,
      })),
    []
  );

  const queryInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Modal
      visible={visible}
      title={t("playtime_edit_title")}
      onClose={onClose}
      large
    >
      <div className="playtime-edit-modal">
        <label className="playtime-edit-modal__field">
          <span className="playtime-edit-modal__field-label">
            {t("playtime_edit_provider_label")}
          </span>
          <select
            className="playtime-edit-modal__select"
            value={provider}
            disabled={isSaving}
            onChange={(e) => setProvider(e.target.value as PlaytimeProviderId)}
          >
            {providerLabel.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div className="playtime-edit-modal__search-row">
          <TextField
            theme="dark"
            placeholder={t("playtime_edit_search_label")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEnter();
            }}
            rightContent={
              <Button
                type="button"
                theme="outline"
                onClick={() => handleEnter()}
                disabled={query.trim().length < 2 || isSearching}
              >
                {isSearching ? (
                  <SyncIcon
                    size={14}
                    className="playtime-edit-modal__spinner"
                  />
                ) : (
                  <SearchIcon size={14} />
                )}
              </Button>
            }
            ref={queryInputRef}
          />
        </div>

        <div className="playtime-edit-modal__library-results">
          {libraryResults.length > 0 && (
            <>
              <div className="playtime-edit-modal__section-header">
                {t("playtime_edit_library_results")}
              </div>
              <div className="playtime-edit-modal__results-list">
                {libraryResults.map((r) => {
                  const key = `${r.provider}-${r.providerGameId}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`playtime-edit-modal__result-item ${
                        selected?.providerGameId === r.providerGameId &&
                        selected?.provider === r.provider
                          ? "playtime-edit-modal__result-item--selected"
                          : ""
                      }`}
                      onClick={() => setSelected(r)}
                    >
                      <span className="playtime-edit-modal__result-icon">
                        <ClockIcon size={16} />
                      </span>
                      <div className="playtime-edit-modal__result-body">
                        <span className="playtime-edit-modal__result-title">
                          {r.title}
                        </span>
                        <span className="playtime-edit-modal__result-meta">
                          {RENDERABLE_PROVIDER_META[r.provider].displayName}
                          {r.releaseYear && ` · ${r.releaseYear}`}
                        </span>
                      </div>
                      <span className="playtime-edit-modal__result-match">
                        {Math.round(r.similarityScore * 100)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="playtime-edit-modal__live-results">
          <div className="playtime-edit-modal__section-header">
            {t("playtime_edit_live_results")}
          </div>

          {isSearching && (
            <div className="playtime-edit-modal__status">
              <SyncIcon className="playtime-edit-modal__spinner" />
              <span>{t("edit_game_modal_searching", "Searching...")}</span>
            </div>
          )}

          {!isSearching && searchError && (
            <div className="playtime-edit-modal__status">
              <span>{searchError}</span>
            </div>
          )}

          {!isSearching && !searchError && liveResults.length === 0 && (
            <div className="playtime-edit-modal__status">
              <span>{t("edit_game_modal_no_results", "No results")}</span>
            </div>
          )}

          {!isSearching && liveResults.length > 0 && (
            <div className="playtime-edit-modal__results-list">
              {liveResults.map((r) => {
                const key = `${r.provider}-${r.providerGameId}`;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`playtime-edit-modal__result-item ${
                      selected?.providerGameId === r.providerGameId &&
                      selected?.provider === r.provider
                        ? "playtime-edit-modal__result-item--selected"
                        : ""
                    }`}
                    onClick={() => setSelected(r)}
                  >
                    {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        alt=""
                        className="playtime-edit-modal__result-thumb"
                      />
                    ) : (
                      <span className="playtime-edit-modal__result-icon">
                        <ClockIcon size={16} />
                      </span>
                    )}
                    <div className="playtime-edit-modal__result-body">
                      <span className="playtime-edit-modal__result-title">
                        {r.title}
                      </span>
                      <span className="playtime-edit-modal__result-meta">
                        {RENDERABLE_PROVIDER_META[r.provider].displayName}
                        {r.releaseYear && ` · ${r.releaseYear}`}
                        {r.platforms.length > 0 &&
                          ` · ${r.platforms.slice(0, 3).join(", ")}`}
                      </span>
                    </div>
                    <span
                      className={`playtime-edit-modal__result-match ${
                        r.similarityScore < 0.85
                          ? "playtime-edit-modal__result-match--low"
                          : ""
                      }`}
                    >
                      {Math.round(r.similarityScore * 100)}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selected && (
          <div className="playtime-edit-modal__selected">
            <span className="playtime-edit-modal__selected-label">
              {t("playtime_edit_selected_label")}
            </span>
            <span className="playtime-edit-modal__selected-title">
              {selected.title}
            </span>
            <span className="playtime-edit-modal__selected-meta">
              {RENDERABLE_PROVIDER_META[selected.provider].displayName}
              {" · "}
              {Math.round(selected.similarityScore * 100)}%
            </span>
          </div>
        )}

        <div className="playtime-edit-modal__actions">
          <Button
            type="button"
            theme="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("metadata_cancel", "Cancel")}
          </Button>
          <Button
            type="button"
            theme="primary"
            onClick={handleSave}
            disabled={!selected || isSaving}
          >
            {isSaving
              ? t("metadata_applying", "Saving...")
              : t("playtime_edit_save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
