import SteamLogo from "@renderer/assets/steam-logo.svg?react";
import PlayLogo from "@renderer/assets/play-logo.svg?react";
import { LibraryGame } from "@types";
import cn from "classnames";
import { useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { GameContextMenu } from "..";
import { useAppSelector } from "@renderer/hooks";
import { formatPlayTimeShort } from "@shared";
import { isGameCompleted } from "@renderer/helpers";
import { ClockIcon, PeopleIcon, TrophyIcon } from "@primer/octicons-react";
import { Tooltip } from "react-tooltip";
import { Avatar } from "../avatar/avatar";
import type { FriendOwnershipEntry } from "@renderer/features/friend-game-ownership-slice";
import { SidebarFriendsModal } from "./sidebar-friends-modal";

const MAX_TOOLTIP_FRIENDS = 5;

interface SidebarGameItemProps {
  game: LibraryGame;
  handleSidebarGameClick: (event: React.MouseEvent, game: LibraryGame) => void;
  getGameTitle: (game: LibraryGame) => string;
  getOwnership?: (
    shop: string,
    objectId: string
  ) => FriendOwnershipEntry | null;
}

export function SidebarGameItem({
  game,
  handleSidebarGameClick,
  getGameTitle,
  getOwnership,
}: Readonly<SidebarGameItemProps>) {
  const location = useLocation();
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    position: { x: number; y: number };
  }>({ visible: false, position: { x: 0, y: 0 } });

  const [showFriendsModal, setShowFriendsModal] = useState(false);

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    setContextMenu({
      visible: true,
      position: { x: event.clientX, y: event.clientY },
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({ visible: false, position: { x: 0, y: 0 } });
  };

  const handleFriendsBadgeClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setShowFriendsModal(true);
  };

  const handleCloseFriendsModal = () => {
    setShowFriendsModal(false);
  };

  const isCustomGame = game.shop === "custom";
  const sidebarIcon = isCustomGame
    ? game.libraryImageUrl || game.iconUrl
    : game.customIconUrl || game.iconUrl;

  const isCompleted = useMemo(
    () => isGameCompleted(game.achievementCount, game.unlockedAchievementCount),
    [game.achievementCount, game.unlockedAchievementCount]
  );

  const hasAchievements = (game.achievementCount ?? 0) > 0;

  const showPlaytimeBadge = userPreferences?.sidebarShowPlaytimeBadge ?? true;
  const showAchievementsBadge =
    userPreferences?.sidebarShowAchievementsBadge ?? true;

  const friendOwnership = getOwnership
    ? getOwnership(game.shop, game.objectId)
    : null;

  const showFriendsBadge =
    (userPreferences?.sidebarShowFriendsBadge ?? true) &&
    friendOwnership !== null;

  const showDownloadOptionsBadge =
    userPreferences?.enableNewDownloadOptionsBadges !== false &&
    (game.newDownloadOptionsCount ?? 0) > 0;

  const hasAnyBadgeVisible =
    showPlaytimeBadge ||
    showAchievementsBadge ||
    showFriendsBadge ||
    showDownloadOptionsBadge;

  const friendsTooltipId = `sidebar-friends-tooltip-${game.id}`;

  const friendsTooltipContent = useMemo(() => {
    if (!friendOwnership || friendOwnership.totalCount === 0) return null;

    const visibleFriends = friendOwnership.friends.slice(
      0,
      MAX_TOOLTIP_FRIENDS
    );
    const overflowCount = friendOwnership.totalCount - MAX_TOOLTIP_FRIENDS;

    return (
      <Tooltip
        id={friendsTooltipId}
        className="sidebar__friends-tooltip"
        place="right"
        delayShow={300}
      >
        <div className="sidebar__friends-tooltip-content">
          {visibleFriends.map((friend) => (
            <div key={friend.id} className="sidebar__friends-tooltip-row">
              <Avatar
                size={24}
                src={friend.profileImageUrl}
                alt={friend.displayName}
              />
              <span className="sidebar__friends-tooltip-name">
                {friend.displayName}
              </span>
              <span
                className={cn("sidebar__friends-tooltip-status", {
                  "sidebar__friends-tooltip-status--online": friend.isOnline,
                })}
              />
            </div>
          ))}
          {overflowCount > 0 && (
            <div className="sidebar__friends-tooltip-overflow">
              +{overflowCount} more
            </div>
          )}
        </div>
      </Tooltip>
    );
  }, [friendOwnership, friendsTooltipId]);

  // Determine fallback icon based on game type
  const getFallbackIcon = () => {
    if (isCustomGame) {
      return <PlayLogo className="sidebar__game-icon" />;
    }
    return <SteamLogo className="sidebar__game-icon" />;
  };

  return (
    <>
      <li
        key={game.id}
        className={cn("sidebar__menu-item", {
          "sidebar__menu-item--active":
            location.pathname === `/game/${game.shop}/${game.objectId}`,
          "sidebar__menu-item--muted": game.download?.status === "removed",
        })}
      >
        <button
          type="button"
          className="sidebar__menu-item-button"
          onClick={(event) => handleSidebarGameClick(event, game)}
          onContextMenu={handleContextMenu}
        >
          {sidebarIcon ? (
            <img
              className="sidebar__game-icon"
              src={sidebarIcon}
              alt={game.title}
              loading="lazy"
            />
          ) : (
            getFallbackIcon()
          )}

          <div className="sidebar__menu-item-button-content">
            <span className="sidebar__menu-item-button-label">
              {getGameTitle(game)}
            </span>

            {hasAnyBadgeVisible && (
              <div className="sidebar__game-badges-row">
                {showPlaytimeBadge && (
                  <span className="sidebar__game-badge-item">
                    <ClockIcon size={11} />
                    <span>
                      {formatPlayTimeShort(game.playTimeInMilliseconds) || "0h"}
                    </span>
                  </span>
                )}

                {showAchievementsBadge && (
                  <span
                    className={cn("sidebar__game-badge-item", {
                      "sidebar__game-badge-item--completed": isCompleted,
                    })}
                  >
                    <TrophyIcon size={11} />
                    <span>
                      {hasAchievements
                        ? `${game.unlockedAchievementCount ?? 0}/${game.achievementCount ?? 0}`
                        : "0/0"}
                    </span>
                  </span>
                )}

                {showFriendsBadge && (
                  <span
                    className={cn(
                      "sidebar__game-badge-item",
                      "sidebar__game-badge-item--clickable",
                      {
                        "sidebar__game-badge-item--friends-online":
                          (friendOwnership?.onlineCount ?? 0) > 0,
                      }
                    )}
                    data-tooltip-id={friendsTooltipId}
                    onClick={handleFriendsBadgeClick}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        handleFriendsBadgeClick(
                          event as unknown as React.MouseEvent
                        );
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={
                      friendOwnership
                        ? `${friendOwnership.totalCount} ${friendOwnership.totalCount === 1 ? "friend" : "friends"}`
                        : undefined
                    }
                  >
                    <PeopleIcon size={11} />
                    <span>
                      {friendOwnership
                        ? `${friendOwnership.onlineCount}/${friendOwnership.totalCount}`
                        : "0"}
                    </span>
                  </span>
                )}

                {showDownloadOptionsBadge && (
                  <span className="sidebar__game-badge">
                    +{game.newDownloadOptionsCount}
                  </span>
                )}
              </div>
            )}
          </div>
        </button>
      </li>

      <GameContextMenu
        game={game}
        visible={contextMenu.visible}
        position={contextMenu.position}
        onClose={handleCloseContextMenu}
      />

      {friendsTooltipContent}

      <SidebarFriendsModal
        visible={showFriendsModal}
        gameTitle={game.title}
        ownership={friendOwnership}
        onClose={handleCloseFriendsModal}
      />
    </>
  );
}
