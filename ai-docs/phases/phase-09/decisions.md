# Phase 9 Decisions

## Deviations From Plan

### Revised implementation supersedes original plan

The original `plan.md` listed `imageAssetsPath` and only a `useBuiltInFonts` font toggle. The implemented Phase 9 plan is captured in `implementation.md`.

Key differences:

- `imageAssetsPath` was not added; existing `pasteImageFolder` remains the image paste setting.
- `headingFont` and `bodyFont` were added as raw CSS `font-family` overrides.
- Custom CSS loading and file watching were implemented in Phase 9, not deferred.
- Settings are broadcast to every open MarkdownWeave panel with document-resource-scoped values.

## Decisions

### Custom CSS has final normal-CSS precedence

Settings-derived variables are applied through a managed webview style tag, and custom CSS is injected in a later style tag. This lets user CSS override settings values without requiring `!important`.

### Theme overrides are sticky

`markdownWeave.theme = auto` follows VS Code's active theme. Manual `light`, `dark`, and `sepia` selections remain fixed across later VS Code theme changes.

### Font settings use simple precedence

Explicit `headingFont` and `bodyFont` values win per font role. If a role is empty and `useBuiltInFonts` is true, MarkdownWeave uses Inter for headings and Merriweather for body text. Otherwise the CSS variable defaults inherit VS Code fonts.

### Base font size and line height are settings-owned

The light, dark, and sepia theme files do not set `--mw-font-size-base` or `--mw-line-height`. Those variables are controlled by Phase 9 settings so live `fontSize` and `lineHeight` changes are not overridden by the more-specific `:root[data-mw-theme="..."]` theme selectors.

### Code block typography ignores reading typography settings

Code block previews, active fenced-code lines, and language labels use VS Code's editor font family and editor font size baseline. MarkdownWeave reading font settings and base prose font size do not affect Shiki/code block typography.

### Shiki CSS is accumulated across highlighted blocks

The webview keeps all generated Shiki token CSS rules it has received instead of replacing the global Shiki style tag for each highlighted block. Active editable code blocks can reuse cached token decorations from one block while another block's highlight result arrives, so all token classes need to remain available.

### Display math ignores Markdown link exclusions inside `$$` blocks

Display math detection runs with block-level exclusions only. Inline Markdown link nodes inside a `$$...$$` candidate are ignored because TeX bracket syntax such as `\left[...\right]` can otherwise be parsed as a Markdown `Link` and incorrectly prevent KaTeX rendering.

### Renderer toggles leave source visible

Disabling wiki links or math removes the preview decoration path and leaves source text visible. Disabling Mermaid treats `mermaid` fences as regular code blocks instead of showing a placeholder.

### Custom CSS paths are document-workspace-relative

Relative `customCssPath` values resolve from the workspace folder containing the markdown document. Absolute paths are also supported. Missing or unreadable files warn once per editor session and are watched so later creates or edits can update the panel.
