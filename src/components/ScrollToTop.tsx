import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to the top when the address changes. Not on the first render: a new document starts
 * at the top anyway, and a visitor who is already reading a page that was served as static HTML
 * must not be thrown back up when the app takes over.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}
