import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Modal, Button } from "@renderer/components";
import type { PlatformGame, GameShop } from "@types";
import "./discovery-wizard-modal.scss";

/** Platform brand colors matching the spec in platform-import-spec.md */
const PLATFORM_COLORS: Record<string, string> = {
  steam: "#1b2838",
  epic: "#313131",
  gog: "#8a3ab9",
  "battle-net": "#009ae4",
  amazon: "#ff9900",
  ubisoft: "#3d1d6a",
  xbox: "#107c10",
  rockstar: "#f7b500",
  "itch-io": "#fa5c5c",
  humble: "#cb277e",
};

const PLATFORM_LABELS: Record<string, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG Galaxy",
  "battle-net": "Battle.net",
  amazon: "Amazon Games",
  ubisoft: "Ubisoft Connect",
  xbox: "Xbox / Game Pass",
  rockstar: "Rockstar Games",
  "itch-io": "itch.io",
  humble: "Humble Bundle",
};

interface DiscoveryGame extends PlatformGame {
  /** Unique key for checkbox identity */
  _key: string;
}

interface DiscoveryWizardModalProps {
  visible: boolean;
  /** Games discovered grouped by platform shop value */
  games: PlatformGame[];
  onClose: () => void;
  onImport: (games: PlatformGame[], autoImportFuture: boolean) => Promise<void>;
}

export function DiscoveryWizardModal({
  visible,
  games,
  onClose,
  onImport,
}: Readonly<DiscoveryWizardModalProps>) {
  const { t } = useTranslation("settings");

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [autoImportFuture, setAutoImportFuture] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Build indexed game items when games change
  const indexedGames = useMemo<DiscoveryGame[]>(
    () =>
      games.map((g) => ({
        ...g,
        _key: `${g.shop}:${g.objectId}`,
      })),
    [games]
  );

  // Reset selections when modal opens with new games
  useEffect(() => {
    if (visible && indexedGames.length > 0) {
      setSelectedKeys(new Set(indexedGames.map((g) => g._key)));
      setAutoImportFuture(false);
      setIsImporting(false);
    }
  }, [visible, indexedGames]);

  // Group games by platform
  const groupedGames = useMemo(() => {
    const map = new Map<GameShop, DiscoveryGame[]>();
    for (const game of indexedGames) {
      const list = map.get(game.shop) ?? [];
      list.push(game);
      map.set(game.shop, list);
    }
    // Sort groups by platform order
    const platformOrder: GameShop[] = [
      "steam",
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
    return platformOrder
      .filter((shop) => map.has(shop))
      .map((shop) => ({ shop, games: map.get(shop)! }));
  }, [indexedGames]);

  const totalCount = indexedGames.length;
  const selectedCount = selectedKeys.size;

  const toggleGame = useCallback((_key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(_key)) next.delete(_key);
      else next.add(_key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedKeys.size === indexedGames.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(indexedGames.map((g) => g._key)));
    }
  }, [indexedGames, selectedKeys]);

  const toggleGroup = useCallback(
    (shop: GameShop) => {
      const groupKeys = indexedGames
        .filter((g) => g.shop === shop)
        .map((g) => g._key);
      const allSelected = groupKeys.every((k) => selectedKeys.has(k));

      setSelectedKeys((prev) => {
        const next = new Set(prev);
        for (const k of groupKeys) {
          if (allSelected) next.delete(k);
          else next.add(k);
        }
        return next;
      });
    },
    [indexedGames, selectedKeys]
  );

  const handleImport = useCallback(async () => {
    const selectedGames = indexedGames.filter((g) => selectedKeys.has(g._key));
    if (selectedGames.length === 0) return;

    setIsImporting(true);
    try {
      await onImport(selectedGames, autoImportFuture);
    } finally {
      setIsImporting(false);
      onClose();
    }
  }, [indexedGames, selectedKeys, autoImportFuture, onImport, onClose]);

  const renderPlatformGroup = (group: {
    shop: GameShop;
    games: DiscoveryGame[];
  }) => {
    const groupKeys = group.games.map((g) => g._key);
    const allSelected = groupKeys.every((k) => selectedKeys.has(k));
    const partialSelected =
      !allSelected && groupKeys.some((k) => selectedKeys.has(k));
    const color = PLATFORM_COLORS[group.shop] ?? "#555";

    return (
      <div key={group.shop} className="discovery-wizard__group">
        <div className="discovery-wizard__group-header">
          <div
            className="discovery-wizard__platform-dot"
            style={{ backgroundColor: color }}
          />
          <span className="discovery-wizard__group-title">
            {PLATFORM_LABELS[group.shop] ?? group.shop}
          </span>
          <span className="discovery-wizard__group-count">
            {group.games.length}
          </span>
          <button
            type="button"
            className={`discovery-wizard__toggle-group ${
              allSelected ? "discovery-wizard__toggle-group--active" : ""
            } ${partialSelected ? "discovery-wizard__toggle-group--partial" : ""}`}
            onClick={() => toggleGroup(group.shop)}
            aria-label={
              allSelected
                ? t("discovery_deselect_all")
                : t("discovery_select_all")
            }
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              {allSelected ? (
                <rect
                  x="0.5"
                  y="0.5"
                  width="13"
                  height="13"
                  rx="2.5"
                  fill="var(--accent, #4a9eff)"
                  stroke="var(--accent, #4a9eff)"
                />
              ) : partialSelected ? (
                <rect
                  x="0.5"
                  y="0.5"
                  width="13"
                  height="13"
                  rx="2.5"
                  fill="none"
                  stroke="var(--accent, #4a9eff)"
                />
              ) : (
                <rect
                  x="0.5"
                  y="0.5"
                  width="13"
                  height="13"
                  rx="2.5"
                  fill="none"
                  stroke="var(--border-default, #444)"
                />
              )}
              {allSelected && (
                <path
                  d="M3.5 7L6 9.5L10.5 4.5"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </button>
        </div>

        <div className="discovery-wizard__game-list">
          {group.games.map((game) => (
            <label
              key={game._key}
              className={`discovery-wizard__game-item ${
                selectedKeys.has(game._key)
                  ? "discovery-wizard__game-item--selected"
                  : ""
              }`}
            >
              <input
                type="checkbox"
                className="discovery-wizard__checkbox"
                checked={selectedKeys.has(game._key)}
                onChange={() => toggleGame(game._key)}
              />
              <span className="discovery-wizard__checkbox-custom" />
              <span className="discovery-wizard__game-title">{game.title}</span>
              {game.executablePath && (
                <span className="discovery-wizard__game-path">
                  {game.executablePath}
                </span>
              )}
            </label>
          ))}
        </div>
      </div>
    );
  };

  const modalTitle = (
    <div className="discovery-wizard__title-bar">
      <span>{t("discovery_modal_title")}</span>
      <span className="discovery-wizard__title-count">{totalCount}</span>
    </div>
  );

  return (
    <Modal
      visible={visible}
      title={modalTitle}
      description={t("discovery_modal_description", { count: totalCount })}
      onClose={onClose}
      large
    >
      <div className="discovery-wizard">
        {/* Select / deselect all */}
        <div className="discovery-wizard__top-actions">
          <button
            type="button"
            className="discovery-wizard__select-all-btn"
            onClick={toggleAll}
          >
            {selectedKeys.size === indexedGames.length
              ? t("discovery_deselect_all")
              : t("discovery_select_all")}
          </button>
          <span className="discovery-wizard__selected-count">
            {t("selected_count", {
              count: selectedCount,
              total: totalCount,
              ns: "settings",
            })}
          </span>
        </div>

        {/* Scrollable game list grouped by platform */}
        <div className="discovery-wizard__groups">
          {groupedGames.map((group) => renderPlatformGroup(group))}
        </div>

        {/* Bottom actions */}
        <div className="discovery-wizard__bottom">
          <label className="discovery-wizard__auto-import-label">
            <input
              type="checkbox"
              className="discovery-wizard__auto-import-checkbox"
              checked={autoImportFuture}
              onChange={() => setAutoImportFuture(!autoImportFuture)}
            />
            <span className="discovery-wizard__auto-import-checkbox-custom" />
            <span>{t("discovery_auto_import_label")}</span>
          </label>

          <div className="discovery-wizard__bottom-actions">
            <Button theme="outline" onClick={onClose} disabled={isImporting}>
              {t("discovery_skip")}
            </Button>
            <Button
              theme="primary"
              onClick={handleImport}
              disabled={selectedCount === 0 || isImporting}
            >
              {isImporting
                ? t("importing", { ns: "settings" })
                : t("discovery_import_selected", {
                    count: selectedCount,
                  })}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
