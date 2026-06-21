import {
  ChevronDownIcon,
  DownloadIcon,
  GearIcon,
  HeartFillIcon,
  HeartIcon,
  LinkExternalIcon,
  ListUnorderedIcon,
  PinIcon,
  PinSlashIcon,
  PlayIcon,
  PlusCircleIcon,
  TrashIcon,
  FileDirectoryIcon,
  DesktopDownloadIcon,
} from "@primer/octicons-react";
import {
  Button,
  ConfirmationModal,
  WatchlistModal,
} from "@renderer/components";
import { XCircle } from "lucide-react";
import {
  useDownload,
  useLibrary,
  useToast,
  useUserDetails,
  useWatchlist,
} from "@renderer/hooks";
import { useContext, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { gameDetailsContext } from "@renderer/context";
import { getClassicsLaunchErrorCode } from "@renderer/helpers";
import { DiscSelectionModal } from "../modals/disc-selection-modal";

import "./hero-panel-actions.scss";
import { useEffect } from "react";

export function HeroPanelActions() {
  const [toggleLibraryGameDisabled, setToggleLibraryGameDisabled] =
    useState(false);

  const { isGameDeleting } = useDownload();
  const { userDetails } = useUserDetails();

  const {
    game,
    repacks,
    isGameRunning,
    shop,
    objectId,
    gameTitle,
    shopDetails,
    setShowGameOptionsModal,
    setGameOptionsInitialCategory,
    setShowRepacksModal,
    updateGame,
    selectGameExecutable,
    isTransferring,
    transferProgress,
  } = useContext(gameDetailsContext);

  const { updateLibrary } = useLibrary();

  const { showSuccessToast, showErrorToast } = useToast();

  const navigate = useNavigate();

  const {
    isGameWatchlisted,
    loadWatchlist,
    hasLoaded: watchlistHasLoaded,
  } = useWatchlist();

  const [showWatchlistModal, setShowWatchlistModal] = useState(false);
  const [showDiscSelectionModal, setShowDiscSelectionModal] = useState(false);
  const [showManageMenu, setShowManageMenu] = useState(false);
  const manageRef = useRef<HTMLDivElement>(null);
  const [pendingClassicsLaunch, setPendingClassicsLaunch] = useState<{
    discPath: string | undefined;
  } | null>(null);

  useEffect(() => {
    if (!watchlistHasLoaded) {
      loadWatchlist();
    }
  }, [watchlistHasLoaded, loadWatchlist]);

  const { t } = useTranslation("game_details");

  useEffect(() => {
    const onOpenDiscSelection = (event: Event) => {
      const detail = (event as CustomEvent<{ objectId?: string }>).detail;
      if (!detail?.objectId || detail.objectId === game?.objectId) {
        if (game?.shop === "launchbox" && (game?.discs?.length ?? 0) > 1) {
          setShowDiscSelectionModal(true);
        }
      }
    };
    window.addEventListener(
      "hydra:openDiscSelection",
      onOpenDiscSelection as EventListener
    );
    return () => {
      window.removeEventListener(
        "hydra:openDiscSelection",
        onOpenDiscSelection as EventListener
      );
    };
  }, [game?.objectId, game?.shop, game?.discs?.length]);

  useEffect(() => {
    const onFavoriteToggled = () => {
      updateLibrary();
      updateGame();
    };

    const onGameRemoved = () => {
      updateLibrary();
      updateGame();
    };

    const onFilesRemoved = () => {
      updateLibrary();
      updateGame();
    };

    window.addEventListener(
      "hydra:game-favorite-toggled",
      onFavoriteToggled as EventListener
    );
    window.addEventListener(
      "hydra:game-removed-from-library",
      onGameRemoved as EventListener
    );
    window.addEventListener(
      "hydra:game-files-removed",
      onFilesRemoved as EventListener
    );

    return () => {
      window.removeEventListener(
        "hydra:game-favorite-toggled",
        onFavoriteToggled as EventListener
      );
      window.removeEventListener(
        "hydra:game-removed-from-library",
        onGameRemoved as EventListener
      );
      window.removeEventListener(
        "hydra:game-files-removed",
        onFilesRemoved as EventListener
      );
    };
  }, [updateLibrary, updateGame]);

  // Close manage menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        manageRef.current &&
        !manageRef.current.contains(event.target as Node)
      ) {
        setShowManageMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addGameToLibrary = async () => {
    setToggleLibraryGameDisabled(true);

    try {
      await window.electron.addGameToLibrary(
        shop,
        objectId!,
        gameTitle,
        shopDetails?.platform ?? null
      );

      updateLibrary();
      updateGame();
    } finally {
      setToggleLibraryGameDisabled(false);
    }
  };

  const toggleGameFavorite = async () => {
    setToggleLibraryGameDisabled(true);

    try {
      if (game?.favorite && objectId) {
        await window.electron
          .removeGameFromFavorites(shop, objectId)
          .then(() => {
            showSuccessToast(t("game_removed_from_favorites"));
          });
      } else {
        if (!objectId) return;

        await window.electron.addGameToFavorites(shop, objectId).then(() => {
          showSuccessToast(t("game_added_to_favorites"));
        });
      }

      updateLibrary();
      updateGame();
    } finally {
      setToggleLibraryGameDisabled(false);
    }
  };

  const toggleGamePinned = async () => {
    setToggleLibraryGameDisabled(true);

    try {
      if (game?.isPinned && objectId) {
        await window.electron.toggleGamePin(shop, objectId, false).then(() => {
          showSuccessToast(t("game_removed_from_pinned"));
        });
      } else {
        if (!objectId) return;

        await window.electron.toggleGamePin(shop, objectId, true).then(() => {
          showSuccessToast(t("game_added_to_pinned"));
        });
      }

      updateLibrary();
      updateGame();
    } finally {
      setToggleLibraryGameDisabled(false);
    }
  };

  const launchClassicsWithErrorHandling = async (
    discPath?: string,
    force?: boolean
  ): Promise<void> => {
    if (!game) return;
    try {
      await window.electron.openClassicsGame(
        game.shop,
        game.objectId,
        discPath,
        force
      );
    } catch (error) {
      const code = getClassicsLaunchErrorCode(error);
      if (code === "EMULATOR_NOT_CONFIGURED") {
        showErrorToast(t("emulator_not_configured_toast"));
        navigate("/settings?tab=emulation");
      } else if (code === "PLATFORM_UNKNOWN") {
        showErrorToast(t("platform_unknown_toast"));
      } else if (code === "NO_DISC") {
        showErrorToast(t("no_disc_toast"));
      } else if (code === "EMULATOR_ALREADY_RUNNING") {
        setPendingClassicsLaunch({ discPath });
      } else {
        showErrorToast(t("launch_failed_toast"));
      }
    }
  };

  const openClassicsGame = async () => {
    if (!game) return;

    const discs = game.discs ?? [];

    if (discs.length <= 1) {
      await launchClassicsWithErrorHandling();
      return;
    }

    if (game.dontAskDiscSelection && game.selectedDiscPath) {
      await launchClassicsWithErrorHandling(game.selectedDiscPath);
      return;
    }

    setShowDiscSelectionModal(true);
  };

  const handleDiscSelectionConfirm = async (
    discPath: string,
    dontAskAgain: boolean
  ) => {
    if (!game) return;
    setShowDiscSelectionModal(false);
    try {
      await window.electron.updateClassicsDisc(game.shop, game.objectId, {
        selectedDiscPath: discPath,
        dontAskDiscSelection: dontAskAgain,
      });
      updateGame();
    } catch (error) {
      // non-fatal; still try to launch
    }
    await launchClassicsWithErrorHandling(discPath);
  };

  const openGame = async () => {
    if (!game) return;

    if (game.shop === "launchbox") {
      await openClassicsGame();
      return;
    }

    if (
      game.shop === "steam" &&
      (game.acquisitionSource === "steam_scan" || !game.executablePath)
    ) {
      try {
        await window.electron.steamLaunchGame(game.objectId);
        showSuccessToast(t("launching_via_steam"));
      } catch {
        showErrorToast(t("steam_launch_failed"));
      }
      return;
    }

    if (game.executablePath) {
      window.electron.openGame(
        game.shop,
        game.objectId,
        game.executablePath,
        game.launchOptions
      );
      return;
    }

    const gameExecutablePath = await selectGameExecutable();
    if (gameExecutablePath)
      window.electron.openGame(
        game.shop,
        game.objectId,
        gameExecutablePath,
        game.launchOptions
      );
  };

  const openInstallDirectory = async () => {
    if (!game) return;
    try {
      await window.electron.openGameInstallerPath(game.shop, game.objectId);
    } catch {
      // silently fail if folder doesn't exist
    }
  };

  const createDesktopShortcut = async () => {
    if (!game) return;
    try {
      await window.electron.createGameShortcut(
        game.shop,
        game.objectId,
        "desktop"
      );
      showSuccessToast(t("shortcut_created", "Shortcut created"));
    } catch {
      showErrorToast(t("shortcut_failed", "Failed to create shortcut"));
    }
  };

  const handleUninstall = async () => {
    if (!game) return;
    try {
      await window.electron.deleteGameFolder(game.shop, game.objectId);
      await updateGame();
      await updateLibrary();
      showSuccessToast(t("game_uninstalled", "Game files removed"));
    } catch {
      showErrorToast(t("uninstall_failed", "Failed to uninstall"));
    }
  };

  const closeGame = () => {
    if (game) window.electron.closeGame(game.shop, game.objectId);
  };

  const [steamLoggedIn, setSteamLoggedIn] = useState(false);

  useEffect(() => {
    if (game?.shop === "steam") {
      window.electron.steamGetLoginStatus().then((status) => {
        setSteamLoggedIn(status.status === "logged-in");
      });
    } else {
      setSteamLoggedIn(false);
    }
  }, [game?.shop]);

  const handlePlayViaSteam = async () => {
    if (game) {
      try {
        await window.electron.steamLaunchGame(game.objectId);
        showSuccessToast(t("launching_via_steam"));
      } catch {
        showErrorToast(t("steam_launch_failed"));
      }
    }
  };

  const handleInstallViaSteam = async () => {
    if (game) {
      try {
        await window.electron.steamInstallGame(game.objectId);
        showSuccessToast(t("installing_via_steam"));
      } catch {
        showErrorToast(t("steam_install_failed"));
      }
    }
  };

  const deleting = game ? isGameDeleting(game?.id) : false;

  const addGameToLibraryButton = (
    <Button
      theme="outline"
      disabled={toggleLibraryGameDisabled}
      onClick={addGameToLibrary}
      className="hero-panel-actions__action"
    >
      <PlusCircleIcon />
      {t("add_to_library")}
    </Button>
  );

  const watchlisted = isGameWatchlisted(shop, objectId ?? "");

  const watchlistGame = {
    id: `${shop}:${objectId}`,
    objectId: objectId ?? "",
    title: gameTitle,
    shop,
    genres: (shopDetails?.genres ?? []).map((g) =>
      typeof g === "string" ? g : g.name
    ),
    releaseYear: shopDetails?.release_date?.date
      ? new Date(shopDetails.release_date.date).getFullYear()
      : null,
    libraryImageUrl:
      shopDetails?.assets?.libraryImageUrl ?? game?.libraryImageUrl ?? null,
    downloadSources: shopDetails?.assets?.downloadSources ?? [],
  };

  const watchlistButton = (
    <Button
      theme={watchlisted ? "outline" : "outline"}
      onClick={() => setShowWatchlistModal(true)}
      className="hero-panel-actions__action"
    >
      <ListUnorderedIcon />
      {watchlisted
        ? t("in_watchlist", { defaultValue: "In watchlist" })
        : t("add_to_watchlist", { defaultValue: "Add to watchlist" })}
    </Button>
  );

  const handleOpenDownloadOptionsModal = () => {
    if (game) {
      setGameOptionsInitialCategory("downloads");
      setShowGameOptionsModal(true);
    } else {
      setShowRepacksModal(true);
    }
  };

  const gameActionButton = () => {
    if (isTransferring) {
      const percent = Math.round(transferProgress * 100);
      return (
        <Button
          theme="outline"
          className="hero-panel-actions__action hero-panel-actions__cta"
          onClick={() => {
            setGameOptionsInitialCategory("locations");
            setShowGameOptionsModal(true);
          }}
        >
          <div className="hero-panel-actions__cta-progress-ring">
            <svg
              viewBox="0 0 36 36"
              className="hero-panel-actions__progress-svg"
            >
              <path
                className="hero-panel-actions__progress-track"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="hero-panel-actions__progress-fill"
                strokeDasharray={`${transferProgress * 100}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
          </div>
          Transferring {percent}%
        </Button>
      );
    }

    if (isGameRunning) {
      return (
        <Button
          onClick={closeGame}
          theme="outline"
          disabled={deleting}
          className="hero-panel-actions__action hero-panel-actions__cta hero-panel-actions__cta--close"
        >
          <XCircle size={18} />
          {t("close")}
        </Button>
      );
    }

    const isPlayableClassics =
      game?.shop === "launchbox" && (game?.discs?.length ?? 0) > 0;

    if (game?.executablePath || isPlayableClassics || game?.shop === "steam") {
      return (
        <Button
          onClick={openGame}
          theme="outline"
          disabled={deleting || isGameRunning}
          className="hero-panel-actions__action hero-panel-actions__cta"
        >
          <PlayIcon />
          {t("play")}
        </Button>
      );
    }

    return (
      <Button
        onClick={handleOpenDownloadOptionsModal}
        theme="outline"
        className="hero-panel-actions__action hero-panel-actions__cta"
      >
        <DownloadIcon />
        {t("download")}
      </Button>
    );
  };

  // Per spec §4.1: the Download button is always clickable. Any of the three
  // branches below render it so the user always has a path into the modal,
  // which then explains empty/error states.
  const downloadButton = (
    <Button
      onClick={handleOpenDownloadOptionsModal}
      theme="outline"
      className="hero-panel-actions__action"
    >
      <DownloadIcon />
      {t("download")}
    </Button>
  );

  if (repacks.length && !game) {
    return (
      <>
        {addGameToLibraryButton}
        {watchlistButton}
        {downloadButton}

        <WatchlistModal
          visible={showWatchlistModal}
          game={watchlistGame as any}
          onClose={() => setShowWatchlistModal(false)}
        />
      </>
    );
  }

  if (game) {
    const isSteamGame = game.shop === "steam";
    const showSteamPlay = isSteamGame && steamLoggedIn && !isGameRunning;
    const showSteamInstall =
      isSteamGame && steamLoggedIn && !game.executablePath;

    return (
      <div className="hero-panel-actions__container">
        <div className="hero-panel-actions__cta-group">
          {gameActionButton()}

          {/* Manage dropdown */}
          <div className="hero-panel-actions__manage-wrapper" ref={manageRef}>
            <button
              type="button"
              className="hero-panel-actions__manage-trigger"
              onClick={() => setShowManageMenu((v) => !v)}
              title={t("manage_game")}
            >
              <ChevronDownIcon size={12} />
            </button>

            {showManageMenu && (
              <div className="hero-panel-actions__manage-menu">
                <button
                  type="button"
                  className="hero-panel-actions__manage-item"
                  onClick={() => {
                    setShowManageMenu(false);
                    createDesktopShortcut();
                  }}
                >
                  <DesktopDownloadIcon size={14} />
                  <span>{t("create_desktop_shortcut")}</span>
                </button>
                <button
                  type="button"
                  className="hero-panel-actions__manage-item"
                  onClick={() => {
                    setShowManageMenu(false);
                    openInstallDirectory();
                  }}
                >
                  <FileDirectoryIcon size={14} />
                  <span>
                    {t("open_install_directory", "Open Install Directory")}
                  </span>
                </button>
                <div className="hero-panel-actions__manage-separator" />
                <button
                  type="button"
                  className="hero-panel-actions__manage-item hero-panel-actions__manage-item--danger"
                  onClick={() => {
                    setShowManageMenu(false);
                    handleUninstall();
                  }}
                >
                  <TrashIcon size={14} />
                  <span>{t("uninstall")}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {showSteamPlay && (
          <Button
            onClick={handlePlayViaSteam}
            theme="outline"
            className="hero-panel-actions__action"
          >
            <LinkExternalIcon />
            {t("play_via_steam")}
          </Button>
        )}

        {showSteamInstall && (
          <Button
            onClick={handleInstallViaSteam}
            theme="outline"
            className="hero-panel-actions__action"
          >
            <DownloadIcon />
            {t("install_via_steam")}
          </Button>
        )}

        <div className="hero-panel-actions__separator" />
        <Button
          onClick={toggleGameFavorite}
          theme="outline"
          disabled={deleting}
          className="hero-panel-actions__action"
        >
          {game.favorite ? <HeartFillIcon /> : <HeartIcon />}
        </Button>

        {userDetails && game.shop !== "custom" && (
          <Button
            onClick={toggleGamePinned}
            theme="outline"
            disabled={deleting}
            className="hero-panel-actions__action"
          >
            {game.isPinned ? <PinSlashIcon /> : <PinIcon />}
          </Button>
        )}

        <Button
          onClick={() => {
            setGameOptionsInitialCategory("general");
            setShowGameOptionsModal(true);
          }}
          theme="outline"
          disabled={deleting}
          className="hero-panel-actions__action"
        >
          <GearIcon />
          {t("options")}
        </Button>

        <div className="hero-panel-actions__separator" />

        {watchlistButton}

        <WatchlistModal
          visible={showWatchlistModal}
          game={watchlistGame as any}
          onClose={() => setShowWatchlistModal(false)}
        />

        {game.shop === "launchbox" && (
          <DiscSelectionModal
            visible={showDiscSelectionModal}
            discs={game.discs ?? []}
            defaultDiscPath={game.selectedDiscPath ?? null}
            defaultDontAsk={Boolean(game.dontAskDiscSelection)}
            onClose={() => setShowDiscSelectionModal(false)}
            onConfirm={handleDiscSelectionConfirm}
          />
        )}

        <ConfirmationModal
          visible={pendingClassicsLaunch !== null}
          title={t("rpcs3_already_running_title")}
          descriptionText={t("rpcs3_already_running_description")}
          confirmButtonLabel={t("rpcs3_already_running_confirm")}
          cancelButtonLabel={t("cancel")}
          onClose={() => setPendingClassicsLaunch(null)}
          onConfirm={() => {
            const pending = pendingClassicsLaunch;
            setPendingClassicsLaunch(null);
            if (pending) {
              void launchClassicsWithErrorHandling(pending.discPath, true);
            }
          }}
        />
      </div>
    );
  }

  return (
    <>
      {addGameToLibraryButton}
      {watchlistButton}
      {downloadButton}

      <WatchlistModal
        visible={showWatchlistModal}
        game={watchlistGame as any}
        onClose={() => setShowWatchlistModal(false)}
      />
    </>
  );
}
