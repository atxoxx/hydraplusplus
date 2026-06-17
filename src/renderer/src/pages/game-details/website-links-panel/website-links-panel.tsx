import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "@primer/octicons-react";

import { gameDetailsContext } from "@renderer/context";
import {
  buildSteamSubLinks,
  buildWebsiteLinks,
  DEFAULT_WEBSITE_ORDER,
  type WebsiteId,
} from "@renderer/services/website-links.service";
import { WebsiteLinksTabBar } from "./website-links-tab-bar";
import { WebsiteLinksIframe } from "./website-links-iframe";
import "./website-links-panel.scss";

const STORAGE_KEY_ENABLED = "hydra_website_links_enabled";
const STORAGE_KEY_ORDER = "hydra_website_links_order";
const STORAGE_KEY_LAST_TAB = "hydra_website_links_last_tab";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

export function WebsiteLinksPanel() {
  const { t } = useTranslation("game_details");
  const { objectId, shop, gameTitle, effectiveShop, effectiveObjectId } =
    useContext(gameDetailsContext);

  const steamAppId = useMemo<string | null>(() => {
    return effectiveShop === "steam" && effectiveObjectId
      ? effectiveObjectId
      : null;
  }, [effectiveShop, effectiveObjectId]);

  // Steam community sub-tabs (Store Page, Discussions, etc.)
  const steamSubLinks = useMemo(() => {
    if (!steamAppId) return [];
    return buildSteamSubLinks(steamAppId);
  }, [steamAppId]);

  const [isOpen, setIsOpen] = useState(true);

  const [_enabledSites, _setEnabledSites] = useState<WebsiteId[]>(() =>
    loadJson<WebsiteId[]>(STORAGE_KEY_ENABLED, DEFAULT_WEBSITE_ORDER)
  );

  const [_siteOrder, _setSiteOrder] = useState<WebsiteId[]>(() =>
    loadJson<WebsiteId[]>(STORAGE_KEY_ORDER, DEFAULT_WEBSITE_ORDER)
  );

  const [lastTabs, setLastTabs] = useState<Record<string, WebsiteId>>(() =>
    loadJson<Record<string, WebsiteId>>(STORAGE_KEY_LAST_TAB, {})
  );

  const gameKey = useMemo(
    () => (objectId ? `${shop}:${objectId}` : ""),
    [shop, objectId]
  );

  const links = useMemo(() => {
    if (!objectId || !gameTitle) return [];
    return buildWebsiteLinks({
      objectId,
      shop,
      gameTitle,
    });
  }, [objectId, shop, gameTitle]);

  const orderedLinks = useMemo(() => {
    const linkMap = new Map(links.map((l) => [l.id, l]));
    return _siteOrder
      .filter((id) => _enabledSites.includes(id) && linkMap.has(id))
      .map((id) => linkMap.get(id)!);
  }, [links, _siteOrder, _enabledSites]);

  const [activeTabId, setActiveTabId] = useState<WebsiteId | null>(null);
  const [activeSubTabId, setActiveSubTabId] = useState<WebsiteId | null>(null);

  // When the active main tab changes, manage sub-tab state
  useEffect(() => {
    if (activeTabId === "steam" && steamSubLinks.length > 0) {
      // Steam tab selected with available sub-tabs: default to first (Store Page)
      setActiveSubTabId((prev) => {
        if (prev && steamSubLinks.some((l) => l.id === prev)) {
          return prev; // Keep existing sub-tab if still valid
        }
        return steamSubLinks[0].id;
      });
    } else if (activeSubTabId !== null) {
      // Non-Steam tab selected: clear sub-tab
      setActiveSubTabId(null);
    }
  }, [activeTabId, steamSubLinks]);

  // Determine which link to show in the iframe
  const activeLink = useMemo(() => {
    if (activeTabId === "steam" && activeSubTabId) {
      // Show the active sub-tab's content
      return steamSubLinks.find((l) => l.id === activeSubTabId) ?? null;
    }
    // Show the main tab's content
    return orderedLinks.find((l) => l.id === activeTabId) ?? null;
  }, [orderedLinks, activeTabId, steamSubLinks, activeSubTabId]);

  useEffect(() => {
    if (orderedLinks.length === 0) {
      setActiveTabId(null);
      return;
    }

    const lastTab = gameKey ? lastTabs[gameKey] : undefined;
    const validLastTab =
      lastTab && orderedLinks.some((l) => l.id === lastTab)
        ? lastTab
        : undefined;

    setActiveTabId(validLastTab ?? orderedLinks[0].id);
  }, [orderedLinks, gameKey]);

  const handleTabChange = useCallback(
    (tabId: WebsiteId) => {
      setActiveTabId(tabId);
      if (gameKey) {
        const next = { ...lastTabs, [gameKey]: tabId };
        setLastTabs(next);
        saveJson(STORAGE_KEY_LAST_TAB, next);
      }
    },
    [gameKey, lastTabs]
  );

  const handleSubTabChange = useCallback((tabId: WebsiteId) => {
    setActiveSubTabId(tabId);
  }, []);

  if (!objectId || !gameTitle || orderedLinks.length === 0) {
    return null;
  }

  return (
    <div className="website-links-panel">
      <button
        type="button"
        className="website-links-panel__header"
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronDownIcon
          className={`website-links-panel__chevron ${isOpen ? "website-links-panel__chevron--open" : ""}`}
        />
        <span>{t("websites")}</span>
      </button>

      <div
        className={`website-links-panel__body ${isOpen ? "website-links-panel__body--open" : ""}`}
      >
        <WebsiteLinksTabBar
          links={orderedLinks}
          activeTabId={activeTabId}
          onTabChange={handleTabChange}
        />

        {/* Steam sub-tab bar — visible only when Steam tab is active and sub-tabs exist */}
        {activeTabId === "steam" && steamSubLinks.length > 0 && (
          <div className="website-links-panel__sub-tabs">
            <WebsiteLinksTabBar
              links={steamSubLinks}
              activeTabId={activeSubTabId}
              onTabChange={handleSubTabChange}
            />
          </div>
        )}

        {activeLink && (
          <WebsiteLinksIframe key={activeLink.id} link={activeLink} />
        )}
      </div>
    </div>
  );
}
