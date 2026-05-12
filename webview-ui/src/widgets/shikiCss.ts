const shikiCssRules = new Set<string>();

export function applyShikiCss(css: string): void {
  if (css.trim().length === 0) {
    return;
  }

  let style = document.getElementById('mw-shiki-generated-css') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'mw-shiki-generated-css';
    const nonce = document.querySelector<HTMLMetaElement>('meta[name="markdownweave-style-nonce"]')?.content;
    if (nonce) {
      style.setAttribute('nonce', nonce);
    }
    document.head.appendChild(style);
  }

  let changed = false;
  for (const rule of css.split('\n')) {
    const normalized = rule.trim();
    if (normalized.length === 0 || shikiCssRules.has(normalized)) {
      continue;
    }

    shikiCssRules.add(normalized);
    changed = true;
  }

  if (changed) {
    style.textContent = Array.from(shikiCssRules).join('\n');
  }
}
