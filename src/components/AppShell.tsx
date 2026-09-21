import { useId, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { CreditCard, FolderGit2, History, LayoutDashboard, ListChecks, LogOut, Menu, Settings, X } from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { Wordmark } from "./Wordmark";

const LINKS = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/findings", label: "Findings", icon: ListChecks },
  { to: "/repositories", label: "Repositories", icon: FolderGit2 },
  { to: "/history", label: "History", icon: History },
  { to: "/billing", label: "Plan & billing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, configured, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === location.pathname;
  const navId = useId();

  return (
    <div className="app-shell">
      <a href="#app-main" className="skip-link">
        Skip to content
      </a>
      <aside className={`app-sidebar${open ? " is-open" : ""}`}>
        <div className="app-brand">
          <Wordmark to="/dashboard" />
          <button
            type="button"
            className="app-menu-button"
            aria-expanded={open}
            aria-controls={navId}
            onClick={() => setOpenOn(open ? null : location.pathname)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            <span className="visually-hidden">{open ? "Close navigation" : "Open navigation"}</span>
          </button>
        </div>
        <nav id={navId} className="app-nav" aria-label="Application">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className="app-nav-link">
              <link.icon aria-hidden="true" />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="app-sidebar-footer">
          <div className="app-user" title={user?.email ?? ""}>
            {user?.email ?? (configured ? "" : "Local preview — Supabase not configured")}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>
      <main id="app-main" className="app-main" tabIndex={-1}>
        <div className="app-main-inner">{children}</div>
      </main>
    </div>
  );
}
