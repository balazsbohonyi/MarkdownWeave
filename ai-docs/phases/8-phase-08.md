# Phase 8: Theming & Customization

---

## P8-T1: Base theme CSS

**Goal:** CSS variable system that all theme variants build on.

**Steps:**

1. Create `webview-ui/src/themes/base.css` defining CSS variables for all themed properties:
   - `--mw-heading-color`, `--mw-link-color`, `--mw-code-bg`, `--mw-blockquote-border`, `--mw-hr-color`, `--mw-table-border`, `--mw-table-header-bg`, `--mw-table-alt-row-bg`, etc.
2. Set default values that inherit from VS Code CSS variables where possible.
3. Import in the webview entry point.

**Done when:** All decoration classes use `var(--mw-*)` variables. Changing a variable value changes the appearance.

---

## P8-T2: Light theme variant

**Steps:**

1. Create `light.css` that overrides `--mw-*` variables with light-mode values.
2. Applied when `document.body.classList.contains('vscode-light')` or when `markdownWeave.theme` is `"light"`.

---

## P8-T3: Dark theme variant

Same pattern for dark colors.

---

## P8-T4: Sepia theme variant

**Steps:**

1. Create `sepia.css` with warm tones: off-white/beige background, warm text colors, slightly serif-influenced heading styles.
2. Applied when `markdownWeave.theme` is `"sepia"`.

**Done when:** Selecting sepia theme gives a warm, book-like reading experience.

---

## P8-T5: `markdownWeave.theme` setting + auto-detection

**Steps:**

1. On webview init, read the theme setting from the extension host.
2. If `"auto"`: use `vscode-light`/`vscode-dark` body class to choose light/dark theme.
3. If explicit: apply that theme's CSS class regardless of VS Code theme.
4. Listen for `onDidChangeConfiguration` to re-apply.

**Done when:** Setting `"sepia"` applies sepia even in dark VS Code. Setting `"auto"` follows VS Code.

---

## P8-T6: Custom CSS file loading

**Steps:**

1. Read `markdownWeave.customCssPath` setting.
2. Resolve path relative to workspace root.
3. Read the file content on the extension host and send it to the webview.
4. Webview injects it as a `<style>` tag after the built-in theme (so custom rules override).

**Done when:** A custom CSS file that sets `--mw-heading-color: purple` makes headings purple.

---

## P8-T7: File watcher for custom CSS hot-reload

**Steps:**

1. Create a `FileSystemWatcher` for the custom CSS path.
2. On file change, re-read the CSS and post updated content to the webview.
3. Webview replaces the existing custom `<style>` tag content.

**Done when:** Edit the custom CSS file → save → editor appearance updates without reopening.

---
