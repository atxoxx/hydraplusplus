import { FeaturedGames } from "@renderer/components";

import "./home.scss";

export default function Home() {
  return (
    <section className="home__content">
      <FeaturedGames />
    </section>
  );
}
