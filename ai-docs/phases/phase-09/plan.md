# Phase 9: Settings & Configuration

---

## P9-T1: Register all settings in `contributes.configuration`

**Steps:**

1. Add all settings under `markdownWeave.*` in `package.json`:
   - `theme`: enum (`auto`, `light`, `dark`, `sepia`), default `"auto"`.
   - `customCssPath`: string, default `""`.
   - `imageAssetsPath`: string, default `"assets"`.
   - `fontSize`: number, default `0` (0 = inherit from VS Code).
   - `lineHeight`: number, default `1.6`.
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
   - `theme` → switch CSS class.

**Done when:** Disabling `enableMermaid` → Mermaid blocks render as regular code blocks. Re-enabling → diagrams render again.

---
