import { Outlet } from "react-router-dom";
import { MarketingNav } from "../../components/MarketingNav";
import { Footer } from "../../components/Footer";

export function MarketingLayout() {
  return (
    <>
      <a href="#pg-main-content" className="pg-skip-link">
        skip to content
      </a>
      <MarketingNav />
      <main id="pg-main-content" className="pg-main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
