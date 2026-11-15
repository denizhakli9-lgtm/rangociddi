// Applies the saved light/dark theme before the app renders (no flash).
// Kept as a separate file so the Content-Security-Policy does not need
// 'unsafe-inline' for scripts.
(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    let preference = 'system';
    try { preference = localStorage.getItem('hizmet-theme') || 'system'; } catch { /* storage blocked */ }
    const theme = preference === 'light' || preference === 'dark' ? preference : media.matches ? 'dark' : 'light';
    try { localStorage.setItem('hizmet-theme', theme); } catch { /* storage blocked */ }
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#080808' : '#f8f7f3');
  };
  apply();
  window.addEventListener('storage', apply);
})();
