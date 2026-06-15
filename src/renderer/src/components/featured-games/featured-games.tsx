import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { levelDBService } from "@renderer/services/leveldb.service";
import { orderBy } from "lodash-es";

import Skeleton, { SkeletonTheme } from "react-loading-skeleton";

import { Button, GameCard, Hero } from "@renderer/components";
import type { DownloadSource, ShopAssets, Steam250Game } from "@types";

import flameIconStatic from "@renderer/assets/icons/flame-static.png";
import flameIconAnimated from "@renderer/assets/icons/flame-animated.gif";
import starsIconAnimated from "@renderer/assets/icons/stars-animated.gif";

import { buildGameDetailsPath } from "@renderer/helpers";
import { CatalogueCategory } from "@shared";

import "./featured-games.scss";

export function FeaturedGames() {
  const { t } = useTranslation("home");
  const navigate = useNavigate();

  const [animateFlame, setAnimateFlame] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [randomGame, setRandomGame] = useState<Steam250Game | null>(null);

  const [currentCatalogueCategory, setCurrentCatalogueCategory] = useState(
    CatalogueCategory.Hot
  );

  const [catalogue, setCatalogue] = useState<
    Record<CatalogueCategory, ShopAssets[]>
  >({
    [CatalogueCategory.Hot]: [],
    [CatalogueCategory.Weekly]: [],
    [CatalogueCategory.Achievements]: [],
  });

  const getCatalogue = useCallback(async (category: CatalogueCategory) => {
    try {
      setCurrentCatalogueCategory(category);
      setIsLoading(true);

      const sources = (await levelDBService.values(
        "downloadSources"
      )) as DownloadSource[];
      const downloadSources = orderBy(sources, "createdAt", "desc");

      const params = {
        take: 12,
        skip: 0,
        downloadSourceIds: downloadSources.map((source) => source.id),
      };

      const catalogue = await window.electron.hydraApi.get<ShopAssets[]>(
        `/catalogue/${category}`,
        {
          params,
          needsAuth: false,
        }
      );

      setCatalogue((prev) => ({ ...prev, [category]: catalogue }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getRandomGame = useCallback(() => {
    window.electron.getRandomGame().then((game) => {
      if (game) setRandomGame(game);
    });
  }, []);

  const handleRandomizerClick = () => {
    if (randomGame) {
      navigate(
        buildGameDetailsPath(
          { ...randomGame, shop: "steam" },
          {
            fromRandomizer: "1",
          }
        )
      );
    }
  };

  const handleCategoryClick = (category: CatalogueCategory) => {
    if (category !== currentCatalogueCategory) {
      getCatalogue(category);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    getCatalogue(CatalogueCategory.Hot);

    getRandomGame();
  }, [getCatalogue, getRandomGame]);

  const categories = Object.values(CatalogueCategory);

  const handleMouseEnterCategory = (category: CatalogueCategory) => {
    if (category === CatalogueCategory.Hot) {
      setAnimateFlame(true);
    }
  };

  const handleMouseLeaveCategory = (category: CatalogueCategory) => {
    if (category === CatalogueCategory.Hot) {
      setAnimateFlame(false);
    }
  };

  return (
    <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
      <div className="featured-games">
        <Hero />

        <div className="featured-games__header">
          <ul className="featured-games__buttons-list">
            {categories.map((category) => (
              <li key={category}>
                <Button
                  theme={
                    category === currentCatalogueCategory
                      ? "primary"
                      : "outline"
                  }
                  onClick={() => handleCategoryClick(category)}
                  onMouseEnter={() => handleMouseEnterCategory(category)}
                  onMouseLeave={() => handleMouseLeaveCategory(category)}
                >
                  {category === CatalogueCategory.Hot && (
                    <div className="featured-games__icon-wrapper">
                      <img
                        src={flameIconStatic}
                        alt=""
                        className="featured-games__flame-icon"
                        style={{ display: animateFlame ? "none" : "block" }}
                      />
                      <img
                        src={flameIconAnimated}
                        alt=""
                        className="featured-games__flame-icon"
                        style={{ display: animateFlame ? "block" : "none" }}
                      />
                    </div>
                  )}

                  {t(category)}
                </Button>
              </li>
            ))}
          </ul>

          <Button
            onClick={handleRandomizerClick}
            theme="outline"
            disabled={!randomGame}
          >
            <div className="featured-games__icon-wrapper">
              <img
                src={starsIconAnimated}
                alt=""
                className="featured-games__stars-icon"
              />
            </div>
            {t("surprise_me")}
          </Button>
        </div>

        <h2 className="featured-games__title">
          {currentCatalogueCategory === CatalogueCategory.Hot && (
            <div className="featured-games__title-icon">
              <img
                src={flameIconAnimated}
                alt=""
                className="featured-games__title-flame-icon"
              />
            </div>
          )}

          {t(currentCatalogueCategory)}
        </h2>

        <div className="featured-games__cards">
          {isLoading
            ? Array.from({ length: 12 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="featured-games__card-skeleton"
                />
              ))
            : catalogue[currentCatalogueCategory].map((result) => (
                <GameCard
                  key={result.objectId}
                  game={result}
                  onClick={() => navigate(buildGameDetailsPath(result))}
                />
              ))}
        </div>
      </div>
    </SkeletonTheme>
  );
}
