import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FileDirectoryIcon, SyncIcon } from "@primer/octicons-react";

import { Modal, TextField, Button } from "@renderer/components";
import { useLibrary, useToast } from "@renderer/hooks";
import {
  buildGameDetailsPath,
  generateRandomGradient,
} from "@renderer/helpers";
import { DiscoveryWizardModal } from "@renderer/components";
import type { PlatformGame, GameShop } from "@types";

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

export function SidebarAddingCustomGameModal({
  visible,
  onClose,
}: Readonly<SidebarAddingCustomGameModalProps>) {
  const { t } = useTranslation("sidebar");
  const { updateLibrary } = useLibrary();
  const { showSuccessToast, showErrorToast } = useToast();
  const navigate = useNavigate();

  const [gameName, setGameName] = useState("");
  const [executablePath, setExecutablePath] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [discoveredGames, setDiscoveredGames] = useState<PlatformGame[]>([]);

  const handleSelectExecutable = async () => {
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
      setExecutablePath(selectedPath);

      if (!gameName.trim()) {
        const fileName = selectedPath.split(/[\\/]/).pop() || "";
        const gameNameFromFile = fileName.replace(/\.[^/.]+$/, "");
        setGameName(gameNameFromFile);
      }
    }
  };

  const handleGameNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setGameName(event.target.value);
  };

  const handleAddGame = async () => {
    if (!gameName.trim() || !executablePath.trim()) {
      showErrorToast(t("custom_game_modal_fill_required"));
      return;
    }

    setIsAdding(true);

    try {
      const iconUrl = "";
      const logoImageUrl = "";
      const libraryHeroImageUrl = generateRandomGradient();

      const newGame = await window.electron.addCustomGameToLibrary(
        gameName.trim(),
        executablePath,
        iconUrl,
        logoImageUrl,
        libraryHeroImageUrl
      );

      showSuccessToast(t("custom_game_modal_success"));
      updateLibrary();

      const gameDetailsPath = buildGameDetailsPath({
        shop: "custom",
        objectId: newGame.objectId,
        title: newGame.title,
      });

      navigate(gameDetailsPath);

      setGameName("");
      setExecutablePath("");
      onClose();
    } catch (error) {
      console.error("Failed to add custom game:", error);
      showErrorToast(
        error instanceof Error ? error.message : t("custom_game_modal_failed")
      );
    } finally {
      setIsAdding(false);
    }
  };

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
    } catch (err) {
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

  const handleClose = () => {
    if (!isAdding && !isScanning) {
      setGameName("");
      setExecutablePath("");
      onClose();
    }
  };

  const isFormValid = gameName.trim() && executablePath.trim();

  return (
    <>
      <Modal
        visible={visible}
        title={t("custom_game_modal")}
        description={t("custom_game_modal_description")}
        onClose={handleClose}
      >
        <div className="sidebar-adding-custom-game-modal__container">
          <div className="sidebar-adding-custom-game-modal__form">
            <TextField
              label={t("custom_game_modal_executable_path")}
              placeholder={t("custom_game_modal_select_executable")}
              value={executablePath}
              readOnly
              theme="dark"
              rightContent={
                <Button
                  type="button"
                  theme="outline"
                  onClick={handleSelectExecutable}
                  disabled={isAdding}
                >
                  <FileDirectoryIcon />
                  {t("custom_game_modal_browse")}
                </Button>
              }
            />

            <TextField
              label={t("custom_game_modal_title")}
              placeholder={t("custom_game_modal_enter_title")}
              value={gameName}
              onChange={handleGameNameChange}
              theme="dark"
              disabled={isAdding}
            />
          </div>

          <div className="sidebar-adding-custom-game-modal__actions">
            <Button
              type="button"
              theme="outline"
              onClick={handleClose}
              disabled={isAdding}
            >
              {t("custom_game_modal_cancel")}
            </Button>
            <Button
              type="button"
              theme="primary"
              onClick={handleAddGame}
              disabled={!isFormValid || isAdding}
            >
              {isAdding
                ? t("custom_game_modal_adding")
                : t("custom_game_modal_add")}
            </Button>
          </div>

          {/* Divider */}
          <div className="sidebar-adding-custom-game-modal__divider">
            <span>{t("or_import", { ns: "sidebar" })}</span>
          </div>

          {/* Import from platforms */}
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
