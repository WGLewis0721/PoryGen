import { useEffect } from "react";

const DEFAULT_TITLE = "PoryGen — Move fast. Keep it yours.";

/** Sets a unique document title per route and restores the default on unmount. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
