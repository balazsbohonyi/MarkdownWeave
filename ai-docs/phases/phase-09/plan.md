# Phase 9: Settings & Configuration

---

## P9-T1: Register all settings in `contributes.configuration`

**Steps:**

1. Add all settings under `markdownWeave.*` in `package.json`:
   - `theme`: enum (`auto`, `light`, `dark`, `sepia`), default `"auto"`.
   - `useBuiltInFonts`: boolean, default `false`. When `true`, uses bundled Inter (headings) + Merriweather (body) fonts instead of VS Code's editor font.
   - `customCssPath`: string, default `""`.
   - `imageAssetsPath`: string, default `"assets"`.
   - `fontSize`: number, default `16` (changed from `0` — see P8 decisions).
   - `lineHeight`: number, default `1.75` (changed from `1.6` — see P8 decisions).
   - `enableWikiLinks`: boolean, default `true`.
   - `enableMath`: boolean, default `true`.
   - `enableMermaid`: boolean, default `true`.
2. Each setting has a `description` and `markdownDescription` for rich docs.

**Done when:** All settings appear in VS Code Settings UI under "MarkdownWeave".

---

## P9-T2: Settings listener with live update

**Steps:**

1. Subscribe to `workspace.onDidChangeConfiguration` in the extension activation.
2. Filter for changes affecting `markdownWeave.*`.
3. When a relevant setting changes, post the new values to all active MarkdownWeave webviews.

**Done when:** Changing any `markdownWeave.*` setting updates the editor without reload.

---

## P9-T3: Settings forwarding to webview on change

**Steps:**

1. On settings change (P9-T2) and on initial webview load (P1-T8):
   - Read all `markdownWeave.*` settings.
   - Post `{ type: 'settings', settings: {...} }` to the webview.
2. Webview stores settings in a module-level variable and applies them:
   - `fontSize` / `lineHeight` → CM6 theme reconfiguration.
   - `enableWikiLinks` / `enableMath` / `enableMermaid` → enable/disable respective decoration handlers.
   - `theme` → call `setThemeOverride()` from `themeManager.ts`.
   - `useBuiltInFonts` → call `setFontOverride()` from `themeManager.ts` (see P9-T4).

**Done when:** Disabling `enableMermaid` → Mermaid blocks render as regular code blocks. Re-enabling → diagrams render again.

---

## P9-T4: Implement `markdownWeave.useBuiltInFonts`

**Goal:** Let users opt-in to the bundled Inter + Merriweather fonts instead of VS Code's default editor font.

**Background:** Phase 8 ships `@font-face` declarations for Inter and Merriweather in the webview HTML, but the theme stylesheets no longer reference them (they fall through to `--vscode-font-family`). This task activates those fonts when the setting is `true`.

**Steps:**

1. In `webview-ui/src/themes/themeManager.ts`, add and export:
   ```typescript
   const BUILT_IN_FONTS = {
     body: "'Merriweather', Georgia, 'Times New Roman', serif",
     heading: "'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
   };

   export function setFontOverride(useBuiltIn: boolean): void {
     const root = document.documentElement;
     if (useBuiltIn) {
       root.style.setProperty('--mw-font-body', BUILT_IN_FONTS.body);
       root.style.setProperty('--mw-font-heading', BUILT_IN_FONTS.heading);
     } else {
       root.style.removeProperty('--mw-font-body');
       root.style.removeProperty('--mw-font-heading');
     }
   }
   ```
   Inline styles on `<html>` take priority over any stylesheet — this is the correct override point.

2. In `main.ts`, call `setFontOverride(settings.useBuiltInFonts)` when handling the `settings` message.

3. Call `setFontOverride` with the initial setting value on the first `init` message (same guard pattern as `observeThemeChanges`).

**Done when:** Setting `markdownWeave.useBuiltInFonts` to `true` switches body text to Merriweather and headings to Inter. Setting it back to `false` reverts to VS Code's font. Change takes effect without reloading the webview.

---
