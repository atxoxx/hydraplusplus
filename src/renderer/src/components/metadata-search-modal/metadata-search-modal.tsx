import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchIcon, SyncIcon, GlobeIcon } from "@primer/octicons-react";
import { Modal, Button, TextField } from "@renderer/components";
import { useToast, useAppSelector } from "@renderer/hooks";
import { getSteamLanguage } from "@renderer/helpers";
import { logger } from "@renderer/logger";
import type { LibraryGame, MetadataSearchResult } from "@types";

import "./metadata-search-modal.scss";

const SOURCE_TABS: {
  id: string;
  labelKey: string;
}[] = [
  { id: "all", labelKey: "metadata_source_all" },
  { id: "steam", labelKey: "metadata_source_steam" },
  { id: "steamgriddb", labelKey: "metadata_source_steamgriddb" },
  { id: "pcgamingwiki", labelKey: "metadata_source_pcgamingwiki" },
  { id: "ign", labelKey: "metadata_source_ign" },
  { id: "vndb", labelKey: "metadata_source_vndb" },
];

const SOURCE_LABELS: Record<string, string> = {
  all: "All sources",
  steam: "Steam",
  "steam-direct": "Steam",
  "steam-enriched": "Steam",
  catalogue: "Catalogue",
  hydra: "Catalogue",
  igdb: "Catalogue",
  vndb: "VNDB",
  steamgriddb: "SteamGridDB",
  pcgamingwiki: "PCGamingWiki",
  ign: "IGN",
};

/** Major languages available for metadata search. */
const LANGUAGES: { code: string; label: string }[] = [
  { code: "english", label: "English" },
  { code: "french", label: "Français" },
  { code: "german", label: "Deutsch" },
  { code: "spanish", label: "Español" },
  { code: "italian", label: "Italiano" },
  { code: "brazilian", label: "Português (Brasil)" },
  { code: "russian", label: "Русский" },
  { code: "japanese", label: "日本語" },
  { code: "korean", label: "한국어" },
  { code: "schinese", label: "简体中文" },
  { code: "tchinese", label: "繁體中文" },
  { code: "polish", label: "Polski" },
  { code: "dutch", label: "Nederlands" },
  { code: "turkish", label: "Türkçe" },
];

// Returns the source code directly to pass through to IPC handlers
function normalizeSource(source: string): string {
  return source;
}

/** Fields that can be selectively merged from a metadata search result. */
const MERGE_FIELDS = [
  { key: "title", labelKey: "metadata_field_title" },
  { key: "releaseYear", labelKey: "metadata_field_release_date" },
  { key: "description", labelKey: "metadata_field_description" },
  { key: "genres", labelKey: "metadata_field_genres" },
  { key: "developers", labelKey: "metadata_field_developers" },
  { key: "publishers", labelKey: "metadata_field_publishers" },
] as const;

type MergeFieldKey = (typeof MERGE_FIELDS)[number]["key"];

/** Safe array accessors — filters out empty/whitespace strings so the
 *  joined preview never renders placeholders like ", , ," */
const cleaned = (values: unknown): string[] =>
  Array.isArray(values)
    ? values.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0
      )
    : [];
const safeGenres = (r: MetadataSearchResult): string[] => cleaned(r.genres);
const safeDevelopers = (r: MetadataSearchResult): string[] =>
  cleaned(r.developers);
const safePublishers = (r: MetadataSearchResult): string[] =>
  cleaned(r.publishers);

export interface MetadataSearchModalProps {
  visible: boolean;
  game: LibraryGame;
  onClose: () => void;
  onMetadataApplied?: () => void;
}

export function MetadataSearchModal({
  visible,
  game,
  onClose,
  onMetadataApplied,
}: Readonly<MetadataSearchModalProps>) {
  const { t, i18n } = useTranslation("game_details");
  const { showSuccessToast, showErrorToast } = useToast();

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState("all");
  // Language: use stored preference, fall back to UI language.
  // Sync from userPreferences when it loads or changes (e.g. async fetch on mount).
  const [selectedLanguage, setSelectedLanguage] = useState(() =>
    getSteamLanguage(i18n.language) || "english"
  );

  // When userPreferences loads async, sync the stored language preference.
  useEffect(() => {
    if (userPreferences?.metadataSearchLanguage) {
      setSelectedLanguage(userPreferences.metadataSearchLanguage);
    }
  }, [userPreferences?.metadataSearchLanguage]);

  const [results, setResults] = useState<MetadataSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] =
    useState<MetadataSearchResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Per-field checkbox state — all checked by default
  const [checkedFields, setCheckedFields] = useState<
    Record<MergeFieldKey, boolean>
  >({
    title: true,
    releaseYear: true,
    description: true,
    genres: true,
    developers: true,
    publishers: true,
  });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleSearch = useCallback(
    async (overrideQuery?: string, overrideSource?: string) => {
      const query = (overrideQuery ?? searchQuery).trim();
      const source = overrideSource ?? selectedSource;
      if (!query || query.length < 2) return;

      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setIsSearching(true);
      setHasSearched(true);
      setSearchError(null);
      setSelectedResult(null);

      try {
        const response = await window.electron.searchGameMetadata(
          query,
          normalizeSource(source),
          game.shop,
          selectedLanguage
        );
        if (!controller.signal.aborted) {
          setResults(response ?? []);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setResults([]);
          setSearchError(err instanceof Error ? err.message : "Search failed");
          logger.error("Metadata search failed:", err);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    },
    [searchQuery, selectedSource, game.shop, selectedLanguage]
  );

  // Auto-search when the modal opens or when switching games. We deliberately
  // do NOT include `selectedSource` here so that clicking a source tab does
  // not fire an immediate network request — it just clears the existing
  // results and the user can re-trigger via Enter / the Search button.
  useEffect(() => {
    if (!visible) return;
    // Cancel any in-flight search so we don't render stale results.
    abortRef.current?.abort();
    abortRef.current = null;

    setResults([]);
    setSelectedResult(null);
    setIsApplying(false);
    setHasSearched(false);
    setSearchError(null);
    setCheckedFields({
      title: true,
      releaseYear: true,
      description: true,
      genres: true,
      developers: true,
      publishers: true,
    });
    const title = game.title || "";
    setSearchQuery(title);
    if (title.trim().length >= 2) {
      // Run the search once — handleSearch closes over the current selectedSource
      // and aborts any previous in-flight request before issuing a new one.
      void handleSearch(title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, game.shop, game.objectId]);

  const handleSelectResult = (result: MetadataSearchResult) => {
    const wasSelected =
      selectedResult?.objectId === result.objectId &&
      selectedResult?.shop === result.shop;

    setSelectedResult(wasSelected ? null : result);

    if (!wasSelected) {
      // Reset checkboxes to all-checked when selecting a new result
      setCheckedFields({
        title: true,
        releaseYear: true,
        description: true,
        genres: true,
        developers: true,
        publishers: true,
      });
    }
  };

  const allFieldsChecked = Object.values(checkedFields).every(Boolean);
  const anyFieldChecked = Object.values(checkedFields).some(Boolean);

  const toggleAllFields = (checked: boolean) => {
    setCheckedFields({
      title: checked,
      releaseYear: checked,
      description: checked,
      genres: checked,
      developers: checked,
      publishers: checked,
    });
  };

  const toggleField = (field: MergeFieldKey) => {
    setCheckedFields((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleApplySelected = async () => {
    if (!selectedResult || isApplying || !anyFieldChecked) return;

    setIsApplying(true);

    try {
      const metadata: Record<string, unknown> = {};

      if (checkedFields.title) metadata.title = selectedResult.title;
      if (checkedFields.releaseYear && selectedResult.releaseYear) {
        // Format as full ISO date so the <input type="date"> control displays it.
        // Year-only numbers become invalid date inputs and appear blank.
        // Pass through an already-ISO date untouched.
        const raw = String(selectedResult.releaseYear);
        metadata.releaseDate = /^\d{4}$/.test(raw) ? `${raw}-01-01` : raw;
      }
      if (checkedFields.description) {
        metadata.description = selectedResult.description || null;
      }
      if (checkedFields.genres && safeGenres(selectedResult).length > 0) {
        metadata.genres = safeGenres(selectedResult);
      }
      if (
        checkedFields.developers &&
        safeDevelopers(selectedResult).length > 0
      ) {
        metadata.developers = safeDevelopers(selectedResult);
      }
      if (
        checkedFields.publishers &&
        safePublishers(selectedResult).length > 0
      ) {
        metadata.publishers = safePublishers(selectedResult);
      }

      // Always update title + icon through existing mechanism for compatibility
      if (checkedFields.title || selectedResult.iconUrl) {
        if (game.shop === "custom") {
          await window.electron.updateCustomGame({
            shop: game.shop,
            objectId: game.objectId,
            title: checkedFields.title ? selectedResult.title : game.title,
            iconUrl: selectedResult.iconUrl || undefined,
          });
        } else {
          await window.electron.updateGameCustomAssets({
            shop: game.shop,
            objectId: game.objectId,
            title: checkedFields.title ? selectedResult.title : game.title,
            customIconUrl: selectedResult.iconUrl || undefined,
            customLogoImageUrl: null,
            customHeroImageUrl: null,
          });
        }
      }

      // Save remaining metadata fields via the dedicated handler
      const hasMetadataFields = Object.keys(metadata).length > 0;
      if (hasMetadataFields) {
        const result = await window.electron.saveGameMetadata({
          shop: game.shop,
          objectId: game.objectId,
          metadata: {
            description: (metadata.description as string | null) ?? undefined,
            genres: (metadata.genres as string[] | null) ?? undefined,
            developers: (metadata.developers as string[] | null) ?? undefined,
            publishers: (metadata.publishers as string[] | null) ?? undefined,
            releaseDate: (metadata.releaseDate as string | null) ?? undefined,
          },
        });

        if (!result.ok) {
          logger.warn("saveGameMetadata returned not-ok:", result.error);
        }
      }

      showSuccessToast(t("custom_game_modal_metadata_applied"));
      onMetadataApplied?.();
      onClose();
    } catch (err) {
      logger.error("Failed to apply metadata:", err);
      showErrorToast(t("custom_game_modal_metadata_failed"));
    } finally {
      setIsApplying(false);
    }
  };

  const getFieldDisplayValue = (
    result: MetadataSearchResult,
    field: MergeFieldKey
  ): string => {
    switch (field) {
      case "title":
        return result.title ?? "";
      case "releaseYear":
        return result.releaseYear ? String(result.releaseYear) : "";
      case "description":
        return result.description || "";
      case "genres":
        return safeGenres(result).join(", ");
      case "developers":
        return safeDevelopers(result).join(", ");
      case "publishers":
        return safePublishers(result).join(", ");
    }
  };

  return (
    <Modal
      visible={visible}
      title={t("metadata_search_title")}
      onClose={onClose}
      large={true}
    >
      <div className="metadata-search-modal">
        <div className="metadata-search-modal__source-tabs">
          {SOURCE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`metadata-search-modal__source-tab ${
                selectedSource === tab.id
                  ? "metadata-search-modal__source-tab--active"
                  : ""
              }`}
              onClick={() => {
                setSelectedSource(tab.id);
                setResults([]);
                setSelectedResult(null);
                setHasSearched(false);
              }}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <div className="metadata-search-modal__search-row">
          <div className="metadata-search-modal__language-selector">
            <GlobeIcon size={14} />
            <select
              className="metadata-search-modal__language-dropdown"
              value={selectedLanguage}
              onChange={(e) => {
                const lang = e.target.value;
                setSelectedLanguage(lang);
                // Persist to user preferences
                window.electron
                  .updateUserPreferences({ metadataSearchLanguage: lang })
                  .catch(() => {});
              }}
              title={t("metadata_search_language", "Search Language")}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
          <TextField
            placeholder={t("metadata_search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            theme="dark"
            rightContent={
              <Button
                type="button"
                theme="outline"
                onClick={() => handleSearch()}
                disabled={!searchQuery.trim() || isSearching}
              >
                {isSearching ? (
                  <SyncIcon className="metadata-search-modal__spinner" />
                ) : (
                  <SearchIcon size={14} />
                )}
              </Button>
            }
          />
        </div>

        <div className="metadata-search-modal__results">
          {isSearching && (
            <div className="metadata-search-modal__status">
              <SyncIcon size={24} className="metadata-search-modal__spinner" />
              <span>{t("edit_game_modal_searching")}</span>
            </div>
          )}

          {!isSearching && hasSearched && results.length === 0 && (
            <div className="metadata-search-modal__status">
              <span>
                {searchError
                  ? searchError
                  : t("edit_game_modal_no_results", "No results")}
              </span>
              <Button
                type="button"
                theme="outline"
                onClick={() => handleSearch()}
              >
                {t("edit_game_modal_search_retry", "Retry")}
              </Button>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div className="metadata-search-modal__results-list">
              {results.map((result) => {
                const genres = safeGenres(result);
                const developers = safeDevelopers(result);
                return (
                  <button
                    key={`${result.shop}-${result.objectId}`}
                    type="button"
                    className={`metadata-search-modal__result-item ${
                      selectedResult?.objectId === result.objectId &&
                      selectedResult?.shop === result.shop
                        ? "metadata-search-modal__result-item--selected"
                        : ""
                    }`}
                    onClick={() => handleSelectResult(result)}
                  >
                    {result.iconUrl && (
                      <img
                        src={result.iconUrl}
                        alt=""
                        className="metadata-search-modal__result-icon"
                      />
                    )}
                    <div className="metadata-search-modal__result-info">
                      <span className="metadata-search-modal__result-title">
                        {result.title}
                      </span>
                      <span className="metadata-search-modal__result-shop">
                        {result.shop} ·{" "}
                        {SOURCE_LABELS[result.source] || result.source}
                        {result.releaseYear && ` · ${result.releaseYear}`}
                      </span>
                      {genres.length > 0 && (
                        <span className="metadata-search-modal__result-genres">
                          {genres.slice(0, 3).join(", ")}
                          {genres.length > 3 ? ` +${genres.length - 3}` : ""}
                        </span>
                      )}
                      {developers.length > 0 && (
                        <span className="metadata-search-modal__result-meta">
                          {developers.slice(0, 2).join(", ")}
                          {developers.length > 2
                            ? ` +${developers.length - 2}`
                            : ""}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!isSearching && !hasSearched && (
            <div className="metadata-search-modal__status">
              <span>{t("metadata_search_placeholder")}</span>
            </div>
          )}
        </div>

        {selectedResult && (
          <div className="metadata-search-modal__preview">
            <div className="metadata-search-modal__preview-header">
              {selectedResult.iconUrl && (
                <img
                  src={selectedResult.iconUrl}
                  alt=""
                  className="metadata-search-modal__preview-icon"
                />
              )}
              <div className="metadata-search-modal__preview-info">
                <span className="metadata-search-modal__preview-title">
                  {selectedResult.title}
                </span>
                <span className="metadata-search-modal__preview-shop">
                  {selectedResult.shop} ·{" "}
                  {SOURCE_LABELS[selectedResult.source] ||
                    selectedResult.source}
                </span>
                {selectedResult.releaseYear && (
                  <span className="metadata-search-modal__preview-year">
                    {selectedResult.releaseYear}
                  </span>
                )}
              </div>
            </div>

            <div className="metadata-search-modal__preview-toggle">
              <button
                type="button"
                className="metadata-search-modal__toggle-btn"
                onClick={() => toggleAllFields(!allFieldsChecked)}
              >
                {allFieldsChecked
                  ? t("metadata_deselect_all", "Deselect All")
                  : t("metadata_select_all", "Select All")}
              </button>
            </div>

            <div className="metadata-search-modal__preview-fields">
              {MERGE_FIELDS.map((field) => {
                const displayValue = getFieldDisplayValue(
                  selectedResult,
                  field.key as MergeFieldKey
                );
                if (!displayValue) return null;
                const fieldId = `metadata-field-${field.key}`;
                return (
                  <label
                    key={field.key}
                    htmlFor={fieldId}
                    aria-label={t(field.labelKey)}
                    className="metadata-search-modal__preview-field metadata-search-modal__preview-field--checkable"
                  >
                    <input
                      id={fieldId}
                      type="checkbox"
                      className="metadata-search-modal__preview-checkbox"
                      checked={checkedFields[field.key as MergeFieldKey]}
                      onChange={() => toggleField(field.key as MergeFieldKey)}
                      disabled={isApplying}
                    />
                    <div className="metadata-search-modal__preview-field-body">
                      <span className="metadata-search-modal__preview-field-label">
                        {t(field.labelKey)}
                      </span>
                      <span
                        className={`metadata-search-modal__preview-field-value ${
                          field.key === "description"
                            ? "metadata-search-modal__preview-field-value--description"
                            : ""
                        }`}
                      >
                        {displayValue}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="metadata-search-modal__actions">
          <Button
            type="button"
            theme="outline"
            onClick={onClose}
            disabled={isApplying}
          >
            {t("metadata_cancel", "Cancel")}
          </Button>
          <Button
            type="button"
            theme="primary"
            onClick={handleApplySelected}
            disabled={!selectedResult || isApplying || !anyFieldChecked}
          >
            {isApplying
              ? t("metadata_applying", "Applying...")
              : t("metadata_apply_selected", "Apply Selected")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
