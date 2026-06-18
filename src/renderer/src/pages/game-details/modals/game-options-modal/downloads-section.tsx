import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@renderer/components";
import type { LibraryGame, StoreId } from "@types";

interface OwnedGameEntry {
  storeGameId: string;
  title: string;
  store: StoreId;
  coverImageUrl: string | null;
  storeUrl: string | null;
  installed: boolean;
  source: "owned" | "gamepass";
}

const STORE_LABELS: Record<
  string,
  { name: string; color: string; bg: string }
> = {
  epic: { name: "Epic Games Store", color: "#ffffff", bg: "#0078f2" },
  xbox: { name: "Xbox / Game Pass", color: "#ffffff", bg: "#107c10" },
  ubisoft: { name: "Ubisoft Connect", color: "#ffffff", bg: "#0070d1" },
  gog: { name: "GOG", color: "#ffffff", bg: "#9c4ce2" },
  ea: { name: "EA App", color: "#ffffff", bg: "#ff4747" },
  "battle-net": { name: "Battle.net", color: "#ffffff", bg: "#009ae4" },
  amazon: { name: "Amazon Games", color: "#111111", bg: "#ff9900" },
  humble: { name: "Humble Bundle", color: "#ffffff", bg: "#ef6136" },
};

interface DownloadsSettingsSectionProps {
  game: LibraryGame;
  deleting: boolean;
  isGameDownloading: boolean;
  onOpenRepacks: () => void;
  onOpenDownloadFolder: () => Promise<void>;
}

export function DownloadsSettingsSection({
  game,
  deleting,
  isGameDownloading,
  onOpenRepacks,
  onOpenDownloadFolder,
}: Readonly<DownloadsSettingsSectionProps>) {
  const { t } = useTranslation("game_details");
  const [ownedEntry, setOwnedEntry] = useState<OwnedGameEntry | null>(null);
  const [storeAction, setStoreAction] = useState<string>("");

  useEffect(() => {
    if (!game?.title) return;
    let cancelled = false;

    window.electron
      .getOwnedGame(game.title)
      .then((entry) => {
        if (!cancelled) setOwnedEntry(entry);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [game?.title]);

  const handleStoreAction = async () => {
    if (!ownedEntry?.storeUrl) return;
    setStoreAction("opening");
    try {
      await window.electron.openStoreForGame(ownedEntry.storeUrl);
    } catch {
      // Fallback: try opening via external URL
      try {
        await window.electron.openExternal(ownedEntry.storeUrl);
      } catch {
        // Silent failure
      }
    } finally {
      setStoreAction("");
    }
  };

  if (game.shop === "custom") {
    return (
      <p className="game-options-modal__category-note">
        {t("settings_not_available_for_custom_games")}
      </p>
    );
  }

  const storeLabel = ownedEntry
    ? (STORE_LABELS[ownedEntry.store] ?? null)
    : null;

  return (
    <div className="game-options-modal__downloads">
      <div className="game-options-modal__header">
        <h2>{t("downloads_section_title")}</h2>
        <h4 className="game-options-modal__header-description">
          {t("downloads_section_description")}
        </h4>
      </div>

      {ownedEntry && storeLabel && (
        <div
          className="game-options-modal__owned-store-banner"
          style={{
            background: `${storeLabel.bg}18`,
            borderColor: `${storeLabel.bg}66`,
          }}
        >
          <div className="game-options-modal__owned-store-banner-content">
            <div className="game-options-modal__owned-store-banner-text">
              <span className="game-options-modal__owned-store-banner-title">
                {t("you_own_on_store", { store: storeLabel.name })}
              </span>
              <span className="game-options-modal__owned-store-banner-subtitle">
                {ownedEntry.source === "gamepass"
                  ? t("available_through_gamepass")
                  : ownedEntry.installed
                    ? t("already_installed_click_to_launch")
                    : t("download_through_store")}
              </span>
            </div>
            <button
              type="button"
              className="game-options-modal__owned-store-banner-button"
              style={{
                background: storeLabel.bg,
                color: storeLabel.color,
              }}
              onClick={handleStoreAction}
              disabled={storeAction === "opening"}
            >
              {storeAction === "opening"
                ? t("opening_store")
                : ownedEntry.installed
                  ? t("launch_in_store")
                  : t("download_from_store")}
            </button>
          </div>
        </div>
      )}

      <div className="game-options-modal__row">
        <Button
          onClick={onOpenRepacks}
          theme="outline"
          disabled={deleting || isGameDownloading}
        >
          {t("open_download_options")}
        </Button>
        {game.download?.downloadPath && (
          <Button
            onClick={onOpenDownloadFolder}
            theme="outline"
            disabled={deleting}
          >
            {t("open_download_location")}
          </Button>
        )}
      </div>
    </div>
  );
}
