# Phase 8 Decisions

## Deviations From Plan

### Original plan replaced entirely

The original `plan.md` described a minimal CSS variable layer on top of VS Code's colors. After a design review, the approach was substantially upgraded. See `implementation.md` for the full revised spec.

**Key differences from original plan:**
- Original: 7 tasks (T1-T7) covering basic `--mw-*` vars, light/dark/sepia CSS files, theme setting, and custom CSS loading
- Implemented: 7 tasks (T1-T7) with a completely different architecture — full-override reading themes, bundled editorial fonts, and `data-mw-theme` attribute strategy
- Custom CSS loading (old T6/T7) moved to Phase 9

### Task numbering changed

Original task IDs (P8-T1 through P8-T7) no longer match the original descriptions. The new tasks are documented in `implementation.md`.

---

## Decisions

### Full-override reading themes instead of VS Code pass-through

**Decision:** Each theme (light/dark/sepia) sets its own complete color palette independent of VS Code's active theme.

**Why:** The rendered markdown preview was using VS Code's code-editor colors (monospace font, ~14px), which is poorly suited for reading prose. Full-override themes allow hand-tuned reading palettes optimized for long-form content.

**How applied:** Themes use `:root[data-mw-theme="..."]` selectors. Auto-detection maps VS Code light/dark to MW light/dark themes. High-contrast mode has no override (pass-through to VS Code variables via `variables.css` defaults).

### `data-mw-theme` attribute on `<html>` element

**Decision:** Theme selection uses a `data-mw-theme` attribute on the `<html>` element rather than adding classes to `<body>`.

**Why:** VS Code owns the `<body>` element's class list (`vscode-light`, `vscode-dark`, `vscode-high-contrast`). Adding MW classes there risks conflicts with existing code that reads body classes (Mermaid observer, Shiki selectors, CM6 theme observer).

### Bundled editorial fonts (Inter + Merriweather)

**Decision:** Inter (headings) and Merriweather (body text) are shipped as `.woff2` files in `media/fonts/` and injected via `@font-face` in the webview HTML template.

**Why:** VS Code webviews run with CSP restrictions — external Google Fonts CDN URLs would be blocked. Fonts must be loaded from the extension's own URI scheme. CSS `var()` cannot be used inside `@font-face src`, so URIs must be resolved at runtime in `getHtmlForWebview()` using `webview.asWebviewUri()` — the same pattern used for KaTeX.

**Font weights shipped:**
- Inter: 400 (regular), 700 (bold) — ~48KB
- Merriweather: 400, 400 italic, 700, 700 italic — ~199KB
- Total: ~247KB

### Code blocks excluded from theme overrides

**Decision:** `--mw-codeblock-bg` and `--mw-codeblock-border` are never set by theme stylesheets. The Shiki selectors (`body.vscode-light .shiki span`) remain completely unchanged.

**Why:** Code blocks should maintain VS Code's familiar appearance regardless of which reading theme is active. Users have configured their VS Code theme for their coding context; overriding code block colors would conflict with that choice.

### Three independent MutationObservers

**Decision:** A third MutationObserver (in `themeManager.ts`) manages `data-mw-theme` attribute changes. The existing CM6 reconfiguration observer and Mermaid re-render observer were left untouched.

**Why:** Coupling all three into a unified observer would require `themeManager.ts` to import from `editor.ts` and `MermaidWidget.ts`, creating circular dependencies. Three independent observers are cheap and keep the modules decoupled.

### `observeThemeChanges()` called only once

**Decision:** A `themeObserverStarted` flag in `main.ts` ensures `observeThemeChanges()` is only called on the first `init` message, not on subsequent document reloads.

**Why:** The `init` message handler fires each time a new document is opened in the same webview panel. Calling `observeThemeChanges()` repeatedly would accumulate MutationObservers.

### Custom CSS loading moved to Phase 9

**Decision:** The original P8-T6 (custom CSS file loading) and P8-T7 (file watcher) are moved to Phase 9.

**Why:** These features depend on the `markdownWeave.customCssPath` setting, which is registered in Phase 9. Keeping CSS loading in Phase 8 would require registering one setting early — cleaner to have all settings in Phase 9.

### `fontSize` and `lineHeight` defaults updated

**Decision:** Phase 9's `markdownWeave.fontSize` default changes from `0` (inherit VS Code) to `16`. `markdownWeave.lineHeight` default changes from `1.6` to `1.75`.

**Why:** The reading themes now explicitly set 16px / 1.75 as their typography defaults. Phase 9 settings should reflect these new defaults rather than the old VS Code pass-through values.

### `setThemeOverride()` exported from themeManager

**Decision:** `themeManager.ts` exports a `setThemeOverride(theme: MwTheme | 'auto')` function in addition to `initTheme()` and `observeThemeChanges()`.

**Why:** Phase 9 will need to call this function when the user changes the `markdownWeave.theme` setting. Exporting it now avoids modifying `themeManager.ts` in Phase 9.
