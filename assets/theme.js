(() => {
  const key = 'home-buying-theme-v1';
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  let saved = null;
  try { saved = localStorage.getItem(key); } catch { /* The switch works without storage. */ }
  let manual = saved === 'dark' || saved === 'light';

  function apply(theme) {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    if (document.body) document.body.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = meta.dataset[theme] || (dark ? '#15121f' : '#f7f5fb');
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? '切換至亮色模式' : '切換至暗色模式');
      const label = button.querySelector('[data-theme-label]');
      if (label) label.textContent = dark ? '亮色' : '暗色';
      const symbol = button.querySelector('[data-theme-symbol]');
      if (symbol) symbol.textContent = dark ? '☀' : '☾';
      button.querySelectorAll('[data-theme-icon]').forEach((icon) => {
        icon.toggleAttribute('hidden', icon.dataset.themeIcon !== (dark ? 'sun' : 'moon'));
      });
    });
  }

  const systemTheme = () => preference.matches ? 'dark' : 'light';
  apply(manual ? saved : systemTheme());
  document.addEventListener('DOMContentLoaded', () => {
    apply(document.documentElement.dataset.theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        manual = true;
        apply(next);
        try { localStorage.setItem(key, next); } catch { /* Keep the choice for this page. */ }
      });
    });
  });
  preference.addEventListener('change', () => { if (!manual) apply(systemTheme()); });
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    manual = event.newValue === 'dark' || event.newValue === 'light';
    apply(manual ? event.newValue : systemTheme());
  });
})();
