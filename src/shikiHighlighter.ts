import { transformerStyleToClass } from '@shikijs/transformers';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import type { HighlighterCore, LanguageRegistration, ThemeRegistrationAny, ThemedTokenWithVariants, TokenStyles } from 'shiki';

export type HighlightedCode = {
  html: string;
  css: string;
  lang: string;
  tokens: HighlightedCodeToken[];
};

export type HighlightedCodeToken = {
  from: number;
  to: number;
  className: string;
};

type LanguageLoader = () => Promise<LanguageRegistration[]>;

const lightThemeName = 'light-plus';
const darkThemeName = 'dark-plus';
const commonLanguages = ['javascript', 'typescript', 'json', 'html', 'css', 'python', 'bash', 'shellscript', 'markdown'];
const styleTransformer = transformerStyleToClass({ classPrefix: 'mw-shiki-' });
const languageLoaders: Record<string, LanguageLoader> = {
  javascript: () => import('@shikijs/langs/javascript').then((module) => toLanguageArray(module.default)),
  typescript: () => import('@shikijs/langs/typescript').then((module) => toLanguageArray(module.default)),
  json: () => import('@shikijs/langs/json').then((module) => toLanguageArray(module.default)),
  html: () => import('@shikijs/langs/html').then((module) => toLanguageArray(module.default)),
  css: () => import('@shikijs/langs/css').then((module) => toLanguageArray(module.default)),
  python: () => import('@shikijs/langs/python').then((module) => toLanguageArray(module.default)),
  bash: () => import('@shikijs/langs/bash').then((module) => toLanguageArray(module.default)),
  shellscript: () => import('@shikijs/langs/shellscript').then((module) => toLanguageArray(module.default)),
  markdown: () => import('@shikijs/langs/markdown').then((module) => toLanguageArray(module.default)),
  md: () => import('@shikijs/langs/markdown').then((module) => toLanguageArray(module.default))
};

const languageAliases = new Map<string, string>([
  ['js', 'javascript'],
  ['jsx', 'javascript'],
  ['mjs', 'javascript'],
  ['cjs', 'javascript'],
  ['ts', 'typescript'],
  ['tsx', 'typescript'],
  ['mts', 'typescript'],
  ['cts', 'typescript'],
  ['py', 'python'],
  ['sh', 'bash'],
  ['shell', 'shellscript'],
  ['zsh', 'shellscript'],
  ['md', 'markdown'],
  ['mdown', 'markdown'],
  ['text', 'text'],
  ['txt', 'text'],
  ['plain', 'text'],
  ['plaintext', 'text']
]);

let highlighterPromise: Promise<HighlighterCore> | undefined;
const loadedLanguages = new Set<string>();

export async function highlight(code: string, requestedLanguage: string): Promise<HighlightedCode> {
  const lang = normalizeLanguage(requestedLanguage);

  if (lang === 'text') {
    return {
      html: renderPlainText(code),
      css: '',
      lang,
      tokens: []
    };
  }

  const highlighter = await getHighlighter();
  const loadedLang = await ensureLanguageLoaded(highlighter, lang);

  if (!loadedLang) {
    return {
      html: renderPlainText(code),
      css: '',
      lang: 'text',
      tokens: []
    };
  }

  const html = highlighter.codeToHtml(code, {
    lang: loadedLang,
    themes: {
      light: lightThemeName,
      dark: darkThemeName
    },
    defaultColor: false,
    rootStyle: false,
    transformers: [styleTransformer]
  });
  const tokenLines = highlighter.codeToTokensWithThemes(code, {
    lang: loadedLang,
    themes: {
      light: lightThemeName,
      dark: darkThemeName
    }
  });

  const cssRules = new Map<string, string>();
  const tokens: HighlightedCodeToken[] = [];

  for (const line of tokenLines) {
    for (const token of line) {
      if (token.content.length === 0) {
        continue;
      }

      const className = getTokenClassName(token);
      cssRules.set(className, renderTokenCss(className, token.variants.light, token.variants.dark));
      tokens.push({
        from: token.offset,
        to: token.offset + token.content.length,
        className
      });
    }
  }

  return {
    html: /\sstyle\s*=/.test(html) ? renderPlainText(code) : html,
    css: [styleTransformer.getCSS(), ...cssRules.values()].filter(Boolean).join('\n'),
    lang: loadedLang,
    tokens
  };
}

async function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighter();
  return highlighterPromise;
}

async function createHighlighter(): Promise<HighlighterCore> {
  const [lightTheme, darkTheme, ...languageGroups] = await Promise.all([
    import('@shikijs/themes/light-plus').then((module) => module.default as ThemeRegistrationAny),
    import('@shikijs/themes/dark-plus').then((module) => module.default as ThemeRegistrationAny),
    ...commonLanguages.map((lang) => languageLoaders[lang]())
  ]);
  const languages = languageGroups.flat();

  const highlighter = await createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    themes: [lightTheme, darkTheme],
    langs: languages
  });

  rememberLanguages(languages);

  return highlighter;
}

async function ensureLanguageLoaded(highlighter: HighlighterCore, lang: string): Promise<string | undefined> {
  if (loadedLanguages.has(lang)) {
    return lang;
  }

  const loader = languageLoaders[lang];
  if (!loader) {
    return undefined;
  }

  const languages = await loader();
  await highlighter.loadLanguage(...languages);
  rememberLanguages(languages);
  return loadedLanguages.has(lang) ? lang : languages[0]?.name;
}

function normalizeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase().split(/\s+/, 1)[0] ?? '';
  if (normalized.length === 0) {
    return 'text';
  }

  return languageAliases.get(normalized) ?? normalized;
}

function renderPlainText(code: string): string {
  const lines = code.length === 0 ? [''] : code.split(/\r?\n/);
  const renderedLines = lines
    .map((line) => `<span class="line">${escapeHtml(line)}</span>`)
    .join('\n');

  return `<pre class="shiki mw-shiki-plain" tabindex="0"><code>${renderedLines}</code></pre>`;
}

function getTokenClassName(token: ThemedTokenWithVariants): string {
  return `mw-shiki-${hashString(JSON.stringify(token.variants))}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTokenCss(className: string, light: TokenStyles | undefined, dark: TokenStyles | undefined): string {
  const base = renderBaseTokenCss(className, light ?? dark);
  const lightColor = renderColorRule(`body.vscode-light .${className}`, light);
  const darkColor = renderColorRule(`body.vscode-dark .${className}, body.vscode-high-contrast .${className}`, dark ?? light);
  return [base, lightColor, darkColor].filter(Boolean).join('\n');
}

function renderBaseTokenCss(className: string, styles: TokenStyles | undefined): string {
  const rules: string[] = [];
  const fontStyle = styles?.fontStyle ?? 0;

  if ((fontStyle & 1) === 1) {
    rules.push('font-style: italic;');
  }

  if ((fontStyle & 2) === 2) {
    rules.push('font-weight: 700;');
  }

  if ((fontStyle & 4) === 4) {
    rules.push('text-decoration: underline;');
  }

  return rules.length > 0 ? `.${className} { ${rules.join(' ')} }` : '';
}

function renderColorRule(selector: string, styles: TokenStyles | undefined): string {
  return styles?.color ? `${selector} { color: ${styles.color}; }` : '';
}

function toLanguageArray(language: LanguageRegistration | LanguageRegistration[]): LanguageRegistration[] {
  return Array.isArray(language) ? language : [language];
}

function rememberLanguages(languages: LanguageRegistration[]): void {
  languages.forEach((language) => {
    loadedLanguages.add(language.name);
    language.aliases?.forEach((alias) => loadedLanguages.add(alias));
  });
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}
