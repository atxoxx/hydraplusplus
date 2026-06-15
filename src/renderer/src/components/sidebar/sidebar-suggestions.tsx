import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryGame } from "@types";
import cn from "classnames";
import { ChevronRightIcon } from "@primer/octicons-react";

const MAX_SUGGESTIONS = 5;
const TWO_HOURS_MS = 7_200_000;
const SEVEN_DAYS_MS = 604_800_000;

export type SuggestionReason = "new" | "continue";

interface SuggestedGame {
  game: LibraryGame;
  reason: SuggestionReason;
}

interface SidebarSuggestionsProps {
  library: LibraryGame[];
  isCollapsed: boolean;
  onToggle: () => void;
  onGameClick: (game: LibraryGame) => void;
}

function getGameIcon(game: LibraryGame): string | null {
  return game.customIconUrl || game.iconUrl || game.libraryImageUrl || null;
}

function getSuggestionLabel(
  reason: SuggestionReason,
  t: (key: string) => string
): string {
  return reason === "new" ? t("suggestion_new") : t("suggestion_continue");
}

export function SidebarSuggestions({
  library,
  isCollapsed,
  onToggle,
  onGameClick,
}: Readonly<SidebarSuggestionsProps>) {
  const { t } = useTranslation("sidebar");

  const suggestions = useMemo<SuggestedGame[]>(() => {
    const now = Date.now();

    const unplayed: SuggestedGame[] = [];
    const abandoned: SuggestedGame[] = [];

    for (const game of library) {
      if (game.isDeleted) continue;

      const playTime = game.playTimeInMilliseconds ?? 0;
      const lastPlayed = game.lastTimePlayed
        ? new Date(game.lastTimePlayed).getTime()
        : null;

      if (playTime === 0) {
        unplayed.push({ game, reason: "new" });
      } else if (
        playTime < TWO_HOURS_MS &&
        lastPlayed &&
        now - lastPlayed > SEVEN_DAYS_MS
      ) {
        abandoned.push({ game, reason: "continue" });
      }
    }

    // Sort unplayed by recently added (most recent first)
    unplayed.sort((a, b) => {
      const aAdded = a.game.addedToLibraryAt
        ? new Date(a.game.addedToLibraryAt).getTime()
        : 0;
      const bAdded = b.game.addedToLibraryAt
        ? new Date(b.game.addedToLibraryAt).getTime()
        : 0;
      return bAdded - aAdded;
    });

    // Sort abandoned by most recently played
    abandoned.sort((a, b) => {
      const aPlayed = a.game.lastTimePlayed
        ? new Date(a.game.lastTimePlayed).getTime()
        : 0;
      const bPlayed = b.game.lastTimePlayed
        ? new Date(b.game.lastTimePlayed).getTime()
        : 0;
      return bPlayed - aPlayed;
    });

    // Prioritize unplayed, then fill with abandoned
    const combined: SuggestedGame[] = [];
    const seenIds = new Set<string>();

    for (const item of unplayed) {
      if (combined.length >= MAX_SUGGESTIONS) break;
      if (!seenIds.has(item.game.id)) {
        seenIds.add(item.game.id);
        combined.push(item);
      }
    }

    for (const item of abandoned) {
      if (combined.length >= MAX_SUGGESTIONS) break;
      if (!seenIds.has(item.game.id)) {
        seenIds.add(item.game.id);
        combined.push(item);
      }
    }

    return combined;
  }, [library]);

  if (suggestions.length === 0) return null;

  return (
    <section className="sidebar__section">
      <div className="sidebar__section-header">
        <button
          type="button"
          className="sidebar__section-toggle"
          onClick={onToggle}
          aria-label={isCollapsed ? t("expand_games") : t("collapse_games")}
        >
          <ChevronRightIcon
            size={14}
            className={cn("sidebar__section-toggle-chevron", {
              "sidebar__section-toggle-chevron--expanded": !isCollapsed,
            })}
          />
          <small className="sidebar__section-title">{t("play_next")}</small>
        </button>
      </div>

      {!isCollapsed && (
        <ul className="sidebar__menu">
          {suggestions.map(({ game, reason }) => {
            const iconUrl = getGameIcon(game);

            return (
              <li
                key={game.id}
                className="sidebar__menu-item sidebar__menu-item--suggestion"
              >
                <button
                  type="button"
                  className="sidebar__menu-item-button"
                  onClick={() => onGameClick(game)}
                >
                  {iconUrl ? (
                    <img
                      className="sidebar__game-icon"
                      src={iconUrl}
                      alt={game.title}
                      loading="lazy"
                    />
                  ) : (
                    <div className="sidebar__game-icon sidebar__game-icon--empty" />
                  )}

                  <div className="sidebar__menu-item-button-content">
                    <span className="sidebar__menu-item-button-label">
                      {game.title}
                    </span>
                    <span
                      className={cn("sidebar__suggestion-reason", {
                        "sidebar__suggestion-reason--new": reason === "new",
                        "sidebar__suggestion-reason--continue":
                          reason === "continue",
                      })}
                    >
                      {getSuggestionLabel(reason, t)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
