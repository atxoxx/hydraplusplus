import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  FileDirectoryIcon,
  SyncIcon,
  SearchIcon,
  XIcon,
  CheckIcon,
  ChevronLeftIcon,
} from "@primer/octicons-react";

import { Modal, TextField, Button } from "@renderer/components";
import { useLibrary, useToast } from "@renderer/hooks";
import { buildGameDetailsPath } from "@renderer/helpers";
import { DiscoveryWizardModal } from "@renderer/components";
import type {
  FoundExe,
  GameShop,
  PlatformGame,
  ShopDetailsWithAssets,
} from "@types";

import "./sidebar-adding-custom-game-modal.scss";

export interface SidebarAddingCustomGameModalProps {
  visible: boolean;
  onClose: () => void;
}

const IMPORT_PLATFORMS: Array<{ shop: GameShop; label: string }> = [
  { shop: "epic", label: "Epic Games" },
  { shop: "gog", label: "GOG Galaxy" },
  { shop: "battle-net", label: "Battle.net" },
  { shop: "amazon", label: "Amazon Games" },
  { shop: "ubisoft", label: "Ubisoft Connect" },
  { shop: "xbox", label: "Xbox / Game Pass" },
  { shop: "rockstar", label: "Rockstar Games" },
  { shop: "itch-io", label: "itch.io" },
  { shop: "humble", label: "Humble Bundle" },
];

interface CatalogueSuggestion {
  title: string;
  objectId: string;
  shop: GameShop;
  iconUrl: string | null;
}

interface GameEntryConfig {
  exe: FoundExe;
  gameName: string;
  selectedSuggestion: CatalogueSuggestion | null;
  shopDetails: ShopDetailsWithAssets | null;
  suggestions: CatalogueSuggestion[];
  isSearchingName: boolean;
  showSuggestions: boolean;
}

/** Clean up common patterns from executable filenames to guess the game title */
function guessGameTitleFromExe(fileName: string): string {
  let name = fileName.replace(/\.exe$/i, "");

  name = name
    .replace(
      /[-_.\s]*(Launcher|Game|Client|Win64|Win32|x64|x86|Windows|Installer|Setup|Application)$/i,
      ""
    )
    .replace(/\b(build|release|final|v[\d.]+)\b/gi, "")
    .replace(/[-_.]+/g, " ")
    .trim();

  return name || fileName.replace(/\.exe$/i, "");
}

export function SidebarAddingCustomGameModal({
  visible,
  onClose,
}: Readonly<SidebarAddingCustomGameModalProps>) {
  const { t } = useTranslation("sidebar");
  const { updateLibrary } = useLibrary();
  const { showSuccessToast, showErrorToast } = useToast();
  const navigate = useNavigate();

  // --- Base state ---
  const [isAdding, setIsAdding] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [discoveredGames, setDiscoveredGames] = useState<PlatformGame[]>([]);

  // --- Folder scan state ---
  const [scannedExes, setScannedExes] = useState<FoundExe[]>([]);
  const [isFolderScanning, setIsFolderScanning] = useState(false);
  const [scannedFolderPath, setScannedFolderPath] = useState("");

  // --- Multi-selection state ---
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set()
  );
  const [exeFilterQuery, setExeFilterQuery] = useState("");
  const [showConfigView, setShowConfigView] = useState(false);

  // --- Game config entries (one per selected exe) ---
  const [gameEntries, setGameEntries] = useState<GameEntryConfig[]>([]);

  // --- Abort controller references per entry ---
  const searchAbortRefs = useRef<Map<number, AbortController>>(new Map());
  const detailAbortRefs = useRef<Map<number, AbortController>>(new Map());
  const nameTimeoutRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      resetAllState();
    }
    // Cleanup on unmount
    return () => {
      searchAbortRefs.current.forEach((ctrl) => ctrl.abort());
      detailAbortRefs.current.forEach((ctrl) => ctrl.abort());
      nameTimeoutRefs.current.forEach((t) => clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function resetAllState() {
    setScannedExes([]);
    setSelectedIndices(new Set());
    setExeFilterQuery("");
    setShowConfigView(false);
    setGameEntries([]);
    setScannedFolderPath("");
    searchAbortRefs.current.forEach((ctrl) => ctrl.abort());
    detailAbortRefs.current.forEach((ctrl) => ctrl.abort());
    nameTimeoutRefs.current.forEach((t) => clearTimeout(t));
    searchAbortRefs.current.clear();
    detailAbortRefs.current.clear();
    nameTimeoutRefs.current.clear();
  }

  // ---------- Folder scanning ----------

  const handleScanFolder = async () => {
    const { filePaths } = await window.electron.showOpenDialog({
      properties: ["openDirectory"],
    });

    if (!filePaths || filePaths.length === 0) return;

    const folderPath = filePaths[0];
    setIsFolderScanning(true);
    setScannedFolderPath(folderPath);
    setShowConfigView(false);

    try {
      const exes = await window.electron.scanFolderForExes(folderPath);
      setScannedExes(exes);
      setSelectedIndices(new Set());
      setExeFilterQuery("");

      if (exes.length === 0) {
        showErrorToast(t("custom_game_modal_no_exes_found"));
      }
    } catch {
      showErrorToast(t("custom_game_modal_scan_failed"));
    } finally {
      setIsFolderScanning(false);
    }
  };

  // ---------- Single exe browse ----------

  const handleBrowseSingleExe = async () => {
    const { filePaths } = await window.electron.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: t("custom_game_modal_executable"),
          extensions: ["exe", "msi", "app", "deb", "rpm", "dmg"],
        },
      ],
    });

    if (filePaths && filePaths.length > 0) {
      const selectedPath = filePaths[0];
      const fileName = selectedPath.split(/[\\/]/).pop() || "";
      const folderName =
        selectedPath.split(/[\\/]/).slice(-2, -1)[0] || "";

      const exe: FoundExe = {
        filePath: selectedPath,
        fileName,
        folderName,
      };

      setScannedExes([exe]);
      setSelectedIndices(new Set([0]));
      setScannedFolderPath("");
      moveToConfigView([exe]);
    }
  };

  // ---------- Selection management ----------

  const toggleExeSelection = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIndices(new Set());
    } else {
      // Store actual scannedExes indices (consistent with toggleExeSelection)
      setSelectedIndices(
        new Set(filteredExes.map((exe) => scannedExes.indexOf(exe)))
      );
    }
  };

  const filteredExes = useMemo(() => {
    if (!exeFilterQuery.trim()) return scannedExes;
    const q = exeFilterQuery.toLowerCase();
    return scannedExes.filter(
      (exe) =>
        exe.fileName.toLowerCase().includes(q) ||
        exe.folderName.toLowerCase().includes(q)
    );
  }, [scannedExes, exeFilterQuery]);

  // ---------- Move to config view ----------

  const moveToConfigView = (exes: FoundExe[]) => {
    const entries: GameEntryConfig[] = exes.map((exe) => ({
      exe,
      gameName: guessGameTitleFromExe(exe.fileName),
      selectedSuggestion: null,
      shopDetails: null,
      suggestions: [],
      isSearchingName: false,
      showSuggestions: false,
    }));

    setGameEntries(entries);
    setShowConfigView(true);

    // Auto-search for each entry
    entries.forEach((entry, idx) => {
      if (entry.gameName.length >= 2) {
        searchNameSuggestions(idx, entry.gameName);
      }
    });
  };

  const handleProceedToConfig = () => {
    // Use actual scannedExes indices to match how toggleExeSelection stores selections
    const selectedExes = filteredExes.filter((exe) =>
      selectedIndices.has(scannedExes.indexOf(exe))
    );
    if (selectedExes.length === 0) return;
    moveToConfigView(selectedExes);
  };

  // ---------- Name suggestions ----------

  const searchNameSuggestions = useCallback(
    async (index: number, query: string) => {
      // Abort previous search for this entry
      const prevCtrl = searchAbortRefs.current.get(index);
      if (prevCtrl) prevCtrl.abort();

      if (!query.trim() || query.length < 2) {
        setGameEntries((prev) => {
          const next = [...prev];
          if (next[index]) {
            next[index] = {
              ...next[index],
              suggestions: [],
              showSuggestions: false,
              isSearchingName: false,
            };
          }
          return next;
        });
        return;
      }

      const controller = new AbortController();
      searchAbortRefs.current.set(index, controller);

      setGameEntries((prev) => {
        const next = [...prev];
        if (next[index]) {
          next[index] = { ...next[index], isSearchingName: true };
        }
        return next;
      });

      try {
        const response = await window.electron.hydraApi.get<
          CatalogueSuggestion[]
        >("/catalogue/search/suggestions", {
          params: { query: query.trim(), limit: 5, shop: "steam" },
          needsAuth: false,
        });

        if (controller.signal.aborted) return;

        setGameEntries((prev) => {
          const next = [...prev];
          if (next[index]) {
            next[index] = {
              ...next[index],
              suggestions: response,
              showSuggestions: response.length > 0,
              isSearchingName: false,
            };
          }
          return next;
        });
      } catch {
        if (!controller.signal.aborted) {
          setGameEntries((prev) => {
            const next = [...prev];
            if (next[index]) {
              next[index] = {
                ...next[index],
                suggestions: [],
                showSuggestions: false,
                isSearchingName: false,
              };
            }
            return next;
          });
        }
      }
    },
    []
  );

  const handleGameNameChange = (
    index: number,
    value: string
  ) => {
    setGameEntries((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = {
          ...next[index],
          gameName: value,
          selectedSuggestion: null,
          shopDetails: null,
        };
      }
      return next;
    });

    // Debounce search
    const prevTimeout = nameTimeoutRefs.current.get(index);
    if (prevTimeout) clearTimeout(prevTimeout);

    const timeout = setTimeout(() => {                  searchNameSuggestions(index, value);
    }, 300);
    nameTimeoutRefs.current.set(index, timeout);
  };

  // ---------- Suggeston selection + fetch full details ----------

  const handleSelectSuggestion = async (
    index: number,
    suggestion: CatalogueSuggestion
  ) => {
    setGameEntries((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = {
          ...next[index],
          gameName: suggestion.title,
          selectedSuggestion: suggestion,
          showSuggestions: false,
        };
      }
      return next;
    });

    // Fetch full shop details to get all metadata
    const prevDetailCtrl = detailAbortRefs.current.get(index);
    if (prevDetailCtrl) prevDetailCtrl.abort();

    const controller = new AbortController();
    detailAbortRefs.current.set(index, controller);

    try {
      const details = await window.electron.getGameShopDetails(
        suggestion.objectId,
        suggestion.shop,
        "english"
      );

      if (controller.signal.aborted) return;

      if (details) {
        setGameEntries((prev) => {
          const next = [...prev];
          if (next[index]) {
            next[index] = {
              ...next[index],
              shopDetails: details,
            };
          }
          return next;
        });
      }
    } catch {
      // Non-critical - game will still be added with basic info
    }
  };

  // ---------- Bulk add ----------

  const handleAddAllGames = async () => {
    if (gameEntries.length === 0) return;

    setIsAdding(true);

    // Prepare entries for bulk add
    const bulkEntries = await prepareBulkEntries();

    try {
      const result = await window.electron.bulkAddCustomGamesToLibrary(
        bulkEntries.map((e) => ({
          title: e.title,
          executablePath: e.executablePath,
          iconUrl: e.iconUrl,
          logoImageUrl: e.logoImageUrl,
          libraryHeroImageUrl: e.libraryHeroImageUrl,
          libraryImageUrl: e.libraryImageUrl,
          coverImageUrl: e.coverImageUrl,
          linkedShop: e.linkedShop,
          linkedObjectId: e.linkedObjectId,
        }))
      );

      if (result.games.length > 0) {
        showSuccessToast(
          t("custom_game_modal_bulk_success", {
            count: result.games.length,
          })
        );
        updateLibrary();

        // Navigate to the first added game
        const firstGame = result.games[0];
        const gameDetailsPath = buildGameDetailsPath({
          shop: "custom",
          objectId: firstGame.objectId,
          title: firstGame.title,
        });
        navigate(gameDetailsPath);
      }

      if (result.errors.length > 0) {
        showErrorToast(
          t("custom_game_modal_bulk_errors", {
            count: result.errors.length,
          })
        );
      }

      resetAllState();
      onClose();
    } catch (error) {
      console.error("Failed to bulk add games:", error);
      showErrorToast(t("custom_game_modal_failed"));
    } finally {
      setIsAdding(false);
    }
  };

  /** Prepare entries by downloading remote assets where possible */
  async function prepareBulkEntries(): Promise<
    Array<{
      title: string;
      executablePath: string;
      iconUrl?: string;
      logoImageUrl?: string;
      libraryHeroImageUrl?: string;
      libraryImageUrl?: string;
      coverImageUrl?: string;
      linkedShop?: GameShop | null;
      linkedObjectId?: string | null;
    }>
  > {
    const entries: Array<{
      title: string;
      executablePath: string;
      iconUrl?: string;
      logoImageUrl?: string;
      libraryHeroImageUrl?: string;
      libraryImageUrl?: string;
      coverImageUrl?: string;
      linkedShop?: GameShop | null;
      linkedObjectId?: string | null;
    }> = [];

    for (const entry of gameEntries) {
      const assets = entry.shopDetails?.assets;
      const suggestion = entry.selectedSuggestion;

      // Try to download remote assets
      let iconUrl = assets?.iconUrl ?? suggestion?.iconUrl ?? undefined;
      const heroUrl = assets?.libraryHeroImageUrl ?? undefined;
      const logoUrl = assets?.logoImageUrl ?? undefined;
      const libImgUrl = assets?.libraryImageUrl ?? iconUrl;
      const coverUrl = assets?.coverImageUrl ?? iconUrl;

      // Download icon if we have a remote URL
      if (iconUrl && iconUrl.startsWith("http")) {
        try {
          iconUrl = await window.electron.downloadRemoteAsset(iconUrl, "icon");
        } catch {
          // Keep original URL
        }
      }

      entries.push({
        title: entry.gameName || entry.exe.fileName.replace(/\.exe$/i, ""),
        executablePath: entry.exe.filePath,
        iconUrl,
        logoImageUrl: logoUrl,
        libraryHeroImageUrl: heroUrl,
        libraryImageUrl: libImgUrl,
        coverImageUrl: coverUrl,
        linkedShop: suggestion?.shop ?? null,
        linkedObjectId: suggestion?.objectId ?? null,
      });
    }

    return entries;
  }

  // ---------- Platform import (unchanged) ----------

  const handleScanPlatforms = async () => {
    setIsScanning(true);
    try {
      const result = await window.electron.scanPlatforms();

      const platformKeys: Array<keyof typeof result> = [
        "epic",
        "gog",
        "battle-net",
        "amazon",
        "ubisoft",
        "xbox",
        "rockstar",
        "itch-io",
        "humble",
      ];

      const allGames = platformKeys.flatMap((key) => result[key].games);

      if (allGames.length > 0) {
        setDiscoveredGames(allGames);
        setShowDiscoveryModal(true);
      } else {
        showSuccessToast(t("scan_games_no_results", { ns: "header" }));
      }
    } catch {
      showErrorToast(t("scan_failed", { ns: "settings" }));
    } finally {
      setIsScanning(false);
    }
  };

  const handleImport = async (
    games: PlatformGame[],
    _autoImportFuture: boolean
  ) => {
    await window.electron.importPlatformGames(games);
    updateLibrary();
    showSuccessToast(
      t("imported_games_toast", {
        count: games.length,
        ns: "sidebar",
      })
    );
  };

  // ---------- Close handler ----------

  const handleClose = () => {
    if (!isAdding && !isScanning && !isFolderScanning) {
      resetAllState();
      onClose();
    }
  };

  // ---------- Render helpers ----------

  const hasSelection = selectedIndices.size > 0;
  const selectedCount = selectedIndices.size;
  const allFilteredSelected =
    filteredExes.length > 0 &&
    filteredExes.every((exe) => selectedIndices.has(scannedExes.indexOf(exe)));

  // ---------- Render ----------

  return (
    <>
      <Modal
        visible={visible}
        large
        title={
          showConfigView
            ? t("custom_game_modal_configure_games")
            : t("custom_game_modal")
        }
        description={
          showConfigView
            ? t("custom_game_modal_configure_description")
            : t("custom_game_modal_description")
        }
        onClose={handleClose}
      >
        <div className="sidebar-adding-custom-game-modal__container">
          {showConfigView ? (
            /* ===== CONFIG VIEW ===== */
            <div className="sidebar-adding-custom-game-modal__config-view">
              <div className="sidebar-adding-custom-game-modal__config-header">
                <Button
                  type="button"
                  theme="outline"
                  onClick={() => setShowConfigView(false)}
                  disabled={isAdding}
                >
                  <ChevronLeftIcon />
                  {t("custom_game_modal_back")}
                </Button>
                <span className="sidebar-adding-custom-game-modal__config-count">
                  {t("custom_game_modal_games_to_add", {
                    count: gameEntries.length,
                  })}
                </span>
              </div>

              <div className="sidebar-adding-custom-game-modal__entry-list">
                {gameEntries.map((entry, index) => (
                  <div
                    key={entry.exe.filePath}
                    className="sidebar-adding-custom-game-modal__entry-card"
                  >
                    <div className="sidebar-adding-custom-game-modal__entry-header">
                      <FileDirectoryIcon size={16} />
                      <div className="sidebar-adding-custom-game-modal__entry-file-info">
                        <span className="sidebar-adding-custom-game-modal__entry-filename">
                          {entry.exe.fileName}
                        </span>
                        <span className="sidebar-adding-custom-game-modal__entry-folder">
                          {entry.exe.filePath}
                        </span>
                      </div>
                    </div>

                    {/* Game name field with suggestions */}
                    <div className="sidebar-adding-custom-game-modal__entry-name-field">
                      <TextField
                        label={t("custom_game_modal_title")}
                        placeholder={t("custom_game_modal_enter_title")}
                        value={entry.gameName}
                        onChange={(e) =>
                          handleGameNameChange(index, e.target.value)
                        }
                        theme="dark"
                        disabled={isAdding}
                        rightContent={
                          entry.isSearchingName ? (
                            <SyncIcon className="sidebar-adding-custom-game-modal__spinner" />
                          ) : undefined
                        }
                      />

                      {entry.showSuggestions &&
                        entry.suggestions.length > 0 && (
                          <div className="sidebar-adding-custom-game-modal__suggestions">
                            {entry.suggestions.map((suggestion) => (
                              <button
                                key={`${suggestion.shop}-${suggestion.objectId}`}
                                type="button"
                                className={`sidebar-adding-custom-game-modal__suggestion-item ${
                                  entry.selectedSuggestion?.objectId ===
                                    suggestion.objectId &&
                                  entry.selectedSuggestion?.shop ===
                                    suggestion.shop
                                    ? "sidebar-adding-custom-game-modal__suggestion-item--selected"
                                    : ""
                                }`}
                                onClick={() =>
                                  handleSelectSuggestion(index, suggestion)
                                }
                              >
                                {suggestion.iconUrl && (
                                  <img
                                    src={suggestion.iconUrl}
                                    alt=""
                                    className="sidebar-adding-custom-game-modal__suggestion-icon"
                                  />
                                )}
                                <div className="sidebar-adding-custom-game-modal__suggestion-info">
                                  <span className="sidebar-adding-custom-game-modal__suggestion-title">
                                    {suggestion.title}
                                  </span>
                                  <span className="sidebar-adding-custom-game-modal__suggestion-shop">
                                    {suggestion.shop}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                    </div>

                    {/* Metadata preview */}
                    {entry.selectedSuggestion && (
                      <div className="sidebar-adding-custom-game-modal__entry-meta-preview">
                        <div className="sidebar-adding-custom-game-modal__meta-header">
                          <span>
                            {t("custom_game_modal_metadata_found", {
                              title: entry.selectedSuggestion.title,
                            })}
                          </span>
                        </div>
                        {(entry.shopDetails?.assets?.iconUrl ||
                          entry.selectedSuggestion.iconUrl) && (
                          <div className="sidebar-adding-custom-game-modal__meta-assets">
                            {(entry.shopDetails?.assets?.libraryHeroImageUrl ||
                              entry.shopDetails?.assets?.logoImageUrl) && (
                              <span className="sidebar-adding-custom-game-modal__meta-badge">
                                {t("custom_game_modal_assets_ready")}
                              </span>
                            )}
                            {(entry.shopDetails?.assets?.iconUrl ??
                              entry.selectedSuggestion.iconUrl) && (
                              <img
                                src={
                                  entry.shopDetails?.assets?.iconUrl ??
                                  entry.selectedSuggestion.iconUrl ??
                                  ""
                                }
                                alt=""
                                className="sidebar-adding-custom-game-modal__meta-icon"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="sidebar-adding-custom-game-modal__actions">
                <Button
                  type="button"
                  theme="outline"
                  onClick={() => setShowConfigView(false)}
                  disabled={isAdding}
                >
                  {t("custom_game_modal_cancel")}
                </Button>
                <Button
                  type="button"
                  theme="primary"
                  onClick={handleAddAllGames}
                  disabled={isAdding}
                >
                  {isAdding ? (
                    <>
                      <SyncIcon className="sidebar-adding-custom-game-modal__spinner" />
                      {t("custom_game_modal_adding")}
                    </>
                  ) : (
                    t("custom_game_modal_add_all", {
                      count: gameEntries.length,
                    })
                  )}
                </Button>
              </div>
            </div>
          ) : (
            /* ===== SCAN / SELECT VIEW ===== */
            <div className="sidebar-adding-custom-game-modal__form">
              {/* Action buttons */}
              <div className="sidebar-adding-custom-game-modal__exec-row">
                <Button
                  type="button"
                  theme="outline"
                  onClick={handleBrowseSingleExe}
                  disabled={isAdding}
                >
                  <FileDirectoryIcon />
                  {t("custom_game_modal_browse")}
                </Button>

                <Button
                  type="button"
                  theme="outline"
                  onClick={handleScanFolder}
                  disabled={isAdding || isFolderScanning}
                >
                  {isFolderScanning ? (
                    <>
                      <SyncIcon className="sidebar-adding-custom-game-modal__spinner" />
                      {t("custom_game_modal_scanning")}
                    </>
                  ) : (
                    <>
                      <SearchIcon />
                      {t("custom_game_modal_scan_folder")}
                    </>
                  )}
                </Button>

                {scannedExes.length > 0 && (
                  <Button
                    type="button"
                    theme="outline"
                    onClick={resetAllState}
                    disabled={isAdding}
                  >
                    <XIcon />
                  </Button>
                )}
              </div>

              {/* Scanning indicator */}
              {isFolderScanning && (
                <div className="sidebar-adding-custom-game-modal__scanning-indicator">
                  <SyncIcon className="sidebar-adding-custom-game-modal__spinner" />
                  <span>{t("custom_game_modal_scanning")}</span>
                </div>
              )}

              {/* EXE scan results with checkboxes */}
              {scannedExes.length > 0 && (
                <>
                  {/* Filter bar */}
                  {scannedExes.length > 8 && (
                    <TextField
                      placeholder={t("custom_game_modal_filter_exes")}
                      value={exeFilterQuery}
                      onChange={(e) => setExeFilterQuery(e.target.value)}
                      theme="dark"
                      rightContent={
                        exeFilterQuery ? (
                          <button
                            type="button"
                            className="sidebar-adding-custom-game-modal__clear-filter"
                            onClick={() => setExeFilterQuery("")}
                          >
                            <XIcon size={12} />
                          </button>
                        ) : undefined
                      }
                    />
                  )}

                  {/* Select all / deselect all */}
                  <div className="sidebar-adding-custom-game-modal__scan-header">
                    <button
                      type="button"
                      className="sidebar-adding-custom-game-modal__select-all"
                      onClick={toggleSelectAll}
                    >
                      {allFilteredSelected ? (
                        <XIcon size={14} />
                      ) : (
                        <CheckIcon size={14} />
                      )}
                      <span>
                        {allFilteredSelected
                          ? t("custom_game_modal_deselect_all")
                          : t("custom_game_modal_select_all")}
                      </span>
                    </button>
                    <span className="sidebar-adding-custom-game-modal__scan-count">
                      {filteredExes.length === scannedExes.length
                        ? t("custom_game_modal_exes_found", {
                            count: scannedExes.length,
                          })
                        : `${filteredExes.length} / ${scannedExes.length}`}
                    </span>
                  </div>

                  {/* EXE list with checkboxes */}
                  <div className="sidebar-adding-custom-game-modal__exe-list">
                    {filteredExes.length === 0 ? (
                      <div className="sidebar-adding-custom-game-modal__no-filter-results">
                        {t("custom_game_modal_no_filter_results")}
                      </div>
                    ) : (
                      filteredExes.map((exe) => {
                        // Find the actual index in scannedExes
                        const actualIdx = scannedExes.indexOf(exe);
                        const isSelected = selectedIndices.has(actualIdx);

                        return (
                          <button
                            key={exe.filePath}
                            type="button"
                            className={`sidebar-adding-custom-game-modal__exe-item ${
                              isSelected
                                ? "sidebar-adding-custom-game-modal__exe-item--selected"
                                : ""
                            }`}
                            onClick={() => toggleExeSelection(actualIdx)}
                          >
                            <div className="sidebar-adding-custom-game-modal__exe-checkbox">
                              {isSelected && <CheckIcon size={12} />}
                            </div>
                            <div className="sidebar-adding-custom-game-modal__exe-icon">
                              <FileDirectoryIcon size={16} />
                            </div>
                            <div className="sidebar-adding-custom-game-modal__exe-info">
                              <span className="sidebar-adding-custom-game-modal__exe-name">
                                {exe.fileName}
                              </span>
                              <span className="sidebar-adding-custom-game-modal__exe-folder">
                                {exe.filePath}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Add selected button */}
                  {hasSelection && (
                    <div className="sidebar-adding-custom-game-modal__bulk-actions">
                      <Button
                        type="button"
                        theme="primary"
                        onClick={handleProceedToConfig}
                        disabled={isAdding}
                        className="sidebar-adding-custom-game-modal__add-selected-btn"
                      >
                        {t("custom_game_modal_add_selected", {
                          count: selectedCount,
                        })}
                      </Button>
                    </div>
                  )}
                </>
              )}

              {!isFolderScanning &&
                scannedExes.length === 0 &&
                !scannedFolderPath && (
                  <div className="sidebar-adding-custom-game-modal__no-exes">
                    {t("custom_game_modal_scan_hint")}
                  </div>
                )}

              {!isFolderScanning &&
                scannedExes.length === 0 &&
                scannedFolderPath && (
                  <div className="sidebar-adding-custom-game-modal__no-exes">
                    {t("custom_game_modal_no_exes_found")}
                  </div>
                )}
            </div>
          )}

          {/* Divider + platform import (only in scan view) */}
          {!showConfigView && (
            <>
              <div className="sidebar-adding-custom-game-modal__divider">
                <span>{t("or_import", { ns: "sidebar" })}</span>
              </div>

              <div className="sidebar-adding-custom-game-modal__import-section">
                <p className="sidebar-adding-custom-game-modal__import-description">
                  {t("import_from_platforms_description", { ns: "sidebar" })}
                </p>

                <div className="sidebar-adding-custom-game-modal__platform-chips">
                  {IMPORT_PLATFORMS.map((platform) => (
                    <span
                      key={platform.shop}
                      className="sidebar-adding-custom-game-modal__platform-chip"
                    >
                      {platform.label}
                    </span>
                  ))}
                </div>

                <Button
                  type="button"
                  theme="dark"
                  onClick={handleScanPlatforms}
                  disabled={isScanning}
                  className="sidebar-adding-custom-game-modal__scan-button"
                >
                  {isScanning ? (
                    <>
                      <SyncIcon className="sidebar-adding-custom-game-modal__spinner" />
                      {t("scanning_platforms", { ns: "settings" })}
                    </>
                  ) : (
                    <>
                      <SyncIcon />
                      {t("scan_for_games", { ns: "settings" })}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <DiscoveryWizardModal
        visible={showDiscoveryModal}
        games={discoveredGames}
        onClose={() => setShowDiscoveryModal(false)}
        onImport={handleImport}
      />
    </>
  );
}
