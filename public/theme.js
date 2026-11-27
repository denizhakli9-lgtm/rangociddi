// Applies the light/dark theme before the app renders (no flash).
// Kept as a separate file so the Content-Security-Policy does not need
// 'unsafe-inline' for scripts.
// Every visitor starts in light mode; dark mode is used only after the visitor
// picks it with the toggle (saved under 'rango-theme').
(() => {
  const apply = () => {
    let theme = 'light';
    try { theme = localStorage.getItem('rango-theme') === 'dark' ? 'dark' : 'light'; } catch { /* storage blocked */ }
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#f9f8f5');
  };
  // The old key stored the device's system theme automatically; it is not a choice the visitor made.
  try { localStorage.removeItem('hizmet-theme'); } catch { /* storage blocked */ }
  apply();
  window.addEventListener('storage', apply);
})();
