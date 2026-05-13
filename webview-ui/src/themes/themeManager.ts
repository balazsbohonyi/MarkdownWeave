type MwTheme = 'light' | 'dark' | 'sepia';
let themeOverride: MwTheme | 'auto' = 'auto';

function detectTheme(): MwTheme | null {
  const cls = document.body.classList;
  if (cls.contains('vscode-high-contrast')) {
    return null; // no data-mw-theme → variables.css defaults pass through VS Code colors
  }
  return cls.contains('vscode-light') ? 'light' : 'dark';
}

function applyTheme(theme: MwTheme | null): void {
  if (theme === null) {
    document.documentElement.removeAttribute('data-mw-theme');
  } else {
    document.documentElement.setAttribute('data-mw-theme', theme);
  }
}

export function initTheme(): void {
  applyTheme(themeOverride === 'auto' ? detectTheme() : themeOverride);
}

export function observeThemeChanges(): void {
  const observer = new MutationObserver(() => {
    if (themeOverride === 'auto') {
      applyTheme(detectTheme());
    }
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

export function setThemeOverride(theme: MwTheme | 'auto'): void {
  themeOverride = theme;
  if (theme === 'auto') {
    applyTheme(detectTheme());
  } else {
    applyTheme(theme);
  }
}
