import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchIcon, SyncIcon } from "@primer/octicons-react";
import { Modal, Button, TextField } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import type { GameShop, LibraryGame } from "@types";

import "./metadata-search-modal.scss";

interface CatalogueSuggestion {
  title: string;
  objectId: string;
  shop: GameShop;
  iconUrl: string | null;
}

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
  const { t } = useTranslation("sidebar");
  const { showSuccessToast, showErrorToast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<CatalogueSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] =
    useState<CatalogueSuggestion | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSearchQuery(game.title);
      setResults([]);
      setSelectedResult(null);
      setIsApplying(false);
      setHasSearched(false);
    }
  }, [visible, game.title]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query || query.length < 2) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await window.electron.hydraApi.get<
        {
          title: string;
          objectId: string;
          shop: GameShop;
          iconUrl: string | null;
        }[]
      >("/catalogue/search/suggestions", {
        params: { query, limit: 8, shop: "steam" },
        needsAuth: false,
      });

      if (controller.signal.aborted) return;
      setResults(response);
    } catch {
      if (!controller.signal.aborted) {
        setResults([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, [searchQuery]);

  const handleSelectResult = (result: CatalogueSuggestion) => {
    setSelectedResult(
      selectedResult?.objectId === result.objectId &&
        selectedResult?.shop === result.shop
        ? null
        : result
    );
  };

  const handleApplyMetadata = async () => {
    if (!selectedResult || isApplying) return;

    setIsApplying(true);

    try {
      // Update the game title and icon
      if (game.shop === "custom") {
        await window.electron.updateCustomGame({
          shop: game.shop,
          objectId: game.objectId,
          title: selectedResult.title,
          iconUrl: selectedResult.iconUrl || undefined,
        });
      } else {
        await window.electron.updateGameCustomAssets({
          shop: game.shop,
          objectId: game.objectId,
          title: selectedResult.title,
          customIconUrl: selectedResult.iconUrl || undefined,
          customLogoImageUrl: null,
          customHeroImageUrl: null,
        });
      }

      showSuccessToast(t("custom_game_modal_metadata_applied"));
      onMetadataApplied?.();
      onClose();
    } catch (error) {
      console.error("Failed to apply metadata:", error);
      showErrorToast(t("custom_game_modal_metadata_failed"));
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={t("custom_game_modal_search_metadata")}
      onClose={onClose}
    >
      <div className="metadata-search-modal">
        <div className="metadata-search-modal__search-row">
          <TextField
            placeholder={t("custom_game_modal_search_placeholder")}
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
                onClick={handleSearch}
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
              <SyncIcon
                size={24}
                className="metadata-search-modal__spinner"
              />
              <span>{t("edit_game_modal_searching")}</span>
            </div>
          )}

          {!isSearching && hasSearched && results.length === 0 && (
            <div className="metadata-search-modal__status">
              <span>{t("edit_game_modal_no_results")}</span>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div className="metadata-search-modal__results-list">
              {results.map((result) => (
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
                      {result.shop}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!isSearching && !hasSearched && (
            <div className="metadata-search-modal__status">
              <span>{t("custom_game_modal_search_placeholder")}</span>
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
                  {selectedResult.shop}
                </span>
              </div>
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
            {t("custom_game_modal_cancel")}
          </Button>
          <Button
            type="button"
            theme="primary"
            onClick={handleApplyMetadata}
            disabled={!selectedResult || isApplying}
          >
            {isApplying
              ? t("custom_game_modal_adding")
              : t("custom_game_modal_apply_metadata")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
