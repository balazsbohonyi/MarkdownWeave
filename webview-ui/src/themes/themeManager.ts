type MwTheme = 'light' | 'dark' | 'sepia';

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
  applyTheme(detectTheme());
}

export function observeThemeChanges(): void {
  const observer = new MutationObserver(() => {
    applyTheme(detectTheme());
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

export function setThemeOverride(theme: MwTheme | 'auto'): void {
  if (theme === 'auto') {
    applyTheme(detectTheme());
  } else {
    applyTheme(theme);
  }
}
