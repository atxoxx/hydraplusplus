import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageIcon, SyncIcon } from "@primer/octicons-react";
import { Button } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import type { Game, LibraryGame, ShopDetailsWithAssets } from "@types";
import { WebImageSearchModal } from "./web-image-search-modal";

import "./game-assets-settings.scss";

type AssetType = "icon" | "logo" | "hero";

interface ElectronFile extends File {
  path?: string;
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

interface AssetPaths {
  icon: string;
  logo: string;
  hero: string;
}

interface AssetUrls {
  icon: string | null;
  logo: string | null;
  hero: string | null;
}

interface RemovedAssets {
  icon: boolean;
  logo: boolean;
  hero: boolean;
}

const VALID_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"] as const;

const INITIAL_ASSET_PATHS: AssetPaths = {
  icon: "",
  logo: "",
  hero: "",
};

const INITIAL_REMOVED_ASSETS: RemovedAssets = {
  icon: false,
  logo: false,
  hero: false,
};

const INITIAL_ASSET_URLS: AssetUrls = {
  icon: null,
  logo: null,
  hero: null,
};

export interface GameAssetsSettingsProps {
  game: LibraryGame;
  shopDetails: ShopDetailsWithAssets | null;
  onGameUpdated: () => Promise<void> | void;
}

export function GameAssetsSettings({
  game,
  shopDetails,
  onGameUpdated,
}: Readonly<GameAssetsSettingsProps>) {
  const { t } = useTranslation("sidebar");
  const { showSuccessToast, showErrorToast } = useToast();

  // --- Existing asset state ---
  const [assetPaths, setAssetPaths] = useState<AssetPaths>(INITIAL_ASSET_PATHS);
  const [originalAssetPaths, setOriginalAssetPaths] =
    useState<AssetPaths>(INITIAL_ASSET_PATHS);
  const [removedAssets, setRemovedAssets] = useState<RemovedAssets>(
    INITIAL_REMOVED_ASSETS
  );
  const [defaultUrls, setDefaultUrls] = useState<AssetUrls>(INITIAL_ASSET_URLS);
  const [isUpdating, setIsUpdating] = useState(false);
  const [pendingUpdateMessage, setPendingUpdateMessage] = useState<
    string | null
  >(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [isAutoFetching, setIsAutoFetching] = useState(false);

  // --- Search modal state ---
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchAssetType, setSearchAssetType] = useState<AssetType>("icon");

  const isCustomGame = useCallback(
    (currentGame: LibraryGame | Game): boolean => {
      return currentGame.shop === "custom";
    },
    []
  );

  const extractLocalPath = useCallback(
    (url: string | null | undefined): string => {
      return url?.startsWith("local:") ? url.replace("local:", "") : "";
    },
    []
  );

  const capitalizeAssetType = (assetType: AssetType): string => {
    return assetType.charAt(0).toUpperCase() + assetType.slice(1);
  };

  const setCustomGameAssets = useCallback(
    (currentGame: LibraryGame | Game) => {
      const gameWithAssets = currentGame as GameWithOriginalAssets;
      const iconRemoved =
        !currentGame.iconUrl && Boolean(gameWithAssets.originalIconPath);
      const logoRemoved =
        !currentGame.logoImageUrl && Boolean(gameWithAssets.originalLogoPath);
      const heroRemoved =
        !currentGame.libraryHeroImageUrl &&
        Boolean(gameWithAssets.originalHeroPath);

      setAssetPaths({
        icon: extractLocalPath(currentGame.iconUrl),
        logo: extractLocalPath(currentGame.logoImageUrl),
        hero: extractLocalPath(currentGame.libraryHeroImageUrl),
      });
      setOriginalAssetPaths({
        icon:
          gameWithAssets.originalIconPath ||
          extractLocalPath(currentGame.iconUrl),
        logo:
          gameWithAssets.originalLogoPath ||
          extractLocalPath(currentGame.logoImageUrl),
        hero:
          gameWithAssets.originalHeroPath ||
          extractLocalPath(currentGame.libraryHeroImageUrl),
      });

      setRemovedAssets({
        icon: iconRemoved,
        logo: logoRemoved,
        hero: heroRemoved,
      });
    },
    [extractLocalPath]
  );

  const setNonCustomGameAssets = useCallback(
    (currentGame: LibraryGame) => {
      const gameWithAssets = currentGame as LibraryGameWithCustomOriginalAssets;
      const iconRemoved =
        !currentGame.customIconUrl &&
        Boolean(gameWithAssets.customOriginalIconPath);
      const logoRemoved =
        !currentGame.customLogoImageUrl &&
        Boolean(gameWithAssets.customOriginalLogoPath);
      const heroRemoved =
        !currentGame.customHeroImageUrl &&
        Boolean(gameWithAssets.customOriginalHeroPath);

      setAssetPaths({
        icon: extractLocalPath(currentGame.customIconUrl),
        logo: extractLocalPath(currentGame.customLogoImageUrl),
        hero: extractLocalPath(currentGame.customHeroImageUrl),
      });
      setOriginalAssetPaths({
        icon:
          gameWithAssets.customOriginalIconPath ||
          extractLocalPath(currentGame.customIconUrl),
        logo:
          gameWithAssets.customOriginalLogoPath ||
          extractLocalPath(currentGame.customLogoImageUrl),
        hero:
          gameWithAssets.customOriginalHeroPath ||
          extractLocalPath(currentGame.customHeroImageUrl),
      });

      setRemovedAssets({
        icon: iconRemoved,
        logo: logoRemoved,
        hero: heroRemoved,
      });

      setDefaultUrls({
        icon: shopDetails?.assets?.iconUrl || currentGame.iconUrl || null,
        logo:
          shopDetails?.assets?.logoImageUrl || currentGame.logoImageUrl || null,
        hero:
          shopDetails?.assets?.libraryHeroImageUrl ||
          currentGame.libraryHeroImageUrl ||
          null,
      });
    },
    [extractLocalPath, shopDetails]
  );

  useEffect(() => {
    setRemovedAssets(INITIAL_REMOVED_ASSETS);
    setAssetPaths(INITIAL_ASSET_PATHS);
    setOriginalAssetPaths(INITIAL_ASSET_PATHS);

    if (isCustomGame(game)) {
      setCustomGameAssets(game);
      setDefaultUrls(INITIAL_ASSET_URLS);
    } else {
      setNonCustomGameAssets(game);
    }
  }, [game, isCustomGame, setCustomGameAssets, setNonCustomGameAssets]);

  const handleAutoFetchAssets = async () => {
    if (isAutoFetching || isUpdating) return;

    setIsAutoFetching(true);
    let successCount = 0;
    const updatedPaths: Partial<AssetPaths> = {};
    const updatedDisplayPaths: Partial<AssetPaths> = {};

    const assetTypes: AssetType[] = ["icon", "logo", "hero"];

    try {
      await Promise.all(
        assetTypes.map(async (assetType) => {
          try {
            const response = await window.electron.searchGameAssetsMulti(
              game.title,
              assetType,
              "google"
            );

            if (response && response.results && response.results.length > 0) {
              const resultsToTry = response.results.slice(0, 3);
              let downloadedPath: string | null = null;

              for (const result of resultsToTry) {
                try {
                  downloadedPath = await window.electron.downloadRemoteAsset(
                    result.fullImageUrl,
                    assetType
                  );
                  if (downloadedPath) {
                    updatedPaths[assetType] = downloadedPath.replace(
                      "local:",
                      ""
                    );
                    updatedDisplayPaths[assetType] = result.fullImageUrl;
                    successCount++;
                    break;
                  }
                } catch (downloadError) {
                  console.warn(
                    `Auto-fetch: Failed to download ${assetType} from ${result.fullImageUrl}:`,
                    downloadError
                  );
                }
              }
            }
          } catch (searchError) {
            console.error(
              `Auto-fetch: Failed to search for ${assetType}:`,
              searchError
            );
          }
        })
      );

      if (successCount > 0) {
        setAssetPaths((prev) => ({
          ...prev,
          ...updatedPaths,
        }));
        setOriginalAssetPaths((prev) => ({
          ...prev,
          ...updatedDisplayPaths,
        }));
        setRemovedAssets((prev) => ({
          ...prev,
          icon: updatedPaths.icon ? false : prev.icon,
          logo: updatedPaths.logo ? false : prev.logo,
          hero: updatedPaths.hero ? false : prev.hero,
        }));

        setPendingUpdateMessage(t("edit_game_modal_auto_fetch_success"));
      } else {
        showErrorToast(t("edit_game_modal_auto_fetch_no_assets"));
      }
    } catch (error) {
      console.error("Auto-fetch assets failed:", error);
      showErrorToast(t("edit_game_modal_auto_fetch_failed"));
    } finally {
      setIsAutoFetching(false);
    }
  };

  const handleAssetSearchTrigger = (assetType: AssetType) => {
    setSearchAssetType(assetType);
    setShowSearchModal(true);
  };

  const updateAssetPaths = (
    assetType: AssetType,
    path: string,
    displayPath: string
  ): void => {
    setAssetPaths((prev) => ({ ...prev, [assetType]: path }));
    setOriginalAssetPaths((prev) => ({ ...prev, [assetType]: displayPath }));
    setRemovedAssets((prev) => ({ ...prev, [assetType]: false }));
  };

  const getOriginalAssetUrl = (assetType: AssetType): string | null => {
    if (!isCustomGame(game)) return null;

    switch (assetType) {
      case "icon":
        return game.iconUrl;
      case "logo":
        return game.logoImageUrl;
      case "hero":
        return game.libraryHeroImageUrl;
      default:
        return null;
    }
  };

  const handleSelectAsset = async (assetType: AssetType) => {
    const { filePaths } = await window.electron.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: t("edit_game_modal_image_filter"),
          extensions: [...IMAGE_EXTENSIONS],
        },
      ],
    });

    if (filePaths && filePaths.length > 0) {
      const originalPath = filePaths[0];
      try {
        const copiedAssetUrl = await window.electron.copyCustomGameAsset(
          originalPath,
          assetType
        );
        updateAssetPaths(
          assetType,
          copiedAssetUrl.replace("local:", ""),
          originalPath
        );
        setPendingUpdateMessage(
          `${capitalizeAssetType(assetType)} updated successfully!`
        );
      } catch (error) {
        console.error(`Failed to copy ${assetType} asset:`, error);
        updateAssetPaths(assetType, originalPath, originalPath);
        setPendingUpdateMessage(
          `${capitalizeAssetType(assetType)} updated successfully!`
        );
      }
    }
  };

  const handleRestoreDefault = (assetType: AssetType) => {
    setRemovedAssets((prev) => ({ ...prev, [assetType]: true }));
    setAssetPaths((prev) => ({ ...prev, [assetType]: "" }));
    setPendingUpdateMessage(
      `${capitalizeAssetType(assetType)} updated successfully!`
    );
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnter = (event: React.DragEvent, target: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverTarget(target);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDragOverTarget(null);
    }
  };

  const validateImageFile = (file: File): boolean => {
    return VALID_IMAGE_TYPES.includes(
      file.type as (typeof VALID_IMAGE_TYPES)[number]
    );
  };

  const processDroppedFile = async (file: File, assetType: AssetType) => {
    setDragOverTarget(null);

    if (!validateImageFile(file)) {
      showErrorToast("Invalid file type. Please select an image file.");
      return;
    }

    try {
      let filePath: string;

      if ("path" in file && typeof (file as ElectronFile).path === "string") {
        filePath = (file as ElectronFile).path!;
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const tempFileName = `temp_${Date.now()}_${file.name}`;
        const tempPath = await window.electron.saveTempFile?.(
          tempFileName,
          uint8Array
        );

        if (!tempPath) {
          throw new Error(
            "Unable to process file. Drag and drop may not be fully supported."
          );
        }

        filePath = tempPath;
      }

      const copiedAssetUrl = await window.electron.copyCustomGameAsset(
        filePath,
        assetType
      );

      updateAssetPaths(
        assetType,
        copiedAssetUrl.replace("local:", ""),
        filePath
      );
      setPendingUpdateMessage(
        `${capitalizeAssetType(assetType)} updated successfully!`
      );

      if (!("path" in file) && filePath) {
        try {
          await window.electron.deleteTempFile?.(filePath);
        } catch (cleanupError) {
          console.warn("Failed to clean up temporary file:", cleanupError);
        }
      }
    } catch (error) {
      console.error(`Failed to process dropped ${assetType}:`, error);
      showErrorToast(
        `Failed to process dropped ${assetType}. Please try again.`
      );
    }
  };

  const handleAssetDrop = async (
    event: React.DragEvent,
    assetType: AssetType
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverTarget(null);

    if (isUpdating) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      await processDroppedFile(files[0], assetType);
    }
  };

  const prepareCustomGameAssets = useCallback(
    (currentGame: LibraryGame | Game) => {
      const iconUrl =
        !removedAssets.icon && assetPaths.icon
          ? `local:${assetPaths.icon}`
          : currentGame.iconUrl;
      const logoImageUrl =
        !removedAssets.logo && assetPaths.logo
          ? `local:${assetPaths.logo}`
          : currentGame.logoImageUrl;
      const libraryHeroImageUrl =
        !removedAssets.hero && assetPaths.hero
          ? `local:${assetPaths.hero}`
          : currentGame.libraryHeroImageUrl;

      return { iconUrl, logoImageUrl, libraryHeroImageUrl };
    },
    [removedAssets, assetPaths]
  );

  const prepareNonCustomGameAssets = useCallback(() => {
    const customIconUrl =
      !removedAssets.icon && assetPaths.icon
        ? `local:${assetPaths.icon}`
        : null;

    const customLogoImageUrl =
      !removedAssets.logo && assetPaths.logo
        ? `local:${assetPaths.logo}`
        : null;

    const customHeroImageUrl =
      !removedAssets.hero && assetPaths.hero
        ? `local:${assetPaths.hero}`
        : null;

    return {
      customIconUrl,
      customLogoImageUrl,
      customHeroImageUrl,
    };
  }, [removedAssets, assetPaths]);

  const updateCustomGame = useCallback(
    async (currentGame: LibraryGame | Game) => {
      const { iconUrl, logoImageUrl, libraryHeroImageUrl } =
        prepareCustomGameAssets(currentGame);

      return window.electron.updateCustomGame({
        shop: currentGame.shop,
        objectId: currentGame.objectId,
        title: game.title,
        iconUrl: iconUrl || undefined,
        logoImageUrl: logoImageUrl || undefined,
        libraryHeroImageUrl: libraryHeroImageUrl || undefined,
        originalIconPath: originalAssetPaths.icon || undefined,
        originalLogoPath: originalAssetPaths.logo || undefined,
        originalHeroPath: originalAssetPaths.hero || undefined,
      });
    },
    [game.title, prepareCustomGameAssets, originalAssetPaths]
  );

  const updateNonCustomGame = useCallback(
    async (currentGame: LibraryGame) => {
      const { customIconUrl, customLogoImageUrl, customHeroImageUrl } =
        prepareNonCustomGameAssets();

      return window.electron.updateGameCustomAssets({
        shop: currentGame.shop,
        objectId: currentGame.objectId,
        title: game.title,
        customIconUrl,
        customLogoImageUrl,
        customHeroImageUrl,
        customOriginalIconPath: removedAssets.icon
          ? undefined
          : originalAssetPaths.icon || undefined,
        customOriginalLogoPath: removedAssets.logo
          ? undefined
          : originalAssetPaths.logo || undefined,
        customOriginalHeroPath: removedAssets.hero
          ? undefined
          : originalAssetPaths.hero || undefined,
      });
    },
    [game.title, prepareNonCustomGameAssets, removedAssets, originalAssetPaths]
  );

  useEffect(() => {
    if (!pendingUpdateMessage || isUpdating) return;

    setIsUpdating(true);

    const updateGameAssets = async () => {
      try {
        await (isCustomGame(game)
          ? updateCustomGame(game)
          : updateNonCustomGame(game as LibraryGame));

        showSuccessToast(pendingUpdateMessage || t("edit_game_modal_success"));
        await onGameUpdated();
      } catch (error) {
        console.error("Failed to update game:", error);
        showErrorToast(
          error instanceof Error ? error.message : t("edit_game_modal_failed")
        );
      } finally {
        setPendingUpdateMessage(null);
        setIsUpdating(false);
      }
    };

    void updateGameAssets();
  }, [
    game,
    isCustomGame,
    isUpdating,
    onGameUpdated,
    pendingUpdateMessage,
    showErrorToast,
    showSuccessToast,
    t,
    updateCustomGame,
    updateNonCustomGame,
  ]);

  const getPreviewUrl = (assetType: AssetType): string | undefined => {
    const assetPath = assetPaths[assetType];
    const defaultUrl = defaultUrls[assetType];

    if (!isCustomGame(game)) {
      return assetPath ? `local:${assetPath}` : defaultUrl || undefined;
    }

    return assetPath ? `local:${assetPath}` : undefined;
  };

  const renderAssetSlot = (assetType: AssetType, title: string) => {
    const assetPath = assetPaths[assetType];
    const defaultUrl = defaultUrls[assetType];
    const hasImage = assetPath || (!isCustomGame(game) && defaultUrl);
    const isDragOver = dragOverTarget === assetType;

    const previewUrl = getPreviewUrl(assetType);
    const hasOriginal =
      assetPath || (isCustomGame(game) && getOriginalAssetUrl(assetType));

    return (
      <div className="game-assets-settings__slot-card">
        <span className="game-assets-settings__slot-title">{title}</span>

        <button
          type="button"
          aria-label={t(`edit_game_modal_${assetType}_drop_zone`)}
          className={`game-assets-settings__image-preview-container game-assets-settings__image-preview-container--${assetType} ${
            isDragOver ? "game-assets-settings__drop-zone--active" : ""
          }`}
          onDragOver={handleDragOver}
          onDragEnter={(event) => handleDragEnter(event, assetType)}
          onDragLeave={handleDragLeave}
          onDrop={(event) => handleAssetDrop(event, assetType)}
          onClick={() => handleSelectAsset(assetType)}
        >
          {hasImage && previewUrl ? (
            <>
              <img
                src={previewUrl}
                alt={title}
                className="game-assets-settings__slot-image"
              />
              {isDragOver && (
                <div className="game-assets-settings__drop-overlay">
                  <span>
                    {t(`edit_game_modal_drop_to_replace_${assetType}`)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="game-assets-settings__slot-placeholder">
              <ImageIcon size={24} />
              <span>
                {t(
                  `edit_game_modal_no_${assetType}`,
                  `No ${capitalizeAssetType(assetType)}`
                )}
              </span>
            </div>
          )}
        </button>

        <div className="game-assets-settings__slot-actions">
          <Button
            type="button"
            theme="outline"
            className="game-assets-settings__slot-btn"
            onClick={() => handleSelectAsset(assetType)}
            disabled={isUpdating}
            title={t("edit_game_modal_browse")}
          >
            📂 {t("edit_game_modal_browse", "Browse")}
          </Button>

          <Button
            type="button"
            theme="outline"
            className="game-assets-settings__slot-btn"
            onClick={() => handleAssetSearchTrigger(assetType)}
            disabled={isUpdating}
            title={t("edit_game_modal_search")}
          >
            🔍 {t("edit_game_modal_search", "Search")}
          </Button>

          {hasOriginal && (
            <Button
              type="button"
              theme="outline"
              className="game-assets-settings__slot-btn game-assets-settings__slot-btn--remove"
              onClick={() => handleRestoreDefault(assetType)}
              disabled={isUpdating}
              title={t("edit_game_modal_remove")}
            >
              ❌ {t("edit_game_modal_remove", "Remove")}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="game-assets-settings">
      <div className="game-assets-settings__header">
        <Button
          type="button"
          theme="outline"
          className="game-assets-settings__auto-fetch-btn"
          onClick={handleAutoFetchAssets}
          disabled={isUpdating || isAutoFetching}
        >
          <SyncIcon className={isAutoFetching ? "animate-spin" : ""} />
          {isAutoFetching
            ? t("edit_game_modal_auto_fetching")
            : t("edit_game_modal_auto_fetch")}
        </Button>
      </div>

      <div className="game-assets-settings__slots-grid">
        {renderAssetSlot("icon", t("edit_game_modal_icon", "Icon"))}
        {renderAssetSlot("logo", t("edit_game_modal_logo", "Logo"))}
        {renderAssetSlot(
          "hero",
          t("edit_game_modal_hero", "Hero / Background")
        )}
      </div>

      <WebImageSearchModal
        visible={showSearchModal}
        game={game}
        assetType={searchAssetType}
        onClose={() => setShowSearchModal(false)}
        onGameUpdated={onGameUpdated}
      />
    </div>
  );
}
