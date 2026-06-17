import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageIcon, SearchIcon, SyncIcon, XIcon } from "@primer/octicons-react";
import { Button, Modal, TextField } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import { generateRandomGradient } from "@renderer/helpers";
import type { Game, LibraryGame, ShopDetailsWithAssets } from "@types";

import "./game-assets-settings.scss";

type AssetType = "icon" | "logo" | "hero";
type SearchStatus = "idle" | "loading" | "loaded" | "empty" | "error";
type ImageSource = "all" | "google" | "steamgriddb" | "igdb" | "steamcdn";

const IMAGE_SOURCES: {
  id: ImageSource;
  labelKey: string;
}[] = [
  { id: "all", labelKey: "edit_game_modal_source_all" },
  { id: "google", labelKey: "edit_game_modal_source_google" },
  { id: "steamgriddb", labelKey: "edit_game_modal_source_steamgriddb" },
  { id: "igdb", labelKey: "edit_game_modal_source_igdb" },
  { id: "steamcdn", labelKey: "edit_game_modal_source_steamcdn" },
];

interface AssetSearchResult {
  id: string;
  thumbnailUrl: string;
  fullImageUrl: string;
  sourceUrl: string;
  sourceName: string;
  width: number | null;
  height: number | null;
}

interface SearchGameAssetsResponse {
  results: AssetSearchResult[];
  query: string;
  contributingSources?: string[];
}

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
  const [assetDisplayPaths, setAssetDisplayPaths] =
    useState<AssetPaths>(INITIAL_ASSET_PATHS);
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
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType>("icon");
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [selectedImageSource, setSelectedImageSource] =
    useState<ImageSource>("google");

  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState(game.title);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchResults, setSearchResults] =
    useState<SearchGameAssetsResponse | null>(null);
  const [previewResult, setPreviewResult] = useState<AssetSearchResult | null>(
    null
  );
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewImageLoaded, setPreviewImageLoaded] = useState(false);
  const [previewImageError, setPreviewImageError] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isAutoFetching, setIsAutoFetching] = useState(false);

  // Session cache keyed by game + query + asset type
  const searchCache = useRef<Map<string, SearchGameAssetsResponse>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  const getCacheKey = (
    assetType: AssetType,
    query: string,
    source: ImageSource
  ) => `${game.id}:${source}:${query}:${assetType}`;

  /**
   * Issue a single image search request, dispatching to the aggregated or
   * per-source backend event based on the active tab. Keeps the surface area
   * tiny so the cache + abort + retry wiring below stays untouched.
   */
  const dispatchSearch = useCallback(
    async (
      trimmedQuery: string,
      assetType: AssetType,
      source: ImageSource
    ): Promise<SearchGameAssetsResponse> => {
      if (source === "all") {
        return window.electron.searchGameAssetsAggregated(
          trimmedQuery,
          assetType
        );
      }
      return window.electron.searchGameAssetsMulti(
        trimmedQuery,
        assetType,
        source
      );
    },
    []
  );

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
      setAssetDisplayPaths({
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
      setAssetDisplayPaths({
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
    setAssetDisplayPaths(INITIAL_ASSET_PATHS);
    setOriginalAssetPaths(INITIAL_ASSET_PATHS);

    // Reset search query to game title when game changes
    setSearchQuery(game.title);

    if (isCustomGame(game)) {
      setCustomGameAssets(game);
      setDefaultUrls(INITIAL_ASSET_URLS);
    } else {
      setNonCustomGameAssets(game);
    }

    // Trigger auto-search for the new game using game.title directly
    // (avoiding stale searchQuery closure in the other auto-search effect)
    performSearch(selectedAssetType, game.title, selectedImageSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, isCustomGame, setCustomGameAssets, setNonCustomGameAssets]);

  // --- Search logic ---
  const performSearch = useCallback(
    async (
      assetType: AssetType,
      query: string,
      source: ImageSource,
      bypassCache = false
    ) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;

      const cacheKey = getCacheKey(assetType, trimmedQuery, source);

      // Check session cache first
      if (!bypassCache && searchCache.current.has(cacheKey)) {
        const cached = searchCache.current.get(cacheKey)!;
        setSearchResults(cached);
        setSearchStatus(cached.results.length > 0 ? "loaded" : "empty");
        return;
      }

      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setSearchStatus("loading");
      setSearchResults(null);

      try {
        const response = await dispatchSearch(trimmedQuery, assetType, source);

        // Discard stale results if controller was aborted
        if (controller.signal.aborted) return;

        searchCache.current.set(cacheKey, response);
        setSearchResults(response);
        setSearchStatus(response.results.length > 0 ? "loaded" : "empty");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Search failed:", error);
        setSearchStatus("error");
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [game.id]
  );

  const handleRefreshSearch = () => {
    searchCache.current.delete(
      getCacheKey(selectedAssetType, searchQuery, selectedImageSource)
    );
    performSearch(selectedAssetType, searchQuery, selectedImageSource, true);
  };

  const handleSearchRetry = () => {
    performSearch(selectedAssetType, searchQuery, selectedImageSource, true);
  };

  const handleSearchInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setSearchQuery(event.target.value);
  };

  const handleSearchInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      searchCache.current.delete(
        getCacheKey(selectedAssetType, searchQuery, selectedImageSource)
      );
      performSearch(selectedAssetType, searchQuery, selectedImageSource, true);
    }
  };

  // Clean up search abort on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // --- Preview modal ---
  const handlePreviewOpen = (result: AssetSearchResult) => {
    setPreviewResult(result);
    setPreviewImageLoaded(false);
    setPreviewImageError(false);
    setShowPreviewModal(true);
  };

  const handlePreviewClose = () => {
    setShowPreviewModal(false);
    setPreviewResult(null);
    setPreviewImageLoaded(false);
    setPreviewImageError(false);
  };

  const handlePreviewImageLoad = () => {
    setPreviewImageLoaded(true);
    setPreviewImageError(false);
  };

  const handlePreviewImageError = () => {
    setPreviewImageLoaded(true);
    setPreviewImageError(true);
  };

  // --- Apply from search result ---
  const handleApplyAsset = async () => {
    if (!previewResult || isApplying) return;

    setIsApplying(true);

    try {
      const copiedAssetUrl = await window.electron.downloadRemoteAsset(
        previewResult.fullImageUrl,
        selectedAssetType
      );

      updateAssetPaths(
        selectedAssetType,
        copiedAssetUrl.replace("local:", ""),
        previewResult.fullImageUrl
      );

      handlePreviewClose();

      setPendingUpdateMessage(
        t("edit_game_modal_image_applied", {
          type: capitalizeAssetType(selectedAssetType),
        })
      );
    } catch (error) {
      console.error("Failed to apply asset:", error);
      showErrorToast(
        t("edit_game_modal_failed", { defaultValue: "Failed to apply asset" })
      );
    } finally {
      setIsApplying(false);
    }
  };

  const handleAutoFetchAssets = async () => {
    if (isAutoFetching || isApplying || isUpdating) return;

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
        setAssetDisplayPaths((prev) => ({
          ...prev,
          ...updatedDisplayPaths,
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

  // --- Existing asset management ---
  const handleAssetTypeChange = (assetType: AssetType) => {
    setSelectedAssetType(assetType);
    performSearch(assetType, searchQuery, selectedImageSource);
  };

  const handleImageSourceChange = (source: ImageSource) => {
    setSelectedImageSource(source);
    searchCache.current.delete(
      getCacheKey(selectedAssetType, searchQuery, source)
    );
    performSearch(selectedAssetType, searchQuery, source, true);
  };

  const getAssetDisplayPath = (assetType: AssetType): string => {
    if (removedAssets[assetType]) {
      return "";
    }

    return assetDisplayPaths[assetType] || originalAssetPaths[assetType];
  };

  const updateAssetPaths = (
    assetType: AssetType,
    path: string,
    displayPath: string
  ): void => {
    setAssetPaths((prev) => ({ ...prev, [assetType]: path }));
    setAssetDisplayPaths((prev) => ({ ...prev, [assetType]: displayPath }));
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
    setAssetDisplayPaths((prev) => ({ ...prev, [assetType]: "" }));
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

  const prepareCustomGameAssets = (currentGame: LibraryGame | Game) => {
    const iconUrl = removedAssets.icon
      ? null
      : assetPaths.icon
        ? `local:${assetPaths.icon}`
        : currentGame.iconUrl;

    const logoImageUrl = removedAssets.logo
      ? null
      : assetPaths.logo
        ? `local:${assetPaths.logo}`
        : currentGame.logoImageUrl;

    const libraryHeroImageUrl = removedAssets.hero
      ? currentGame.libraryHeroImageUrl?.startsWith("data:image/svg+xml")
        ? currentGame.libraryHeroImageUrl
        : generateRandomGradient()
      : assetPaths.hero
        ? `local:${assetPaths.hero}`
        : currentGame.libraryHeroImageUrl;

    return { iconUrl, logoImageUrl, libraryHeroImageUrl };
  };

  const prepareNonCustomGameAssets = () => {
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
  };

  const updateCustomGame = async (currentGame: LibraryGame | Game) => {
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
  };

  const updateNonCustomGame = async (currentGame: LibraryGame) => {
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
  };

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
  ]);

  const getPreviewUrl = (assetType: AssetType): string | undefined => {
    const assetPath = assetPaths[assetType];
    const defaultUrl = defaultUrls[assetType];

    if (!isCustomGame(game)) {
      return assetPath ? `local:${assetPath}` : defaultUrl || undefined;
    }

    return assetPath ? `local:${assetPath}` : undefined;
  };

  // --- Render helpers ---

  const renderSearchPanel = () => {
    return (
      <div className="game-assets-settings__search-panel">
        <div className="game-assets-settings__asset-label">
          {t("edit_game_modal_assets")}
        </div>

        <div className="game-assets-settings__asset-tabs">
          <Button
            type="button"
            theme={selectedAssetType === "icon" ? "primary" : "outline"}
            onClick={() => handleAssetTypeChange("icon")}
            disabled={isUpdating || isAutoFetching}
          >
            {t("edit_game_modal_icon")}
          </Button>

          <Button
            type="button"
            theme={selectedAssetType === "logo" ? "primary" : "outline"}
            onClick={() => handleAssetTypeChange("logo")}
            disabled={isUpdating || isAutoFetching}
          >
            {t("edit_game_modal_logo")}
          </Button>

          <Button
            type="button"
            theme={selectedAssetType === "hero" ? "primary" : "outline"}
            onClick={() => handleAssetTypeChange("hero")}
            disabled={isUpdating || isAutoFetching}
          >
            {t("edit_game_modal_hero")}
          </Button>
        </div>

        <div className="game-assets-settings__auto-fetch-row">
          <Button
            type="button"
            theme="outline"
            className="game-assets-settings__auto-fetch-btn"
            onClick={handleAutoFetchAssets}
            disabled={isUpdating || isApplying || isAutoFetching}
          >
            <SyncIcon className={isAutoFetching ? "animate-spin" : ""} />
            {isAutoFetching
              ? t("edit_game_modal_auto_fetching")
              : t("edit_game_modal_auto_fetch")}
          </Button>
        </div>

        <div className="game-assets-settings__source-tabs">
          {IMAGE_SOURCES.map((src) => (
            <button
              key={src.id}
              type="button"
              className={`game-assets-settings__source-tab ${
                selectedImageSource === src.id
                  ? "game-assets-settings__source-tab--active"
                  : ""
              }`}
              onClick={() => handleImageSourceChange(src.id)}
              disabled={searchStatus === "loading" || isAutoFetching}
            >
              {t(src.labelKey)}
            </button>
          ))}
        </div>

        <div className="game-assets-settings__search-input-row">
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
                onClick={() => {
                  searchCache.current.delete(
                    getCacheKey(
                      selectedAssetType,
                      searchQuery,
                      selectedImageSource
                    )
                  );
                  performSearch(
                    selectedAssetType,
                    searchQuery,
                    selectedImageSource,
                    true
                  );
                }}
                disabled={!searchQuery.trim() || searchStatus === "loading"}
              >
                <SearchIcon size={14} />
              </Button>
            }
          />
        </div>

        <div className="game-assets-settings__search-results">
          {renderSearchContent()}
        </div>
      </div>
    );
  };

  const renderSearchContent = () => {
    if (isAutoFetching) {
      return (
        <div className="game-assets-settings__search-status">
          <div className="game-assets-settings__search-status-spinner animate-spin">
            <SyncIcon size={24} />
          </div>
          <span className="game-assets-settings__search-status-text">
            {t("edit_game_modal_auto_fetching")}
          </span>
        </div>
      );
    }

    switch (searchStatus) {
      case "idle":
      case "loading":
        return (
          <div className="game-assets-settings__search-status">
            <div className="game-assets-settings__search-skeleton">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="game-assets-settings__skeleton-thumb" />
              ))}
            </div>
            <span className="game-assets-settings__search-status-text">
              {t("edit_game_modal_searching")}
            </span>
          </div>
        );

      case "empty":
        return (
          <div className="game-assets-settings__search-status">
            <ImageIcon size={24} />
            <span className="game-assets-settings__search-status-text">
              {t("edit_game_modal_no_results")}
            </span>
            <Button
              type="button"
              theme="outline"
              onClick={handleRefreshSearch}
              className="game-assets-settings__refresh-btn"
            >
              <SyncIcon size={14} />
              {t("edit_game_modal_refresh_search")}
            </Button>
          </div>
        );

      case "error":
        return (
          <div className="game-assets-settings__search-status game-assets-settings__search-status--error">
            <XIcon size={24} />
            <span className="game-assets-settings__search-status-text">
              {t("edit_game_modal_search_error")}
            </span>
            <Button type="button" theme="outline" onClick={handleSearchRetry}>
              {t("edit_game_modal_search_retry")}
            </Button>
          </div>
        );

      case "loaded":
        return renderResultsGrid();

      default:
        return null;
    }
  };

  const renderResultsGrid = () => {
    if (!searchResults || searchResults.results.length === 0) return null;

    const dimensionLabel = (result: AssetSearchResult) =>
      result.width && result.height ? `${result.width}×${result.height}` : null;

    return (
      <>
        <div className="game-assets-settings__results-grid">
          {searchResults.results.map((result) => {
            const dims = dimensionLabel(result);
            return (
              <button
                key={result.id}
                type="button"
                className="game-assets-settings__result-thumb"
                aria-label={`${result.sourceName}${dims ? ` (${dims})` : ""}`}
                onClick={() => handlePreviewOpen(result)}
              >
                <img
                  src={result.thumbnailUrl}
                  alt={result.sourceName}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <span className="game-assets-settings__result-source-badge">
                  {result.sourceName}
                </span>
                {dims && (
                  <span className="game-assets-settings__result-dims-badge">
                    {dims}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="game-assets-settings__search-footer">
          <span className="game-assets-settings__disclaimer">
            {t("edit_game_modal_disclaimer")}
          </span>
          <Button
            type="button"
            theme="outline"
            onClick={handleRefreshSearch}
            className="game-assets-settings__refresh-btn"
          >
            <SyncIcon size={14} />
            {t("edit_game_modal_refresh_search")}
          </Button>
        </div>
      </>
    );
  };

  const renderEditorPanel = () => {
    const assetType = selectedAssetType;
    const assetPath = assetPaths[assetType];
    const assetDisplayPath = getAssetDisplayPath(assetType);
    const defaultUrl = defaultUrls[assetType];
    const hasImage = assetPath || (!isCustomGame(game) && defaultUrl);
    const isDragOver = dragOverTarget === assetType;

    const getTranslationKey = (suffix: string) =>
      `edit_game_modal_${assetType}${suffix}`;
    const getResolutionKey = () => `edit_game_modal_${assetType}_resolution`;

    return (
      <div className="game-assets-settings__editor-panel">
        <div className="game-assets-settings__editor-label">
          {t(`edit_game_modal_${assetType}`)}
        </div>

        <div className="game-assets-settings__image-section">
          <TextField
            placeholder={t(`edit_game_modal_select_${assetType}`)}
            value={assetDisplayPath}
            readOnly
            theme="dark"
            rightContent={
              <div className="game-assets-settings__input-actions">
                <Button
                  type="button"
                  theme="outline"
                  onClick={() => handleSelectAsset(assetType)}
                  disabled={isUpdating}
                >
                  <ImageIcon />
                  {t("edit_game_modal_browse")}
                </Button>
                {(assetPath ||
                  (isCustomGame(game) && getOriginalAssetUrl(assetType))) && (
                  <Button
                    type="button"
                    theme="outline"
                    onClick={() => void handleRestoreDefault(assetType)}
                    disabled={isUpdating}
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
            }
          />

          <div className="game-assets-settings__resolution-info">
            {t(getResolutionKey())}
          </div>

          {hasImage ? (
            <button
              type="button"
              aria-label={t(getTranslationKey("_drop_zone"))}
              className={`game-assets-settings__image-preview ${
                assetType === "icon" ? "game-assets-settings__icon-preview" : ""
              } ${isDragOver ? "game-assets-settings__drop-zone--active" : ""}`}
              onDragOver={handleDragOver}
              onDragEnter={(event) => handleDragEnter(event, assetType)}
              onDragLeave={handleDragLeave}
              onDrop={(event) => handleAssetDrop(event, assetType)}
              onClick={() => handleSelectAsset(assetType)}
            >
              <img
                src={getPreviewUrl(assetType)}
                alt={t(getTranslationKey("_preview"))}
                className="game-assets-settings__preview-image"
              />
              {isDragOver && (
                <div className="game-assets-settings__drop-overlay">
                  <span>
                    {t(`edit_game_modal_drop_to_replace_${assetType}`)}
                  </span>
                </div>
              )}
            </button>
          ) : (
            <button
              type="button"
              aria-label={t(getTranslationKey("_drop_zone_empty"))}
              className={`game-assets-settings__image-preview ${
                assetType === "icon" ? "game-assets-settings__icon-preview" : ""
              } game-assets-settings__drop-zone ${
                isDragOver ? "game-assets-settings__drop-zone--active" : ""
              }`}
              onDragOver={handleDragOver}
              onDragEnter={(event) => handleDragEnter(event, assetType)}
              onDragLeave={handleDragLeave}
              onDrop={(event) => handleAssetDrop(event, assetType)}
              onClick={() => handleSelectAsset(assetType)}
            >
              <div className="game-assets-settings__drop-zone-content">
                <ImageIcon />
                <span>{t(`edit_game_modal_drop_${assetType}_image_here`)}</span>
              </div>
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderPreviewModal = () => {
    if (!previewResult) return null;

    const dimensionsText =
      previewResult.width && previewResult.height
        ? `${previewResult.width} × ${previewResult.height}`
        : null;

    return (
      <Modal
        visible={showPreviewModal}
        title={t("edit_game_modal_preview_title", {
          type: capitalizeAssetType(selectedAssetType),
        })}
        onClose={handlePreviewClose}
        clickOutsideToClose={!isApplying}
      >
        <div className="game-assets-settings__preview-modal">
          <div className="game-assets-settings__preview-image-container">
            {!previewImageLoaded && (
              <div className="game-assets-settings__preview-loading">
                <span>{t("edit_game_modal_preview_loading")}</span>
              </div>
            )}

            {previewImageError && (
              <div className="game-assets-settings__preview-error">
                <span>{t("edit_game_modal_preview_error")}</span>
              </div>
            )}

            <img
              src={previewResult.fullImageUrl}
              alt={previewResult.sourceName}
              className="game-assets-settings__preview-full-image"
              style={{
                display:
                  previewImageLoaded && !previewImageError ? "block" : "none",
              }}
              onLoad={handlePreviewImageLoad}
              onError={handlePreviewImageError}
            />
          </div>

          {dimensionsText && (
            <div className="game-assets-settings__preview-meta">
              <span>{dimensionsText}</span>
            </div>
          )}

          {previewResult.sourceUrl && (
            <div className="game-assets-settings__preview-meta">
              <span className="game-assets-settings__preview-meta-label">
                {t("edit_game_modal_source")}:
              </span>
              <span className="game-assets-settings__preview-source">
                {previewResult.sourceName}
              </span>
            </div>
          )}

          <div className="game-assets-settings__resolution-info">
            {t(`edit_game_modal_${selectedAssetType}_resolution`)}
          </div>

          <div className="game-assets-settings__preview-actions">
            <Button
              type="button"
              theme="outline"
              onClick={handlePreviewClose}
              disabled={isApplying}
            >
              {t("edit_game_modal_cancel")}
            </Button>
            <Button
              type="button"
              theme="primary"
              onClick={handleApplyAsset}
              disabled={isApplying || previewImageError}
            >
              {isApplying
                ? t("edit_game_modal_applying")
                : t("edit_game_modal_apply")}
            </Button>
          </div>
        </div>
      </Modal>
    );
  };

  return (
    <div className="game-assets-settings">
      <div className="game-assets-settings__split-layout">
        {renderSearchPanel()}
        {renderEditorPanel()}
      </div>

      {renderPreviewModal()}
    </div>
  );
}
