import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { BitCritter } from "./BitCritter";
import { useAuth } from "../features/auth/AuthContext";

const LINKS = [
  { to: "/dashboard", label: "dashboard" },
  { to: "/repositories", label: "repositories" },
  { to: "/provenance", label: "provenance ledger" },
  { to: "/billing", label: "billing" },
  { to: "/settings", label: "settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="pg-app-shell">
      <aside className="pg-app-sidebar">
        <div className="pg-app-brand">
          <BitCritter state="idle" size={26} label="" />
          <span>PoryGen</span>
        </div>
        <nav className="pg-app-nav" aria-label="Application">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `pg-app-nav-link${isActive ? " pg-app-nav-link-active" : ""}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="pg-app-sidebar-footer">
          <div className="pg-app-user" title={user?.email ?? ""}>
            {user?.email ?? "demo session"}
          </div>
          <button
            type="button"
            className="pg-btn pg-btn-ghost pg-btn-block"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            sign out
          </button>
        </div>
      </aside>
      <main className="pg-app-main">{children}</main>
    </div>
  );
}
