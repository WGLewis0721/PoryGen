import { Link } from "react-router-dom";

export function Wordmark({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={`wordmark${className ? ` ${className}` : ""}`} aria-label="PoryGen home" translate="no">
      PoryGen
    </Link>
  );
}
