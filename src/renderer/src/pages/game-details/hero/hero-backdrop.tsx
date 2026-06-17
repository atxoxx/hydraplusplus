import { useContext } from "react";
import { gameDetailsContext } from "@renderer/context";
import { platformToSystem, SYSTEM_TO_BINARY } from "@renderer/helpers";
import { EMULATOR_ICONS } from "@renderer/pages/settings/emulation/emulator-icons";

const getImageWithCustomPriority = (
  customUrl: string | null | undefined,
  originalUrl: string | null | undefined,
  fallbackUrl?: string | null | undefined
) => {
  return customUrl || originalUrl || fallbackUrl || "";
};

export function HeroBackdrop() {
  const { game, shopDetails, shop } = useContext(gameDetailsContext);

  const isCustomGame = game?.shop === "custom" && !game?.linkedShop;
  const isLaunchboxGame = shop === "launchbox";

  const resolvedHeroImage = isCustomGame
    ? game?.libraryHeroImageUrl || game?.iconUrl || ""
    : getImageWithCustomPriority(
        game?.customHeroImageUrl,
        shopDetails?.assets?.libraryHeroImageUrl
      );

  const launchboxCover = isLaunchboxGame
    ? game?.customIconUrl ||
      shopDetails?.assets?.libraryImageUrl ||
      game?.libraryImageUrl ||
      shopDetails?.assets?.iconUrl ||
      game?.iconUrl ||
      ""
    : "";

  const launchboxPlatform = isLaunchboxGame
    ? (game?.platform ?? shopDetails?.platform ?? null)
    : null;

  const launchboxSystem = isLaunchboxGame
    ? platformToSystem(launchboxPlatform)
    : null;

  const launchboxEmulatorIcon = launchboxSystem
    ? EMULATOR_ICONS[SYSTEM_TO_BINARY[launchboxSystem]]
    : undefined;

  if (isLaunchboxGame) {
    return (
      <>
        <div className="game-details__hero--classics">
          <div className="game-details__hero-classics-backdrop">
            {launchboxCover && (
              <img src={launchboxCover} alt="" aria-hidden="true" />
            )}
            <div className="game-details__hero-classics-backdrop-overlay" />
          </div>
        </div>
        <div className="game-details__hero-classics-content">
          <div className="game-details__hero-classics-cover">
            {launchboxCover && <img src={launchboxCover} alt={game?.title} />}
          </div>
          <div className="game-details__hero-classics-meta">
            <h1 className="game-details__hero-classics-title">
              {game?.title ?? shopDetails?.name ?? ""}
            </h1>
            {launchboxPlatform && (
              <div className="game-details__hero-classics-chips">
                <span className="game-details__hero-classics-chip">
                  {launchboxPlatform}
                </span>
                {launchboxEmulatorIcon && (
                  <span className="game-details__hero-classics-chip game-details__hero-classics-chip--icon">
                    <img src={launchboxEmulatorIcon} alt="" />
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="game-details__hero-image-wrapper">
      <img
        src={resolvedHeroImage}
        className="game-details__hero-image"
        alt={game?.title}
      />
      <div className="game-details__hero-gradient-overlay" />
    </div>
  );
}
