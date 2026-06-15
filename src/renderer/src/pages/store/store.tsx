import { useTranslation } from "react-i18next";
import { FeaturedGames } from "@renderer/components";

import Catalogue from "../catalogue/catalogue";

import "./store.scss";

export default function Store() {
  const { t } = useTranslation("home");

  return (
    <div className="store">
      <section className="store__home">
        <FeaturedGames />
      </section>

      <div className="store__divider">
        <span className="store__divider-line" />
        <span className="store__divider-text">
          {t("browse_all_games", { defaultValue: "Browse All Games" })}
        </span>
        <span className="store__divider-line" />
      </div>

      <Catalogue />
    </div>
  );
}
