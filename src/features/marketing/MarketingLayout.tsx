import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { MarketingNav } from "../../components/MarketingNav";
import { Footer } from "../../components/Footer";

export function MarketingLayout() {
  const { pathname, hash } = useLocation();
  const overlay = pathname === "/";

  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <MarketingNav overlay={overlay} />
      <main id="main" className={`site-main${overlay ? " site-main-overlay" : ""}`} tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
