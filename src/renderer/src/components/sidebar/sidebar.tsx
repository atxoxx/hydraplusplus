import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Tooltip } from "react-tooltip";

import type { GameCollection, LibraryGame } from "@types";

import {
  Button,
  ConfirmationModal,
  ContextMenu,
  CreateCollectionModal,
  Modal,
  TextField,
} from "@renderer/components";
import {
  useDownload,
  useGameCollections,
  useLibrary,
  useToast,
  useUserDetails,
  useFriendGameOwnership,
} from "@renderer/hooks";
import { AuthPage } from "@shared";

import "./sidebar.scss";

import { buildGameDetailsPath } from "@renderer/helpers";

import {
  ChevronRightIcon,
  CommentDiscussionIcon,
  FileDirectoryIcon,
  HeartIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@primer/octicons-react";
import type { GameShop, UserGameStatus } from "@types";
import deckyIcon from "@renderer/assets/icons/decky.png";
import { setCollections } from "@renderer/features";
import { setFriendRequestCount } from "@renderer/features/user-details-slice";
import cn from "classnames";
import { useDispatch } from "react-redux";
import { SidebarAddingCustomGameModal } from "./sidebar-adding-custom-game-modal";
import { SidebarGameItem } from "./sidebar-game-item";
import { SidebarProfile } from "./sidebar-profile";
import { SidebarSuggestions } from "./sidebar-suggestions";
import {
  SidebarFilterMenu,
  type LibrarySetFilter,
  type SidebarSortOption,
  type FilterOption,
} from "./sidebar-filter-menu";

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_INITIAL_WIDTH = 250;
const SIDEBAR_MAX_WIDTH = 450;
const FAVORITES_COLLECTION_ID = "__favorites__";

const VALID_SORTS: SidebarSortOption[] = [
  "alphabetical",
  "title_desc",
  "most_played",
  "recently_played",
  "installed_first",
];

const STATUS_FILTER_VALUES: UserGameStatus[] = [
  "playing",
  "on_hold",
  "beaten",
  "completed",
  "played",
  "not_played",
  "abandoned",
  "plan_to_play",
];

const STATUS_LABELS: Record<UserGameStatus, string> = {
  none: "status_none",
  not_played: "status_not_played",
  playing: "status_playing",
  on_hold: "status_on_hold",
  played: "status_played",
  beaten: "status_beaten",
  completed: "status_completed",
  abandoned: "status_abandoned",
  plan_to_play: "status_plan_to_play",
};

const VALID_LIBRARY_SETS: LibrarySetFilter[] = [
  "all",
  "installed",
  "not_installed",
];

const SHOP_LABEL_KEYS: Record<GameShop, string> = {
  steam: "platform_steam",
  epic: "platform_epic",
  gog: "platform_gog",
  "battle-net": "platform_battle_net",
  amazon: "platform_amazon",
  ubisoft: "platform_ubisoft",
  xbox: "platform_xbox",
  rockstar: "platform_rockstar",
  "itch-io": "platform_itch_io",
  humble: "platform_humble",
  ea: "platform_ea",
  custom: "platform_custom",
  launchbox: "platform_launchbox",
};

interface SidebarFilterState {
  librarySet: LibrarySetFilter;
  stores: string[];
  genres: string[];
  statuses: UserGameStatus[];
  sortBy: SidebarSortOption;
}

function getDefaultFilterState(): SidebarFilterState {
  return {
    librarySet: "all",
    stores: [],
    genres: [],
    statuses: [],
    sortBy: "alphabetical",
  };
}

function loadStoredArray<T extends string>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is T => typeof v === "string");
  } catch {
    return [];
  }
}

function getSavedFilterState(): SidebarFilterState {
  const defaults = getDefaultFilterState();
  const librarySetRaw = localStorage.getItem("sidebar-filter-library-set");
  const librarySet: LibrarySetFilter =
    librarySetRaw && (VALID_LIBRARY_SETS as string[]).includes(librarySetRaw)
      ? (librarySetRaw as LibrarySetFilter)
      : defaults.librarySet;

  const sortRaw = localStorage.getItem("sidebar-sort-by");
  const sortBy: SidebarSortOption =
    sortRaw && (VALID_SORTS as string[]).includes(sortRaw)
      ? (sortRaw as SidebarSortOption)
      : defaults.sortBy;

  return {
    librarySet,
    stores: loadStoredArray<string>("sidebar-filter-stores"),
    genres: loadStoredArray<string>("sidebar-filter-genres"),
    statuses: loadStoredArray<UserGameStatus>("sidebar-filter-statuses").filter(
      (value): value is UserGameStatus =>
        (STATUS_FILTER_VALUES as string[]).includes(value)
    ),
    sortBy,
  };
}

function isGameInstalled(game: LibraryGame): boolean {
  return Boolean(game.executablePath) || game.installedSizeInBytes != null;
}

function getGameGenres(game: LibraryGame): string[] {
  return Array.isArray(game.genres) ? game.genres : [];
}

function gameMatchesGenres(game: LibraryGame, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const lower = getGameGenres(game).map((g) => g.toLowerCase());
  return selected.every((needle) => lower.includes(needle.toLowerCase()));
}

const initialSidebarWidth = window.localStorage.getItem("sidebarWidth");

export function Sidebar() {
  const filterRef = useRef<HTMLInputElement>(null);

  const dispatch = useDispatch();

  const { t } = useTranslation(["sidebar", "library"]);
  const { library, updateLibrary } = useLibrary();
  const [deckyPluginInfo, setDeckyPluginInfo] = useState<{
    installed: boolean;
    version: string | null;
    outdated: boolean;
  }>({ installed: false, version: null, outdated: false });
  const [homebrewFolderExists, setHomebrewFolderExists] = useState(false);
  const [showDeckyConfirmModal, setShowDeckyConfirmModal] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(
    initialSidebarWidth ? Number(initialSidebarWidth) : SIDEBAR_INITIAL_WIDTH
  );

  const location = useLocation();

  const [filterState, setFilterState] =
    useState<SidebarFilterState>(getSavedFilterState);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const updateFilterState = useCallback(
    (updater: (prev: SidebarFilterState) => SidebarFilterState) => {
      setFilterState((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem("sidebar-filter-library-set", next.librarySet);
          localStorage.setItem(
            "sidebar-filter-stores",
            JSON.stringify(next.stores)
          );
          localStorage.setItem(
            "sidebar-filter-genres",
            JSON.stringify(next.genres)
          );
          localStorage.setItem(
            "sidebar-filter-statuses",
            JSON.stringify(next.statuses)
          );
          localStorage.setItem("sidebar-sort-by", next.sortBy);
        } catch {
          /* localStorage unavailable; ignore */
        }
        return next;
      });
    },
    []
  );

  const handleResetAllFilters = useCallback(() => {
    updateFilterState(() => getDefaultFilterState());
  }, [updateFilterState]);

  const { hasActiveSubscription, userDetails } = useUserDetails();

  const { lastPacket, progress } = useDownload();

  const { showWarningToast, showSuccessToast, showErrorToast } = useToast();

  const [isCollectionsCollapsed, setIsCollectionsCollapsed] = useState(false);
  const [isSuggestionsCollapsed, setIsSuggestionsCollapsed] = useState(false);
  const [isGamesCollapsed, setIsGamesCollapsed] = useState(false);
  const [showAddGameModal, setShowAddGameModal] = useState(false);
  const [showCreateCollectionModal, setShowCreateCollectionModal] =
    useState(false);
  const [collectionContextMenu, setCollectionContextMenu] = useState<{
    collection: GameCollection | null;
    visible: boolean;
    position: { x: number; y: number };
  }>({ collection: null, visible: false, position: { x: 0, y: 0 } });
  const [activeCollection, setActiveCollection] =
    useState<GameCollection | null>(null);
  const [showRenameCollectionModal, setShowRenameCollectionModal] =
    useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [isRenamingCollection, setIsRenamingCollection] = useState(false);
  const [showDeleteCollectionModal, setShowDeleteCollectionModal] =
    useState(false);
  const [isDeletingCollection, setIsDeletingCollection] = useState(false);
  const {
    collections,
    hasLoaded: hasLoadedCollections,
    loadCollections,
  } = useGameCollections();

  const { getOwnership } = useFriendGameOwnership();

  const selectedCollectionId = useMemo(() => {
    if (!location.pathname.startsWith("/library")) return null;
    return searchParams.get("collection");
  }, [location.pathname, searchParams]);

  const handleAddGameButtonClick = () => {
    setShowAddGameModal(true);
  };

  const handleCreateCollectionButtonClick = () => {
    if (!userDetails) {
      window.electron.openAuthWindow(AuthPage.SignIn);
      return;
    }

    setShowCreateCollectionModal(true);
  };

  const handleCloseAddGameModal = () => {
    setShowAddGameModal(false);
  };

  const loadDeckyPluginInfo = async () => {
    if (window.electron.platform !== "linux") return;

    try {
      const [info, folderExists] = await Promise.all([
        window.electron.getHydraDeckyPluginInfo(),
        window.electron.checkHomebrewFolderExists(),
      ]);

      setDeckyPluginInfo({
        installed: info.installed,
        version: info.version,
        outdated: info.outdated,
      });
      setHomebrewFolderExists(folderExists);
    } catch (error) {
      console.error("Failed to load Decky plugin info:", error);
    }
  };

  const handleInstallHydraDeckyPlugin = () => {
    if (deckyPluginInfo.installed && !deckyPluginInfo.outdated) {
      return;
    }
    setShowDeckyConfirmModal(true);
  };

  const handleConfirmDeckyInstallation = async () => {
    setShowDeckyConfirmModal(false);

    try {
      const result = await window.electron.installHydraDeckyPlugin();

      if (result.success) {
        showSuccessToast(
          t("decky_plugin_installed", {
            version: result.currentVersion,
          })
        );
        await loadDeckyPluginInfo();
      } else {
        showErrorToast(
          t("decky_plugin_installation_failed", {
            error: result.error || "Unknown error",
          })
        );
      }
    } catch (error) {
      showErrorToast(
        t("decky_plugin_installation_error", { error: String(error) })
      );
    }
  };

  useEffect(() => {
    updateLibrary();
  }, [lastPacket?.gameId, updateLibrary]);

  useEffect(() => {
    loadDeckyPluginInfo();
  }, []);

  useEffect(() => {
    if (!userDetails || hasLoadedCollections) return;
    void loadCollections();
  }, [hasLoadedCollections, loadCollections, userDetails]);

  useEffect(() => {
    const unsubscribe = window.electron.onSyncFriendRequests((result) => {
      dispatch(setFriendRequestCount(result.friendRequestCount));
    });

    return () => {
      unsubscribe();
    };
  }, [dispatch]);

  const sidebarRef = useRef<HTMLElement>(null);

  const cursorPos = useRef({ x: 0 });
  const sidebarInitialWidth = useRef(0);

  const handleMouseDown: React.MouseEventHandler<HTMLButtonElement> = (
    event
  ) => {
    setIsResizing(true);
    cursorPos.current.x = event.screenX;
    sidebarInitialWidth.current =
      sidebarRef.current?.clientWidth || SIDEBAR_INITIAL_WIDTH;
  };

  // ---------- Menu filter pipeline: filter -> sort -> title substring ----------
  const menuFilteredLibrary = useMemo(() => {
    const { librarySet, stores, genres, statuses } = filterState;

    if (
      librarySet === "all" &&
      stores.length === 0 &&
      genres.length === 0 &&
      statuses.length === 0
    ) {
      return library;
    }

    return library.filter((game) => {
      if (librarySet === "installed" && !isGameInstalled(game)) return false;
      if (librarySet === "not_installed" && isGameInstalled(game)) return false;

      if (stores.length > 0 && !stores.includes(game.shop)) return false;

      if (genres.length > 0 && !gameMatchesGenres(game, genres)) return false;

      if (
        statuses.length > 0 &&
        !statuses.includes(game.userStatus as UserGameStatus)
      ) {
        return false;
      }

      return true;
    });
  }, [library, filterState]);

  const sortedLibrary = useMemo(() => {
    const sorted = [...menuFilteredLibrary];

    switch (filterState.sortBy) {
      case "most_played":
        sorted.sort(
          (a, b) =>
            (b.playTimeInMilliseconds ?? 0) - (a.playTimeInMilliseconds ?? 0)
        );
        break;
      case "recently_played": {
        const aHasPlayed = (a: LibraryGame) => a.lastTimePlayed !== null;
        sorted.sort((a, b) => {
          if (aHasPlayed(a) && aHasPlayed(b)) {
            return (
              new Date(b.lastTimePlayed!).getTime() -
              new Date(a.lastTimePlayed!).getTime()
            );
          }
          if (aHasPlayed(a) !== aHasPlayed(b)) return aHasPlayed(a) ? -1 : 1;
          return a.title.localeCompare(b.title, undefined, {
            sensitivity: "base",
          });
        });
        break;
      }
      case "installed_first":
        sorted.sort((a, b) => {
          if (isGameInstalled(a) !== isGameInstalled(b))
            return isGameInstalled(a) ? -1 : 1;
          return a.title.localeCompare(b.title, undefined, {
            sensitivity: "base",
          });
        });
        break;
      case "title_desc":
        sorted.sort((a, b) =>
          b.title.localeCompare(a.title, undefined, { sensitivity: "base" })
        );
        break;
      case "alphabetical":
      default:
        sorted.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        );
        break;
    }

    return sorted;
  }, [menuFilteredLibrary, filterState.sortBy]);

  // Text-search filter layer (controlled by `searchText`; output is `displayedLibrary`).
  const [searchText, setSearchText] = useState("");

  const handleFilter: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    setSearchText(event.target.value);
  };

  const displayedLibrary = useMemo(() => {
    const trimmed = searchText.trim();
    if (!trimmed) return sortedLibrary;
    const lower = trimmed.toLowerCase();
    return sortedLibrary.filter((game) =>
      game.title.toLowerCase().includes(lower)
    );
  }, [sortedLibrary, searchText]);

  // Reset the search input only when the underlying library actually changes
  // (e.g. after a scan). Menu filter / sort changes should NOT clear the search.
  const lastLibraryRef = useRef(library);
  useEffect(() => {
    if (lastLibraryRef.current !== library) {
      lastLibraryRef.current = library;
      setSearchText("");
      if (filterRef.current) {
        filterRef.current.value = "";
      }
    }
  }, [library]);

  // ---------- Available options for the filter menu ----------
  const availableStores = useMemo<FilterOption<string>[]>(() => {
    const counts = new Map<string, number>();
    for (const game of library) {
      counts.set(game.shop, (counts.get(game.shop) ?? 0) + 1);
    }
    const shops = Array.from(counts.keys());
    shops.sort((a, b) => a.localeCompare(b));
    return shops.map((shop) => {
      const labelKey = SHOP_LABEL_KEYS[shop as GameShop] ?? `platform_${shop}`;
      return {
        value: shop,
        label: t(labelKey, { ns: "settings", defaultValue: shop }),
        count: counts.get(shop) ?? 0,
      };
    });
  }, [library, t]);

  const availableGenres = useMemo<FilterOption<string>[]>(() => {
    const counts = new Map<string, number>();
    for (const game of library) {
      for (const genre of getGameGenres(game)) {
        const key = genre.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const sortedGenres = Array.from(counts.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    return sortedGenres.map((genre) => ({
      value: genre,
      label: genre,
      count: counts.get(genre) ?? 0,
    }));
  }, [library]);

  const libraryCountTotals = useMemo(() => {
    const total = library.length;
    const installed = library.filter(isGameInstalled).length;
    return {
      total,
      installed,
      notInstalled: Math.max(0, total - installed),
    };
  }, [library]);

  const availableStatuses = useMemo<FilterOption<UserGameStatus>[]>(() => {
    const counts = new Map<UserGameStatus, number>();
    for (const game of library) {
      const status = (game.userStatus ?? "none") as UserGameStatus;
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return STATUS_FILTER_VALUES.filter(
      (status) => (counts.get(status) ?? 0) > 0
    ).map((status) => ({
      value: status,
      label: t(STATUS_LABELS[status], { ns: "game_details" }),
      count: counts.get(status) ?? 0,
    }));
  }, [library, t]);

  useEffect(() => {
    window.onmousemove = (event: MouseEvent) => {
      if (isResizing) {
        const cursorXDelta = event.screenX - cursorPos.current.x;
        const newWidth = Math.max(
          SIDEBAR_MIN_WIDTH,
          Math.min(
            sidebarInitialWidth.current + cursorXDelta,
            SIDEBAR_MAX_WIDTH
          )
        );

        setSidebarWidth(newWidth);
        window.localStorage.setItem("sidebarWidth", String(newWidth));
      }
    };

    window.onmouseup = () => {
      if (isResizing) setIsResizing(false);
    };

    return () => {
      window.onmouseup = null;
      window.onmousemove = null;
    };
  }, [isResizing]);

  const getGameTitle = (game: LibraryGame) => {
    if (lastPacket?.gameId === game.id) {
      return t("downloading", {
        title: game.title,
        percentage: progress,
      });
    }

    if (
      game.download?.queued &&
      game.download.status !== "removed" &&
      game.download.status !== "complete" &&
      game.download.status !== "seeding"
    ) {
      return t("queued", { title: game.title });
    }

    if (game.download?.status === "paused")
      return t("paused", { title: game.title });

    return game.title;
  };

  const handleSidebarGameClick = (
    event: React.MouseEvent,
    game: LibraryGame
  ) => {
    const path = buildGameDetailsPath({
      ...game,
      objectId: game.objectId,
    });
    if (path !== location.pathname) {
      navigate(path);
    }

    if (event.detail === 2) {
      if (game.executablePath) {
        window.electron.openGame(
          game.shop,
          game.objectId,
          game.executablePath,
          game.launchOptions
        );
      } else {
        showWarningToast(t("game_has_no_executable"));
      }
    }
  };

  const handleSuggestionClick = (game: LibraryGame) => {
    const path = buildGameDetailsPath({
      ...game,
      objectId: game.objectId,
    });
    if (path !== location.pathname) {
      navigate(path);
    }
  };

  const handleSidebarCollectionClick = (collectionId: string) => {
    const params = new URLSearchParams();
    params.set("collection", collectionId);

    const path = `/library?${params.toString()}`;
    if (path !== `${location.pathname}${location.search}`) {
      navigate(path);
    }
  };

  const handleOpenCollectionContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    collection: GameCollection
  ) => {
    event.preventDefault();

    setCollectionContextMenu({
      collection,
      visible: true,
      position: { x: event.clientX, y: event.clientY },
    });
  };

  const handleCloseCollectionContextMenu = () => {
    setCollectionContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const resolveCollectionErrorMessage = (
    error: unknown,
    fallbackKey: "failed_rename_collection" | "failed_delete_collection"
  ) => {
    if (!(error instanceof Error)) return t(fallbackKey, { ns: "library" });

    if (error.message.includes("game/collection-name-already-in-use")) {
      return t("collection_name_already_in_use");
    }

    if (error.message.includes("game/collection-name-required")) {
      return t("collection_name_required");
    }

    return t(fallbackKey, { ns: "library" });
  };

  const handleOpenRenameCollectionModal = () => {
    const collection = collectionContextMenu.collection;
    if (!collection) return;

    setActiveCollection(collection);
    setCollectionName(collection.name);
    setShowRenameCollectionModal(true);
    handleCloseCollectionContextMenu();
  };

  const handleCloseRenameCollectionModal = () => {
    if (isRenamingCollection) return;

    setShowRenameCollectionModal(false);
    setCollectionName("");
    setActiveCollection(null);
  };

  const handleRenameCollection = async () => {
    const targetCollection =
      activeCollection ?? collectionContextMenu.collection;
    if (!targetCollection) return;

    const nextName = collectionName.trim();
    if (!nextName) {
      showErrorToast(t("collection_name_required"));
      return;
    }

    if (nextName === targetCollection.name.trim()) {
      handleCloseRenameCollectionModal();
      return;
    }

    setIsRenamingCollection(true);

    try {
      await window.electron.hydraApi.put(
        `/profile/games/collections/${targetCollection.id}`,
        {
          data: { name: nextName },
          needsAuth: true,
        }
      );

      const updatedCollections = await window.electron.hydraApi.get<
        GameCollection[]
      >("/profile/games/collections", { needsAuth: true });
      dispatch(setCollections(updatedCollections));
      showSuccessToast(t("collection_renamed", { ns: "library" }));
      handleCloseRenameCollectionModal();
    } catch (error) {
      showErrorToast(
        resolveCollectionErrorMessage(error, "failed_rename_collection")
      );
    } finally {
      setIsRenamingCollection(false);
    }
  };

  const handleOpenDeleteCollectionModal = () => {
    const collection = collectionContextMenu.collection;
    if (!collection) return;

    setActiveCollection(collection);
    setShowDeleteCollectionModal(true);
    handleCloseCollectionContextMenu();
  };

  const handleCloseDeleteCollectionModal = () => {
    if (isDeletingCollection) return;

    setShowDeleteCollectionModal(false);
    setActiveCollection(null);
  };

  const handleDeleteCollection = async () => {
    const targetCollection =
      activeCollection ?? collectionContextMenu.collection;
    if (!targetCollection) return;

    setIsDeletingCollection(true);

    try {
      await window.electron.hydraApi.delete(
        `/profile/games/collections/${targetCollection.id}`,
        { needsAuth: true }
      );

      if (selectedCollectionId === targetCollection.id) {
        const params = new URLSearchParams(searchParams);
        params.delete("collection");
        setSearchParams(params, { replace: true });
      }

      const updatedCollectionsPromise = window.electron.hydraApi.get<
        GameCollection[]
      >("/profile/games/collections", { needsAuth: true });
      await updateLibrary();
      const updatedCollections = await updatedCollectionsPromise;
      dispatch(setCollections(updatedCollections));
      showSuccessToast(t("collection_deleted", { ns: "library" }));
      handleCloseDeleteCollectionModal();
    } catch (error) {
      showErrorToast(
        resolveCollectionErrorMessage(error, "failed_delete_collection")
      );
    } finally {
      setIsDeletingCollection(false);
    }
  };

  const collectionContextMenuItems = useMemo(() => {
    const isCollectionActionBusy = isRenamingCollection || isDeletingCollection;

    return [
      {
        id: "rename-collection",
        label: t("rename_collection", { ns: "library" }),
        icon: <PencilIcon size={16} />,
        onClick: handleOpenRenameCollectionModal,
        disabled: isCollectionActionBusy,
      },
      {
        id: "delete-collection",
        label: t("delete_collection", { ns: "library" }),
        icon: <TrashIcon size={16} />,
        onClick: handleOpenDeleteCollectionModal,
        danger: true,
        disabled: isCollectionActionBusy,
      },
    ];
  }, [
    handleOpenDeleteCollectionModal,
    handleOpenRenameCollectionModal,
    isDeletingCollection,
    isRenamingCollection,
    t,
  ]);

  const favoritesCount = useMemo(() => {
    return sortedLibrary.filter((game) => game.favorite).length;
  }, [sortedLibrary]);

  const sidebarCollections = useMemo<GameCollection[]>(() => {
    return [
      {
        id: FAVORITES_COLLECTION_ID,
        name: t("favorites"),
        gamesCount: favoritesCount,
      },
      ...collections,
    ];
  }, [collections, favoritesCount, t]);

  return (
    <aside
      ref={sidebarRef}
      className={cn("sidebar", {
        "sidebar--resizing": isResizing,
        "sidebar--darwin": window.electron.platform === "darwin",
      })}
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        maxWidth: sidebarWidth,
      }}
    >
      <div className="sidebar__container">
        <SidebarProfile />

        <div className="sidebar__content">
          <section className="sidebar__section">
            <div className="sidebar__section-header">
              <button
                type="button"
                className="sidebar__section-toggle"
                onClick={() =>
                  setIsCollectionsCollapsed(!isCollectionsCollapsed)
                }
                aria-label={
                  isCollectionsCollapsed
                    ? t("expand_collections")
                    : t("collapse_collections")
                }
              >
                <ChevronRightIcon
                  size={14}
                  className={cn("sidebar__section-toggle-chevron", {
                    "sidebar__section-toggle-chevron--expanded":
                      !isCollectionsCollapsed,
                  })}
                />
                <small className="sidebar__section-title">
                  {t("collections")}
                </small>
              </button>
              <button
                type="button"
                className="sidebar__add-button"
                onClick={handleCreateCollectionButtonClick}
                aria-label={t("create_collection")}
                data-tooltip-id="create-collection-tooltip"
                data-tooltip-content={t("create_collection_tooltip")}
                data-tooltip-place="top"
              >
                <PlusIcon size={16} />
              </button>
            </div>

            {!isCollectionsCollapsed && (
              <ul className="sidebar__menu">
                {sidebarCollections.map((collection) => {
                  const isFavoritesCollection =
                    collection.id === FAVORITES_COLLECTION_ID;

                  return (
                    <li
                      key={collection.id}
                      className={cn("sidebar__menu-item", {
                        "sidebar__menu-item--active":
                          selectedCollectionId === collection.id,
                      })}
                    >
                      <button
                        type="button"
                        className="sidebar__menu-item-button"
                        onClick={() =>
                          handleSidebarCollectionClick(collection.id)
                        }
                        onContextMenu={
                          isFavoritesCollection
                            ? undefined
                            : (event) =>
                                handleOpenCollectionContextMenu(
                                  event,
                                  collection
                                )
                        }
                      >
                        {isFavoritesCollection ? (
                          <HeartIcon
                            className="sidebar__collection-icon"
                            size={16}
                          />
                        ) : (
                          <FileDirectoryIcon
                            className="sidebar__collection-icon"
                            size={16}
                          />
                        )}
                        <span className="sidebar__menu-item-button-label">
                          {collection.name}
                        </span>
                        <span className="sidebar__collection-count">
                          {collection.gamesCount}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <SidebarSuggestions
            library={library}
            isCollapsed={isSuggestionsCollapsed}
            onToggle={() => setIsSuggestionsCollapsed(!isSuggestionsCollapsed)}
            onGameClick={handleSuggestionClick}
          />

          <section className="sidebar__section">
            <div className="sidebar__section-header">
              <button
                type="button"
                className="sidebar__section-toggle"
                onClick={() => setIsGamesCollapsed(!isGamesCollapsed)}
                aria-label={
                  isGamesCollapsed ? t("expand_games") : t("collapse_games")
                }
              >
                <ChevronRightIcon
                  size={14}
                  className={cn("sidebar__section-toggle-chevron", {
                    "sidebar__section-toggle-chevron--expanded":
                      !isGamesCollapsed,
                  })}
                />
                <small className="sidebar__section-title">{t("games")}</small>
              </button>
              <div className="sidebar__section-actions">
                <SidebarFilterMenu
                  open={isFilterMenuOpen}
                  onOpenChange={setIsFilterMenuOpen}
                  librarySet={filterState.librarySet}
                  onLibrarySetChange={(next) =>
                    updateFilterState((prev) => ({ ...prev, librarySet: next }))
                  }
                  totalCount={libraryCountTotals.total}
                  installedCount={libraryCountTotals.installed}
                  notInstalledCount={libraryCountTotals.notInstalled}
                  stores={filterState.stores}
                  onStoresChange={(next) =>
                    updateFilterState((prev) => ({ ...prev, stores: next }))
                  }
                  availableStores={availableStores}
                  genres={filterState.genres}
                  onGenresChange={(next) =>
                    updateFilterState((prev) => ({ ...prev, genres: next }))
                  }
                  availableGenres={availableGenres}
                  statuses={filterState.statuses}
                  onStatusesChange={(next) =>
                    updateFilterState((prev) => ({ ...prev, statuses: next }))
                  }
                  availableStatuses={availableStatuses}
                  sortBy={filterState.sortBy}
                  onSortChange={(next) =>
                    updateFilterState((prev) => ({ ...prev, sortBy: next }))
                  }
                  onResetAll={handleResetAllFilters}
                />
                <button
                  type="button"
                  className="sidebar__add-button"
                  onClick={handleAddGameButtonClick}
                  data-tooltip-id="add-custom-game-tooltip"
                  data-tooltip-content={t("add_custom_game_tooltip")}
                  data-tooltip-place="top"
                >
                  <PlusIcon size={16} />
                </button>
              </div>
            </div>

            {!isGamesCollapsed && (
              <>
                <TextField
                  ref={filterRef}
                  placeholder={t("filter")}
                  onChange={handleFilter}
                  theme="dark"
                />

                <ul className="sidebar__menu">
                  {displayedLibrary.length === 0 ? (
                    <li className="sidebar__menu-empty">
                      {t("filter_no_results")}
                    </li>
                  ) : (
                    displayedLibrary.map((game) => (
                      <SidebarGameItem
                        key={game.id}
                        game={game}
                        handleSidebarGameClick={handleSidebarGameClick}
                        getGameTitle={getGameTitle}
                        getOwnership={getOwnership}
                      />
                    ))
                  )}
                </ul>
              </>
            )}
          </section>

          {window.electron.platform === "linux" && homebrewFolderExists && (
            <section className="sidebar__section">
              <ul className="sidebar__menu">
                <li className="sidebar__menu-item sidebar__menu-item--decky">
                  <button
                    type="button"
                    className="sidebar__menu-item-button"
                    onClick={handleInstallHydraDeckyPlugin}
                  >
                    <img
                      src={deckyIcon}
                      alt=""
                      style={{ width: 16, height: 16 }}
                    />
                    <span>
                      {deckyPluginInfo.installed && !deckyPluginInfo.outdated
                        ? t("decky_plugin_installed_version", {
                            version: deckyPluginInfo.version,
                          })
                        : deckyPluginInfo.installed && deckyPluginInfo.outdated
                          ? t("update_decky_plugin")
                          : t("install_decky_plugin")}
                    </span>
                  </button>
                </li>
              </ul>
            </section>
          )}
        </div>
      </div>

      <div className="sidebar__bottom-buttons">
        {hasActiveSubscription && (
          <button
            type="button"
            className="sidebar__help-button"
            data-open-support-chat
          >
            <div className="sidebar__help-button-icon">
              <CommentDiscussionIcon size={14} />
            </div>
            <span>{t("need_help")}</span>
          </button>
        )}
      </div>

      <button
        type="button"
        className="sidebar__handle"
        onMouseDown={handleMouseDown}
      />

      <SidebarAddingCustomGameModal
        visible={showAddGameModal}
        onClose={handleCloseAddGameModal}
      />

      <CreateCollectionModal
        visible={showCreateCollectionModal}
        onClose={() => setShowCreateCollectionModal(false)}
      />

      <ContextMenu
        items={collectionContextMenuItems}
        visible={collectionContextMenu.visible}
        position={collectionContextMenu.position}
        onClose={handleCloseCollectionContextMenu}
      />

      <Modal
        visible={showRenameCollectionModal}
        title={t("rename_collection", { ns: "library" })}
        description={t("rename_collection_description", { ns: "library" })}
        onClose={handleCloseRenameCollectionModal}
      >
        <div className="sidebar__collection-modal">
          <TextField
            label={t("collection_name")}
            placeholder={t("collection_name_placeholder")}
            value={collectionName}
            onChange={(event) => setCollectionName(event.target.value)}
            theme="dark"
            disabled={isRenamingCollection}
            maxLength={60}
          />

          <div className="sidebar__collection-modal-actions">
            <Button
              type="button"
              theme="outline"
              onClick={handleCloseRenameCollectionModal}
              disabled={isRenamingCollection}
            >
              {t("cancel")}
            </Button>

            <Button
              type="button"
              theme="primary"
              onClick={() => {
                void handleRenameCollection();
              }}
              disabled={!collectionName.trim() || isRenamingCollection}
            >
              {isRenamingCollection
                ? t("renaming_collection", { ns: "library" })
                : t("rename_collection", { ns: "library" })}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmationModal
        visible={showDeleteCollectionModal}
        title={t("delete_collection_title", { ns: "library" })}
        descriptionText={t("delete_collection_description", {
          ns: "library",
          collectionName: activeCollection?.name ?? "",
        })}
        onClose={handleCloseDeleteCollectionModal}
        onConfirm={() => {
          void handleDeleteCollection();
        }}
        cancelButtonLabel={t("cancel")}
        confirmButtonLabel={t("delete_collection", { ns: "library" })}
        buttonsIsDisabled={isDeletingCollection}
      />

      <ConfirmationModal
        visible={showDeckyConfirmModal}
        title={
          deckyPluginInfo.installed && deckyPluginInfo.outdated
            ? t("update_decky_plugin_title")
            : t("install_decky_plugin_title")
        }
        descriptionText={
          deckyPluginInfo.installed && deckyPluginInfo.outdated
            ? t("update_decky_plugin_message")
            : t("install_decky_plugin_message")
        }
        onClose={() => setShowDeckyConfirmModal(false)}
        onConfirm={handleConfirmDeckyInstallation}
        cancelButtonLabel={t("cancel")}
        confirmButtonLabel={t("confirm")}
      />

      <Tooltip id="add-custom-game-tooltip" />
      <Tooltip id="create-collection-tooltip" />
      <Tooltip id="sidebar-filter-button-tooltip" />
    </aside>
  );
}
