# Phase 8: Theming & Customization — Revised Plan

## Context

During phases 1–7, the extension accumulated a functional but ad-hoc styling system: a single 950-line `main.css` with 106 direct `--vscode-*` variable references, hardcoded font sizes, and no custom font stack. The rendered markdown preview inherits VS Code's code-editor typography (monospace, ~14px), which is suboptimal for reading prose.

This revised plan transforms MarkdownWeave's preview into a **polished reading experience** with:
- Bundled editorial fonts (Inter for headings, Merriweather for body text)
- Three full-override reading themes (light, dark, sepia) with hand-tuned palettes
- A `--mw-*` CSS variable system that decouples theming from VS Code's editor variables
- Auto-detection of VS Code's light/dark mode to select the matching reading theme

Custom CSS loading (old P8-T6/T7) moves to Phase 9. Theme setting registration also stays in Phase 9.

---

## Task Breakdown

### P8-T1: CSS Variable Taxonomy + Base Variables File

**Goal:** Define the `--mw-*` variable system and create `variables.css` with defaults mapping to `--vscode-*` values.

**Steps:**
1. Audit all `--vscode-*` references in `main.css` (~99) and `editor.ts` `markdownWeaveTheme()` (~13). Group by semantic role.
2. Create `webview-ui/src/themes/variables.css` with a `:root { ... }` block defining every `--mw-*` variable, each defaulting to its corresponding `--vscode-*` value. Categories:
   - **Surface:** `--mw-bg`, `--mw-fg`
   - **Typography:** `--mw-font-body`, `--mw-font-heading`, `--mw-font-code`, `--mw-font-size-base`, `--mw-line-height`, `--mw-h1-size` through `--mw-h6-size`
   - **Headings:** `--mw-heading-color`, `--mw-h6-color`
   - **Links:** `--mw-link-color`, `--mw-link-broken-color`
   - **Blockquotes:** `--mw-blockquote-border`, `--mw-blockquote-fg`, `--mw-blockquote-bg`
   - **Inline code:** `--mw-inline-code-bg`, `--mw-inline-code-fg`
   - **Tables:** `--mw-table-border`, `--mw-table-bg`, `--mw-table-header-bg`, `--mw-table-stripe-bg`
   - **Code blocks (pass-through):** `--mw-codeblock-bg`, `--mw-codeblock-border` — these always map to `--vscode-textCodeBlock-background` etc., never overridden by themes
   - **Editor chrome:** `--mw-selection-bg`, `--mw-cursor-color`, `--mw-gutter-bg`, `--mw-gutter-fg`, `--mw-gutter-border`, `--mw-line-highlight-bg`
   - **UI elements:** `--mw-breadcrumb-bg`, `--mw-breadcrumb-fg`, `--mw-breadcrumb-border`, `--mw-widget-border`, `--mw-button-bg`, `--mw-button-fg`, `--mw-button-hover-bg`, `--mw-badge-bg`, `--mw-badge-fg`, `--mw-hr-color`, `--mw-list-marker-color`
   - **Semantic:** `--mw-error-color`, `--mw-description-color`, `--mw-highlight-bg`
3. Document which variables are "theme-overridden" vs. "pass-through" (code blocks, Shiki, cursor, selection).

**Files:** Create `webview-ui/src/themes/variables.css`

**Done when:** `variables.css` exists with `:root` defaults covering all ~112 VS Code variable references. Each `--mw-*` variable maps back to its `--vscode-*` equivalent as the default value.

---

### P8-T2: Bundle Fonts (Inter + Merriweather)

**Goal:** Ship Inter and Merriweather `.woff2` files in the extension and inject `@font-face` declarations in the webview HTML.

**Steps:**
1. Download font files (`.woff2` format):
   - Inter: Regular (400), Bold (700)
   - Merriweather: Regular (400), Italic (400i), Bold (700), Bold Italic (700i)
2. Place at `media/fonts/` (e.g., `media/fonts/inter-regular.woff2`, `media/fonts/merriweather-regular.woff2`, etc.)
3. In `src/markdownWeaveEditor.ts` `getHtmlForWebview()`:
   - Generate font URIs via `webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'fonts', '...'))`
   - Inject a `<style nonce="${nonce}">` block before the main stylesheet link containing `@font-face` declarations with `font-display: swap`
   - This follows the same pattern as KaTeX CSS/font loading
4. CSP already has `font-src ${webview.cspSource}` — no CSP changes needed.
5. `media/` is already in `localResourceRoots` — no changes needed.
6. No esbuild changes needed — fonts are static assets, not processed by the bundler.

**Files:**
- Create `media/fonts/*.woff2` (6 files)
- Modify `src/markdownWeaveEditor.ts` — add `@font-face` style block in `getHtmlForWebview()`

**Done when:** Fonts load in the webview without CSP errors. `document.fonts.check('16px Merriweather')` returns `true` in webview DevTools.

---

### P8-T3: Refactor main.css to Use --mw-* Variables

**Goal:** Replace every `--vscode-*` reference in `main.css` with the corresponding `--mw-*` variable. Apply the reading typography defaults.

**Steps:**
1. Add `@import './themes/variables.css';` at the top of `main.css` (esbuild inlines CSS imports).
2. Systematic replacement of all ~99 `--vscode-*` references with `--mw-*` equivalents.
3. **Exception:** Leave the Shiki selectors at lines ~621-640 (`body.vscode-light .shiki span`, `body.vscode-dark .shiki span`) completely unchanged — these must continue using `--shiki-light`/`--shiki-dark` and `body.vscode-*` class selectors for syntax highlighting.
4. Apply typography variables to body: `font-family: var(--mw-font-body)`, `font-size: var(--mw-font-size-base)`, `line-height: var(--mw-line-height)`.
5. Apply `font-family: var(--mw-font-heading)` to heading classes.
6. Apply `font-family: var(--mw-font-code)` to inline code and code-related elements (this variable defaults to VS Code's editor font).
7. Replace hardcoded heading sizes (2em, 1.5em, 1.25em, etc.) with `var(--mw-h1-size)` through `var(--mw-h6-size)`.

**Files:** Modify `webview-ui/src/main.css`

**Done when:** `main.css` has zero `--vscode-*` references outside the Shiki selectors. With only `variables.css` loaded (no theme), the editor looks identical to before (visual regression check).

---

### P8-T4: Refactor editor.ts CM6 Theme to Use --mw-* Variables

**Goal:** Update `markdownWeaveTheme()` to use `--mw-*` variables instead of direct `--vscode-*` references.

**Steps:**
1. Replace all ~13 `--vscode-*` references in the CM6 theme object:
   - `backgroundColor` → `var(--mw-bg)`
   - `color` → `var(--mw-fg)`
   - `fontFamily` → `var(--mw-font-body)`
   - `fontSize` → `var(--mw-font-size-base)`
   - `lineHeight` → `var(--mw-line-height)`
   - Cursor, selection, gutters, active line → corresponding `--mw-*` vars
2. The high-contrast gutter-background conditional can be simplified — `variables.css` defaults handle the fallback. But keep `themeKind` parameter and `themeCompartment.reconfigure()` in the MutationObserver — CM6 caches computed styles and needs reconfiguration to re-read CSS variable values after theme changes.
3. Remove `.cm-content` `caretColor` hardcoding — use `var(--mw-cursor-color)`.

**Files:** Modify `webview-ui/src/editor.ts` (lines ~855-933)

**Done when:** `markdownWeaveTheme()` contains zero `--vscode-*` references. Existing MutationObserver still triggers reconfiguration. Visual behavior unchanged.

---

### P8-T5: Create Theme Stylesheets (Light, Dark, Sepia)

**Goal:** Three reading-optimized theme CSS files with full-override palettes.

**Steps:**
1. **Selector strategy:** Use `data-mw-theme` attribute on `<html>` (not body classes — VS Code owns those). Selectors: `:root[data-mw-theme="light"]`, `:root[data-mw-theme="dark"]`, `:root[data-mw-theme="sepia"]`.

2. Create `webview-ui/src/themes/theme-light.css`:
   - Clean white background (`#ffffff` or `#fafafa`), dark gray text (`#24292e`)
   - Distinct heading color, pleasant blue links
   - Subtle blockquote styling
   - `--mw-font-body: 'Merriweather', Georgia, 'Times New Roman', serif`
   - `--mw-font-heading: 'Inter', -apple-system, 'Segoe UI', sans-serif`
   - `--mw-font-size-base: 16px`, `--mw-line-height: 1.75`
   - Code block variables (`--mw-codeblock-*`) deliberately NOT set — fall through to VS Code defaults

3. Create `webview-ui/src/themes/theme-dark.css`:
   - Dark background (`#0d1117` or `#1a1a2e`), light text (`#c9d1d9`)
   - Muted, eye-friendly heading and link colors
   - Same font stack as light
   - Code block variables NOT set

4. Create `webview-ui/src/themes/theme-sepia.css`:
   - Warm parchment/cream background (`#fdf6e3`), dark brown text (`#5b4636`)
   - Warm accent colors — muted amber links, warm brown headings
   - Terracotta blockquote borders
   - Same font stack
   - Code block variables NOT set

5. When no `data-mw-theme` attribute is present, `:root` defaults from `variables.css` apply (pass-through to VS Code — used for high-contrast).

6. Add `@import` statements for all three theme files in `main.css` (after `variables.css`). esbuild bundles them together; only the matching `[data-mw-theme]` selector activates at runtime.

**Files:**
- Create `webview-ui/src/themes/theme-light.css`
- Create `webview-ui/src/themes/theme-dark.css`
- Create `webview-ui/src/themes/theme-sepia.css`
- Modify `webview-ui/src/main.css` — add `@import` statements

**Done when:** Three theme files exist. Each defines ~30-40 `--mw-*` overrides. Sepia has visually distinct warm tones. Code block variables are absent from all three (fall through to VS Code styling).

---

### P8-T6: Theme Application Logic (Auto-Detection + Observer)

**Goal:** Auto-detect VS Code's theme and apply the matching MW reading theme. Watch for changes.

**Steps:**
1. Create `webview-ui/src/themes/themeManager.ts` exporting:
   - `initTheme()`: Reads `document.body.classList` → maps `vscode-light` to `data-mw-theme="light"`, `vscode-dark` to `data-mw-theme="dark"`, `vscode-high-contrast` to no attribute (pass-through).
   - `observeThemeChanges()`: MutationObserver on `document.body` class attribute. On change, re-runs detection and updates `data-mw-theme`.
2. Keep the existing CM6 and Mermaid MutationObservers untouched — they handle their own reconfiguration. This new observer only manages the `data-mw-theme` attribute. Three independent observers is simpler than coupling them.
3. In `webview-ui/src/main.ts`:
   - Import and call `initTheme()` before `createMarkdownEditor()` — the theme attribute must be set before the editor renders so CSS variables are correct on first paint.
   - Call `observeThemeChanges()` after editor creation.

**Files:**
- Create `webview-ui/src/themes/themeManager.ts`
- Modify `webview-ui/src/main.ts`

**Done when:** On webview load, `<html data-mw-theme="light|dark">` is set based on VS Code theme. Switching VS Code theme updates the attribute. High-contrast mode has no `data-mw-theme` attribute. Sepia CSS exists but is never auto-selected (needs Phase 9 setting).

---

### P8-T7: Integration Testing and Visual Verification

**Goal:** Verify the full theming system works end-to-end with no regressions.

**Steps:**
1. Open a markdown file with rich content (headings, code blocks, tables, blockquotes, links, math, Mermaid, images, frontmatter, wiki links).
2. **Light theme check:** Body text in Merriweather (serif), headings in Inter (sans-serif), code blocks in VS Code's editor font. Background/foreground match the light reading palette. Code blocks retain VS Code's `textCodeBlock` background and Shiki syntax colors.
3. **Dark theme check:** Switch VS Code to dark → MW auto-switches. Shiki highlighting updates. Body text stays Merriweather.
4. **High contrast check:** Switch to high contrast → MW drops custom theming, passes through all VS Code high-contrast variables.
5. **Sepia check:** Manually set `data-mw-theme="sepia"` in DevTools → warm parchment appearance.
6. **CSP check:** No errors in webview console (especially font loading).
7. **Font verification:** Inspect computed `font-family` in DevTools — body shows Merriweather, headings shows Inter.
8. **Shiki check:** `body.vscode-light`/`body.vscode-dark` selectors still correctly switch syntax highlighting.
9. **Mermaid check:** Diagrams re-render correctly on theme switch.
10. **Widget check:** Breadcrumb, table toggles, frontmatter pills, all UI elements use themed colors.

**Done when:** All checks pass. No visual regressions. Theme switching under 100ms perceived.

---

## Task Dependencies

```
P8-T1 (Variables)  ─┬─→ P8-T3 (Refactor main.css) ──┐
                    ├─→ P8-T4 (Refactor editor.ts)  ──┤
                    └─→ P8-T5 (Theme stylesheets)   ──┼─→ P8-T6 (Theme logic) ──→ P8-T7 (Testing)
P8-T2 (Bundle fonts) ─────────────────────────────────┘
```

P8-T1 and P8-T2 can run in parallel. P8-T3, T4, T5 can start once T1 is done. T6 needs T3/T4/T5. T7 needs everything.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| `data-mw-theme` attribute on `<html>` | VS Code owns `body` classes. Separate attribute avoids conflicts. |
| All theme CSS bundled via `@import` (no runtime loading) | Zero FOUC, no async fetch, simpler code. ~2-3KB overhead for three themes. |
| `@font-face` injected in HTML template (not CSS file) | CSS `var()` is invalid inside `@font-face src`. Webview URIs only known at runtime. Same pattern as KaTeX. |
| Code blocks excluded from theme overrides | Design requirement. `--mw-codeblock-*` defaults to `--vscode-*` in `variables.css`; themes don't touch them. Shiki selectors untouched. |
| Three independent MutationObservers | Simpler than coupling CM6 reconfiguration, Mermaid re-render, and theme attribute management. |
| High-contrast = no MW override | `variables.css` maps `--mw-*` → `--vscode-*`. No attribute → defaults apply → VS Code high-contrast colors flow through. |

---

## Phase 9 Impacts

Phase 9 needs the following additions/changes beyond its current plan:

1. **Theme setting** (`markdownWeave.theme`): enum `auto|light|dark|sepia`. When set to non-auto, send to webview → webview sets `data-mw-theme` accordingly (overriding auto-detection). Already partially planned in P9-T1/T3.

2. **Font family settings** (new):
   - `markdownWeave.headingFont`: string accepting preset names (`Inter`, `System Sans`) or any CSS `font-family` value. Default: `Inter`.
   - `markdownWeave.bodyFont`: string accepting preset names (`Merriweather`, `System Serif`) or any CSS `font-family` value. Default: `Merriweather`.
   - Webview applies by setting `--mw-font-heading` / `--mw-font-body` CSS properties.

3. **Font size & line height** (already planned): `markdownWeave.fontSize` (default `16`, not `0`) and `markdownWeave.lineHeight` (default `1.75`). Note defaults changed from original plan.

4. **Custom CSS loading** (moved from P8): `markdownWeave.customCssPath` setting + file watcher + CSS injection in webview. Was P8-T6/T7, now belongs in Phase 9.

---

## Verification

After implementation, verify by:
1. `npm run compile` succeeds — `dist/webview.css` includes all theme definitions
2. F5 → open a rich markdown file → body text renders in Merriweather, headings in Inter
3. Toggle VS Code between light/dark themes → MW reading themes switch automatically
4. Switch to high-contrast → MW passes through VS Code colors
5. DevTools: set `data-mw-theme="sepia"` → warm parchment appearance
6. Code blocks retain VS Code's font and Shiki syntax highlighting in all themes
7. No CSP errors in webview console
8. Mermaid diagrams re-render on theme switch
