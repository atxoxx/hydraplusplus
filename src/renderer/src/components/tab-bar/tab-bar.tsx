import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Tooltip } from "react-tooltip";
import {
  AppsIcon,
  BookIcon,
  ClockIcon,
  DownloadIcon,
  GearIcon,
  ListUnorderedIcon,
  PeopleIcon,
  VideoIcon,
} from "@primer/octicons-react";
import cn from "classnames";

import {
  useDownload,
  useLibrary,
  useUserDetails,
} from "@renderer/hooks";
import type { ProfileFriends } from "@types";

import { DownloadsDropdown } from "../downloads-dropdown/downloads-dropdown";

import "./tab-bar.scss";

interface Tab {
  labelKey: string;
  path: string;
  render: () => React.ReactNode;
}

const TABS: Tab[] = [
  {
    labelKey: "store",
    path: "/store",
    render: () => <AppsIcon size={16} />,
  },
  {
    labelKey: "library",
    path: "/library",
    render: () => <BookIcon size={16} />,
  },
  {
    labelKey: "watchlist",
    path: "/watchlist",
    render: () => <ListUnorderedIcon size={16} />,
  },
  {
    labelKey: "activity",
    path: "/activity",
    render: () => <ClockIcon size={16} />,
  },
];

export function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("sidebar");

  const { userDetails } = useUserDetails();
  const { lastPacket } = useDownload();
  const { library } = useLibrary();

  const [onlineFriendsCount, setOnlineFriendsCount] = useState(0);
  const [showDownloadsDropdown, setShowDownloadsDropdown] = useState(false);
  const downloadsButtonRef = useRef<HTMLButtonElement>(null);

  const hasActiveDownload = useMemo(
    () =>
      library.some((game) => game.download?.status === "active") ||
      lastPacket != null,
    [library, lastPacket]
  );

  const pendingDownloadCount = useMemo(
    () =>
      library.filter(
        (game) =>
          game.download &&
          (game.download.status === "active" ||
            (game.download.queued &&
              game.download.status !== "removed" &&
              game.download.status !== "complete" &&
              game.download.status !== "seeding"))
      ).length,
    [library]
  );

  const updateOnlineFriendsCount = useCallback(async () => {
    if (!userDetails) {
      setOnlineFriendsCount(0);
      return;
    }

    try {
      const electron = globalThis.electron as Electron;
      const response = await electron.hydraApi.get<ProfileFriends>(
        "/profile/friends",
        { params: { take: 5, skip: 0 } }
      );
      setOnlineFriendsCount(response.onlineFriends);
    } catch {
      // ignore transient errors
    }
  }, [userDetails]);

  useEffect(() => {
    updateOnlineFriendsCount();

    const electron = globalThis.electron as Electron;
    const unsubscribeFriends = electron.onFriendsUpdated(() => {
      updateOnlineFriendsCount();
    });

    let interval: ReturnType<typeof setInterval> | null = null;
    const unsubscribePresence =
      typeof electron.onFriendPresence === "function"
        ? electron.onFriendPresence(() => {
            updateOnlineFriendsCount();
          })
        : () => {
            if (interval) clearInterval(interval);
          };

    if (typeof electron.onFriendPresence !== "function") {
      interval = setInterval(updateOnlineFriendsCount, 30_000);
    }

    return () => {
      unsubscribeFriends();
      unsubscribePresence();
    };
  }, [updateOnlineFriendsCount]);

  const handleTabClick = (path: string) => {
    if (path !== location.pathname) {
      navigate(path);
    }
  };

  const handleOpenBigPictureWindow = () => {
    globalThis.window.electron.openBigPictureWindow();
  };

  const handleOpenFriendsWindow = () => {
    globalThis.window.electron.openFriendsWindow();
  };

  const handleDownloadsClick = () => {
    setShowDownloadsDropdown((prev) => !prev);
  };

  const handleCloseDownloadsDropdown = () => {
    setShowDownloadsDropdown(false);
  };

  const activePath =
    location.pathname === "/" || location.pathname === "/catalogue"
      ? "/store"
      : "/" + location.pathname.split("/")[1];

  return (
    <div className="tab-bar">
      <nav className="tab-bar__tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.path}
            type="button"
            role="tab"
            className={cn("tab-bar__tab", {
              "tab-bar__tab--active": tab.path === activePath,
            })}
            onClick={() => handleTabClick(tab.path)}
            aria-selected={tab.path === activePath}
          >
            {tab.render()}
            <span>{t(tab.labelKey, { defaultValue: tab.labelKey })}</span>
          </button>
        ))}
      </nav>

      <div className="tab-bar__actions">
        <button
          ref={downloadsButtonRef}
          type="button"
          className={cn("tab-bar__action-button", {
            "tab-bar__action-button--active": hasActiveDownload,
          })}
          onClick={handleDownloadsClick}
          data-tooltip-id="downloads-tooltip"
          data-tooltip-content={t("downloads")}
          data-tooltip-place="bottom"
          aria-label={t("downloads")}
        >
          <DownloadIcon size={16} />
          {hasActiveDownload && (
            <span
              className={cn("tab-bar__badge", "tab-bar__badge--pulse", {
              "tab-bar__badge--count": pendingDownloadCount > 1,
            })}
          >
            {pendingDownloadCount > 1 ? pendingDownloadCount : ""}
            </span>
          )}
        </button>

        <button
          type="button"
          className="tab-bar__action-button"
          onClick={() => navigate("/settings")}
          data-tooltip-id="settings-tooltip"
          data-tooltip-content={t("settings")}
          data-tooltip-place="bottom"
          aria-label={t("settings")}
        >
          <GearIcon size={16} />
        </button>

        {userDetails && (
          <button
            type="button"
            className="tab-bar__action-button"
            onClick={handleOpenFriendsWindow}
            data-tooltip-id="friends-tooltip"
            data-tooltip-content={t("friends")}
            data-tooltip-place="bottom"
            aria-label={t("friends")}
          >
            <PeopleIcon size={16} />
            {onlineFriendsCount > 0 && (
              <span className="tab-bar__badge tab-bar__badge--online">
                {onlineFriendsCount}
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          className="tab-bar__action-button"
          onClick={handleOpenBigPictureWindow}
          data-tooltip-id="big-picture-tooltip"
          data-tooltip-content={t("big_picture")}
          data-tooltip-place="bottom"
          aria-label={t("big_picture")}
        >
          <VideoIcon size={16} />
        </button>
      </div>

      {showDownloadsDropdown && (
        <DownloadsDropdown
          onClose={handleCloseDownloadsDropdown}
          anchorRef={downloadsButtonRef}
        />
      )}

      <Tooltip id="downloads-tooltip" style={{ zIndex: 6 }} />
      <Tooltip id="settings-tooltip" style={{ zIndex: 6 }} />
      <Tooltip id="friends-tooltip" style={{ zIndex: 6 }} />
      <Tooltip id="big-picture-tooltip" style={{ zIndex: 6 }} />
    </div>
  );
}
