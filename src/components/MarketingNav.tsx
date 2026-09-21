import { Link, NavLink } from "react-router-dom";
import { BitCritter } from "./BitCritter";
import { useAuth } from "../features/auth/AuthContext";

export function MarketingNav() {
  const { user } = useAuth();
  return (
    <header className="pg-nav">
      <div className="pg-shell pg-nav-inner">
        <Link to="/" className="pg-nav-brand" aria-label="PoryGen home">
          <BitCritter state="healthy" size={30} label="" />
          <span>PoryGen</span>
        </Link>
        <nav className="pg-nav-links" aria-label="Primary">
          <NavLink to="/product" className="pg-nav-link">product</NavLink>
          <NavLink to="/pricing" className="pg-nav-link">pricing</NavLink>
          <NavLink to="/enterprise" className="pg-nav-link">enterprise</NavLink>
          <NavLink to="/docs" className="pg-nav-link">docs</NavLink>
        </nav>
        <div className="pg-nav-actions">
          {user ? (
            <Link to="/dashboard" className="pg-btn pg-btn-primary">dashboard</Link>
          ) : (
            <>
              <Link to="/sign-in" className="pg-btn pg-btn-ghost">sign in</Link>
              <Link to="/sign-up" className="pg-btn pg-btn-primary">feed a repository</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
