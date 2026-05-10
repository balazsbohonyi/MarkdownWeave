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

### Breadcrumbs and dropdowns pin to VS Code UI font variables

**Decision:** `#breadcrumb` and `.bc-dropdown` in `main.css` explicitly set `font-family: var(--vscode-font-family)` and `font-size: var(--vscode-font-size)`, overriding any inherited custom reading fonts.

**Why:** Breadcrumbs are VS Code UI chrome, not document content. They should feel native to the VS Code interface, not adopt the reading-optimized typeface of the document being previewed. The redundant `font-size: 13px` on `.bc-sep` was also removed — it inherits from `#breadcrumb`.

### Custom reading fonts (`--mw-font-body` / `--mw-font-heading`) are opt-in, not defaults

**Decision:** The three theme files (light/dark/sepia) no longer set `--mw-font-body` or `--mw-font-heading`. Those variables fall through to the `variables.css` defaults, which pass through `--vscode-font-family`. The Merriweather + Inter pairing becomes opt-in via a Phase 9 setting (`markdownWeave.useBuiltInFonts`, boolean, default `false`).

**Why:** Imposing opinionated fonts by default surprised users who expected the editor to look like the rest of VS Code. Opt-in is the correct model — users discover the enhanced typography when they want it. The `@font-face` declarations remain in the HTML template (browsers don't download unreferenced fonts), so Phase 9 only needs to set the CSS variables to activate them.

### Arrow-key navigation skipping nested list items

**Root cause:** CM6's `cursorLineUp`/`cursorLineDown` use `view.coordsAtPos()` then `view.posAtCoords()` internally to advance by visual pixel position. `coordsAtPos` returns `null` for any document position that is covered by a `Decoration.replace` widget, because the source characters are not present in the DOM. The `ListMarkerWidget` is an inline `Decoration.replace` that replaces the leading `- ` / `1. ` characters of every list item, so `line.from` of a list item line has null coords. In a document that also contains collapsed blocks (tables, code blocks, math), the custom `moveAcrossCollapsedBlock` handler fires for every Up/Down keypress. When it determined no collapsed block was involved and deferred to CM (`return false`), CM's coordinate-based navigation then skipped all list lines whose `.from` position returned null coords — jumping over entire nested sub-lists in one keystroke.

**Fix (four parts, all in `webview-ui/src/`):**

1. **`decorations/blockWidgets.ts` — `moveAcrossCollapsedBlock`**: Added a `coordsAtPos`-null check before returning `false` to CM. If the direct neighboring line's `.from` has null coords, intercept and navigate there by line number using `findColumn`/`countColumn` to preserve goal column. This catches the list-item skip scenario step-by-step.

2. **`decorations/blockWidgets.ts` — `findCollapsedRangeForLine`**: Tightened boundary check from `<=`/`>=` to `<`/`>` (strict). The old inclusive check caused false-positive collapsed-range matches at the exact boundary lines adjacent to a collapsed block, which triggered the custom handler unnecessarily.

3. **`decorations/blockWidgets.ts` — `getCollapsedAwareVerticalTarget`**: Fixed an off-by-one for the DOWN direction. When the current collapsed range ends exactly at a line boundary (`to === nextLine.from`), the target line number was computed one too high, skipping a line.

4. **`main.css` — `.mw-list-line`**: Changed `margin-bottom: 0.2em` to `padding-bottom: 0.2em`. CM6's height oracle only measures `border + padding + content`; `margin-*` on `.cm-line` (applied via `Decoration.line()`) is invisible to CM, causing coordinate-based navigation to mis-measure line positions. Padding is visually identical but correctly measured.
