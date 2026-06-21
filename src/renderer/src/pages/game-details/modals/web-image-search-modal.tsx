import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchIcon, SyncIcon, XIcon, ImageIcon } from "@primer/octicons-react";
import { Button, Modal, TextField } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import type { Game, LibraryGame } from "@types";

import "./web-image-search-modal.scss";

type AssetType = "icon" | "logo" | "hero";
type SearchStatus = "idle" | "loading" | "loaded" | "empty" | "error";

interface AssetSearchResult {
  id: string;
  thumbnailUrl: string;
  fullImageUrl: string;
  sourceUrl: string;
  sourceName: string;
  width: number | null;
  height: number | null;
}

interface GameWithOriginalAssets extends Game {
  originalIconPath?: string;
  originalLogoPath?: string;
  originalHeroPath?: string;
}

interface LibraryGameWithCustomOriginalAssets extends LibraryGame {
  customOriginalIconPath?: string;
  customOriginalLogoPath?: string;
  customOriginalHeroPath?: string;
}

export interface WebImageSearchModalProps {
  visible: boolean;
  game: LibraryGame;
  assetType: AssetType;
  onClose: () => void;
  onGameUpdated: () => Promise<void> | void;
}

export function WebImageSearchModal({
  visible,
  game,
  assetType,
  onClose,
  onGameUpdated,
}: Readonly<WebImageSearchModalProps>) {
  const { t } = useTranslation("sidebar");
  const { showSuccessToast, showErrorToast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchResults, setSearchResults] = useState<AssetSearchResult[]>([]);
  const [selectedResult, setSelectedResult] =
    useState<AssetSearchResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const isCustomGame = useCallback(
    (currentGame: LibraryGame | Game): boolean => {
      return currentGame.shop === "custom";
    },
    []
  );

  const capitalizeAssetType = (type: AssetType): string => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const performSearch = useCallback(
    async (query: string) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;

      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setSearchStatus("loading");
      setSearchResults([]);
      setSelectedResult(null);

      try {
        const isOriginalTitle =
          trimmedQuery.toLowerCase() === game.title.toLowerCase();
        const response = await window.electron.searchGameAssetsAggregated(
          trimmedQuery,
          assetType,
          isOriginalTitle ? game.shop : undefined,
          isOriginalTitle ? game.objectId : undefined
        );

        if (controller.signal.aborted) return;

        if (response && response.results && response.results.length > 0) {
          setSearchResults(response.results);
          setSearchStatus("loaded");
        } else {
          setSearchResults([]);
          setSearchStatus("empty");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Web image search failed:", error);
        setSearchStatus("error");
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [game, assetType]
  );

  useEffect(() => {
    if (visible) {
      setSearchQuery(game.title);
      void performSearch(game.title);
    } else {
      // Reset state on close
      setSearchQuery("");
      setSearchStatus("idle");
      setSearchResults([]);
      setSelectedResult(null);
      setIsApplying(false);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [visible, game.title, performSearch]);

  // Clean up search abort on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSearchInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setSearchQuery(event.target.value);
  };

  const handleSearchInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      void performSearch(searchQuery);
    }
  };

  const handleApplyAsset = async (targetResult?: AssetSearchResult) => {
    const resultToApply = targetResult ?? selectedResult;
    if (!resultToApply || isApplying) return;

    setIsApplying(true);

    try {
      const copiedAssetUrl = await window.electron.downloadRemoteAsset(
        resultToApply.fullImageUrl,
        assetType
      );

      const localPath = copiedAssetUrl.replace("local:", "");

      if (isCustomGame(game)) {
        const gameWithAssets = game as GameWithOriginalAssets;
        const iconUrl =
          assetType === "icon" ? `local:${localPath}` : game.iconUrl;
        const logoImageUrl =
          assetType === "logo" ? `local:${localPath}` : game.logoImageUrl;
        const libraryHeroImageUrl =
          assetType === "hero"
            ? `local:${localPath}`
            : game.libraryHeroImageUrl;

        const originalIconPath =
          assetType === "icon"
            ? resultToApply.fullImageUrl
            : gameWithAssets.originalIconPath;
        const originalLogoPath =
          assetType === "logo"
            ? resultToApply.fullImageUrl
            : gameWithAssets.originalLogoPath;
        const originalHeroPath =
          assetType === "hero"
            ? resultToApply.fullImageUrl
            : gameWithAssets.originalHeroPath;

        await window.electron.updateCustomGame({
          shop: game.shop,
          objectId: game.objectId,
          title: game.title,
          iconUrl: iconUrl || undefined,
          logoImageUrl: logoImageUrl || undefined,
          libraryHeroImageUrl: libraryHeroImageUrl || undefined,
          originalIconPath: originalIconPath || undefined,
          originalLogoPath: originalLogoPath || undefined,
          originalHeroPath: originalHeroPath || undefined,
        });
      } else {
        const gameWithAssets = game as LibraryGameWithCustomOriginalAssets;
        const customIconUrl =
          assetType === "icon" ? `local:${localPath}` : game.customIconUrl;
        const customLogoImageUrl =
          assetType === "logo" ? `local:${localPath}` : game.customLogoImageUrl;
        const customHeroImageUrl =
          assetType === "hero" ? `local:${localPath}` : game.customHeroImageUrl;

        const customOriginalIconPath =
          assetType === "icon"
            ? resultToApply.fullImageUrl
            : gameWithAssets.customOriginalIconPath;
        const customOriginalLogoPath =
          assetType === "logo"
            ? resultToApply.fullImageUrl
            : gameWithAssets.customOriginalLogoPath;
        const customOriginalHeroPath =
          assetType === "hero"
            ? resultToApply.fullImageUrl
            : gameWithAssets.customOriginalHeroPath;

        await window.electron.updateGameCustomAssets({
          shop: game.shop,
          objectId: game.objectId,
          title: game.title,
          customIconUrl: customIconUrl || null,
          customLogoImageUrl: customLogoImageUrl || null,
          customHeroImageUrl: customHeroImageUrl || null,
          customOriginalIconPath: customOriginalIconPath || undefined,
          customOriginalLogoPath: customOriginalLogoPath || undefined,
          customOriginalHeroPath: customOriginalHeroPath || undefined,
        });
      }

      showSuccessToast(
        t("edit_game_modal_image_applied", {
          type: capitalizeAssetType(assetType),
        })
      );

      await onGameUpdated();
      onClose();
    } catch (error) {
      console.error("Failed to apply asset:", error);
      showErrorToast(
        t("edit_game_modal_failed", { defaultValue: "Failed to apply asset" })
      );
    } finally {
      setIsApplying(false);
    }
  };

  const dimensionLabel = (result: AssetSearchResult) =>
    result.width && result.height ? `${result.width}×${result.height}` : null;

  const renderContent = () => {
    if (searchStatus === "loading") {
      return (
        <div className="web-image-search-modal__status">
          <SyncIcon
            size={28}
            className="web-image-search-modal__spinner animate-spin"
          />
          <span className="web-image-search-modal__status-text">
            {t("edit_game_modal_searching")}
          </span>
        </div>
      );
    }

    if (searchStatus === "error") {
      return (
        <div className="web-image-search-modal__status web-image-search-modal__status--error">
          <XIcon size={28} />
          <span className="web-image-search-modal__status-text">
            {t("edit_game_modal_search_error")}
          </span>
          <Button
            type="button"
            theme="outline"
            onClick={() => performSearch(searchQuery)}
          >
            {t("edit_game_modal_search_retry")}
          </Button>
        </div>
      );
    }

    if (
      searchStatus === "empty" ||
      (searchStatus === "loaded" && searchResults.length === 0)
    ) {
      return (
        <div className="web-image-search-modal__status">
          <ImageIcon size={28} />
          <span className="web-image-search-modal__status-text">
            {t("edit_game_modal_no_results")}
          </span>
        </div>
      );
    }

    return (
      <div className="web-image-search-modal__results-grid">
        {searchResults.map((result) => {
          const dims = dimensionLabel(result);
          const isSelected = selectedResult?.id === result.id;
          return (
            <button
              key={result.id}
              type="button"
              className={`web-image-search-modal__result-thumb ${
                isSelected
                  ? "web-image-search-modal__result-thumb--selected"
                  : ""
              }`}
              onClick={() => setSelectedResult(result)}
              onDoubleClick={() => handleApplyAsset(result)}
              aria-label={`${result.sourceName}${dims ? ` (${dims})` : ""}`}
            >
              <img
                src={result.thumbnailUrl}
                alt={result.sourceName}
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <span className="web-image-search-modal__result-source-badge">
                {result.sourceName}
              </span>
              {dims && (
                <span className="web-image-search-modal__result-dims-badge">
                  {dims}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Modal
      visible={visible}
      title={t("edit_game_modal_search_online_for", {
        type: capitalizeAssetType(assetType),
        defaultValue: `Search Online for ${capitalizeAssetType(assetType)}`,
      })}
      onClose={onClose}
      large={true}
    >
      <div className="web-image-search-modal">
        <div className="web-image-search-modal__search-row">
          <TextField
            placeholder={game.title || t("edit_game_modal_search_placeholder")}
            value={searchQuery}
            onChange={handleSearchInputChange}
            onKeyDown={handleSearchInputKeyDown}
            theme="dark"
            rightContent={
              <Button
                type="button"
                theme="outline"
                onClick={() => performSearch(searchQuery)}
                disabled={!searchQuery.trim() || searchStatus === "loading"}
              >
                <SearchIcon size={14} />
              </Button>
            }
          />
        </div>

        <div className="web-image-search-modal__content-container">
          {renderContent()}
        </div>

        <div className="web-image-search-modal__footer">
          <span className="web-image-search-modal__disclaimer">
            {t("edit_game_modal_disclaimer")}
          </span>
          <div className="web-image-search-modal__actions">
            <Button
              type="button"
              theme="outline"
              onClick={onClose}
              disabled={isApplying}
            >
              {t("edit_game_modal_cancel")}
            </Button>
            <Button
              type="button"
              theme="primary"
              onClick={() => handleApplyAsset()}
              disabled={!selectedResult || isApplying}
            >
              {isApplying
                ? t("edit_game_modal_applying")
                : t("edit_game_modal_apply")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
