import { useEffect, useId, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { Wordmark } from "./Wordmark";
import { isSupabaseConfigured } from "../lib/supabaseClient";

const LINKS = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/demo", label: "Live demo" },
  { to: "/pricing", label: "Pricing" },
  { to: "/security", label: "Security" },
];

export function MarketingNav({ overlay = false }: { overlay?: boolean }) {
  const { user } = useAuth();
  const location = useLocation();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === location.pathname;
  const [scrolled, setScrolled] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!overlay) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > 24));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [overlay]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const solid = !overlay || scrolled || open;

  return (
    <header className={`site-header${solid ? " site-header-solid" : ""}`}>
      <div className="shell site-header-inner">
        <Wordmark />
        <nav className="site-nav" aria-label="Primary">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className="site-nav-link">
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="site-actions">
          {user ? (
            <Link to="/dashboard" className="btn btn-primary btn-sm">
              Open app
            </Link>
          ) : (
            <>
              {isSupabaseConfigured && (
                <Link to="/sign-in" className="site-signin">
                  Sign in
                </Link>
              )}
              <Link to="/scan" className="btn btn-primary btn-sm site-cta">
                Scan a repo
              </Link>
            </>
          )}
          <button
            type="button"
            className="site-menu-button"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpenOn(open ? null : location.pathname)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            <span className="visually-hidden">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      </div>
      <div id={menuId} className="site-menu" hidden={!open}>
        <nav className="shell site-menu-inner" aria-label="Primary mobile">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className="site-menu-link">
              {link.label}
            </NavLink>
          ))}
          {!user && isSupabaseConfigured && (
            <NavLink to="/sign-in" className="site-menu-link">
              Sign in
            </NavLink>
          )}
          <Link to={user ? "/dashboard" : "/scan"} className="btn btn-primary btn-block">
            {user ? "Open app" : "Scan a repo"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
