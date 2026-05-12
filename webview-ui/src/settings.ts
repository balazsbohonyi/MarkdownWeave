import { StateEffect } from '@codemirror/state';
import type { MarkdownWeaveSettings } from './bridge';

const SETTINGS_STYLE_ID = 'mw-settings-style';
const CUSTOM_CSS_STYLE_ID = 'mw-custom-css-style';
const BUILT_IN_FONTS = {
  body: "'Merriweather', Georgia, 'Times New Roman', serif",
  heading: "'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
};
const DEFAULT_SETTINGS: MarkdownWeaveSettings = {
  theme: 'auto',
  useBuiltInFonts: false,
  headingFont: '',
  bodyFont: '',
  customCssPath: '',
  fontSize: 16,
  lineHeight: 1.75,
  enableWikiLinks: true,
  enableMath: true,
  enableMermaid: true
};

let currentSettings = DEFAULT_SETTINGS;

export const markdownSettingsChanged = StateEffect.define<void>();

export function getMarkdownWeaveSettings(): MarkdownWeaveSettings {
  return currentSettings;
}

export function applyMarkdownWeaveSettings(settings: MarkdownWeaveSettings): void {
  currentSettings = normalizeSettings(settings);
  applySettingsStyle(currentSettings);
  applyCustomCss(currentSettings.customCss);
}

function normalizeSettings(settings: MarkdownWeaveSettings): MarkdownWeaveSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    fontSize: clamp(settings.fontSize, 10, 32, DEFAULT_SETTINGS.fontSize),
    lineHeight: clamp(settings.lineHeight, 1, 2.5, DEFAULT_SETTINGS.lineHeight),
    headingFont: settings.headingFont.trim(),
    bodyFont: settings.bodyFont.trim()
  };
}

function applySettingsStyle(settings: MarkdownWeaveSettings): void {
  const style = ensureStyleElement(SETTINGS_STYLE_ID);
  ensureStyleOrder();
  style.textContent = ':root {}';
  const rule = style.sheet?.cssRules.item(0);
  if (!(rule instanceof CSSStyleRule)) {
    return;
  }

  rule.style.setProperty('--mw-font-size-base', `${settings.fontSize}px`);
  rule.style.setProperty('--mw-line-height', String(settings.lineHeight));

  const headingFont = settings.headingFont || (settings.useBuiltInFonts ? BUILT_IN_FONTS.heading : '');
  const bodyFont = settings.bodyFont || (settings.useBuiltInFonts ? BUILT_IN_FONTS.body : '');
  if (headingFont) {
    rule.style.setProperty('--mw-font-heading', headingFont);
  }
  if (bodyFont) {
    rule.style.setProperty('--mw-font-body', bodyFont);
  }
}

function applyCustomCss(css: string | undefined): void {
  const existing = document.getElementById(CUSTOM_CSS_STYLE_ID);
  if (!css) {
    existing?.remove();
    return;
  }

  const style = ensureStyleElement(CUSTOM_CSS_STYLE_ID);
  ensureStyleOrder();
  style.textContent = css;
}

function ensureStyleElement(id: string): HTMLStyleElement {
  const existing = document.getElementById(id);
  if (existing instanceof HTMLStyleElement) {
    document.head.appendChild(existing);
    return existing;
  }

  const style = document.createElement('style');
  style.id = id;
  const nonce = document.querySelector<HTMLMetaElement>('meta[name="markdownweave-style-nonce"]')?.content;
  if (nonce) {
    style.setAttribute('nonce', nonce);
  }
  document.head.appendChild(style);
  return style;
}

function ensureStyleOrder(): void {
  const settingsStyle = document.getElementById(SETTINGS_STYLE_ID);
  const customStyle = document.getElementById(CUSTOM_CSS_STYLE_ID);
  if (settingsStyle instanceof HTMLStyleElement) {
    document.head.appendChild(settingsStyle);
  }
  if (customStyle instanceof HTMLStyleElement) {
    document.head.appendChild(customStyle);
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
