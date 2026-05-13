# Phase 9: Settings & Configuration - Revised Implementation

## Summary

Phase 9 implements MarkdownWeave's user-facing configuration surface and live settings pipeline. The original `plan.md` is superseded where it conflicts with this document.

## Tasks

### P9-T1: Register settings

Register these `markdownWeave.*` settings in `package.json`, each with `description` and `markdownDescription`:

- `theme`: `auto | light | dark | sepia`, default `auto`
- `useBuiltInFonts`: boolean, default `false`
- `headingFont`: string, default `""`, literal CSS `font-family`
- `bodyFont`: string, default `""`, literal CSS `font-family`
- `customCssPath`: string, default `""`
- `fontSize`: number, default `16`, min `10`, max `32`
- `lineHeight`: number, default `1.75`, min `1.0`, max `2.5`
- `enableWikiLinks`: boolean, default `true`
- `enableMath`: boolean, default `true`
- `enableMermaid`: boolean, default `true`
- `openAsDefaultMarkdownEditor`: boolean, default `false`
- Existing `pasteImageFolder`: string, default `""`

Do not add `imageAssetsPath`; pasted image behavior remains controlled by `pasteImageFolder`.

### P9-T2: Host settings listener and broadcast

Subscribe to `workspace.onDidChangeConfiguration`, filter for `markdownWeave`, and send updated settings to every open MarkdownWeave webview. Settings must be read with the markdown document URI so workspace-folder and resource-scoped overrides apply correctly.

### P9-T3: Webview settings application

The host sends one `{ type: "settings", settings }` message on initial webview load and on live changes. The webview applies:

- `theme` through `setThemeOverride()`
- typography through a managed settings `<style>` tag
- custom CSS through a separate later `<style>` tag, so custom CSS wins normal CSS precedence
- renderer toggles through CodeMirror setting-change effects

Manual `theme` values are sticky across VS Code theme changes. `auto` follows VS Code light/dark/high-contrast.

### P9-T4: Fonts and custom CSS

Font precedence is:

1. Non-empty `headingFont` / `bodyFont` for the corresponding role
2. Inter / Merriweather when `useBuiltInFonts=true`
3. VS Code font variables from `variables.css`

Custom CSS behavior:

- Empty `customCssPath` disables and removes custom CSS.
- Relative paths resolve from the workspace folder containing the markdown document.
- Absolute paths are allowed.
- Missing or unreadable CSS warns once per editor session.
- Each resolved custom CSS file is watched; create/change/delete updates affected panels.
- Custom CSS is global to the webview and can style markdown content, widgets, breadcrumbs, and editor chrome.

Renderer toggles:

- `enableWikiLinks=false`: wiki link widgets, status checks, broken-link styling, and Ctrl-click are disabled; `[[...]]` remains visible as plain source text.
- `enableMath=false`: KaTeX widgets are skipped; `$...$` and `$$...$$` remain raw.
- `enableMermaid=false`: `mermaid` fences render as regular code blocks.

### P9-T5: Default Markdown editor setting

Add `markdownWeave.openAsDefaultMarkdownEditor` as an opt-in setting for opening `.md` and `.markdown` files with MarkdownWeave by default.

Implementation behavior:

- Keep `contributes.customEditors[].priority` as `option` so MarkdownWeave does not take over on install.
- Activate on `onStartupFinished` so the setting can be synchronized reliably after VS Code starts.
- When the setting is enabled, write global user `workbench.editorAssociations` entries for `*.md` and `*.markdown` with value `markdownWeave.editor`.
- When the setting is disabled, remove only `*.md` and `*.markdown` entries whose value is exactly `markdownWeave.editor`.
- Preserve all unrelated editor associations and avoid writing when the computed associations are unchanged.
- Show a warning if VS Code rejects the settings update.

## Verification

- `npm run compile`
- `npm run check-types`
- Confirm Settings UI shows all MarkdownWeave settings.
- Confirm live changes apply without reloading webviews.
- Confirm custom CSS loads, overrides settings CSS, updates on file changes, and is removed when the setting is emptied.
- Confirm `pasteImageFolder` behavior is unchanged.
- Confirm enabling `openAsDefaultMarkdownEditor` adds the global `workbench.editorAssociations` entries for `*.md` and `*.markdown`.
- Confirm disabling `openAsDefaultMarkdownEditor` removes only MarkdownWeave-owned Markdown associations.
