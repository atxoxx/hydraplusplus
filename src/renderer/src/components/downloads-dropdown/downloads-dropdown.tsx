import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRightIcon } from "@primer/octicons-react";

import { useDownload, useLibrary } from "@renderer/hooks";

import "./downloads-dropdown.scss";

interface DownloadsDropdownProps {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

export function DownloadsDropdown({
  onClose,
  anchorRef,
}: Readonly<DownloadsDropdownProps>) {
  const { t } = useTranslation("downloads");
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { lastPacket, progress, downloadSpeed, eta } = useDownload();
  const { library } = useLibrary();

  const downloadingGames = library.filter(
    (game) => game.download?.status === "active"
  );

  const queuedGames = library.filter(
    (game) =>
      game.download?.queued &&
      game.download.status !== "removed" &&
      game.download.status !== "complete" &&
      game.download.status !== "seeding" &&
      game.download.status !== "active"
  );

  const completedGames = library.filter(
    (game) =>
      game.download?.status === "complete" ||
      (game.download?.status === "seeding" && game.download?.progress === 1)
  );

  const activeGame = lastPacket
    ? library.find((game) => game.id === lastPacket.gameId)
    : downloadingGames.length > 0
      ? downloadingGames[0]
      : null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, anchorRef]);

  const handleViewAll = () => {
    onClose();
    navigate("/downloads");
  };

  const hasAnyDownloads =
    downloadingGames.length > 0 ||
    queuedGames.length > 0 ||
    completedGames.length > 0;

  return (
    <div ref={dropdownRef} className="downloads-dropdown">
      {!hasAnyDownloads ? (
        <div className="downloads-dropdown__empty">
          <span className="downloads-dropdown__empty-text">
            {t("no_downloads_title")}
          </span>
        </div>
      ) : (
        <>
          {activeGame && (
            <div className="downloads-dropdown__section">
              <span className="downloads-dropdown__section-title">
                {t("download_in_progress")}
              </span>
              <div className="downloads-dropdown__game">
                <span className="downloads-dropdown__game-title">
                  {activeGame.title}
                </span>
                <span className="downloads-dropdown__game-meta">
                  {progress}
                </span>
              </div>
              {eta && downloadSpeed && (
                <div className="downloads-dropdown__eta">
                  <span>
                    {eta} • {downloadSpeed}
                  </span>
                </div>
              )}
            </div>
          )}

          {queuedGames.length > 0 && (
            <div className="downloads-dropdown__section">
              <span className="downloads-dropdown__section-title">
                {t("queued_downloads")} ({queuedGames.length})
              </span>
            </div>
          )}

          {completedGames.length > 0 && (
            <div className="downloads-dropdown__section">
              <span className="downloads-dropdown__section-title">
                {t("downloads_completed")} ({completedGames.length})
              </span>
            </div>
          )}

          <button
            type="button"
            className="downloads-dropdown__view-all"
            onClick={handleViewAll}
          >
            <span>{t("options")}</span>
            <ArrowRightIcon size={14} />
          </button>
        </>
      )}
    </div>
  );
}
