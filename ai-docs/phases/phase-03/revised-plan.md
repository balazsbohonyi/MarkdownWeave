# Phase 3 Implementation Plan Review

## Summary

Implement Phase 3 sequentially, but treat the original Phase 3 plan as amended by Phase 2 decisions and these planning decisions:

- Use Shiki v4, not v3.
- Preserve Phase 2 reveal semantics: focus-gated raw reveal, delayed pointer-selection reveal, broad non-empty selection reveal, and semantic styling in raw mode where practical.
- Create `ai-docs/phases/phase-03/decisions.md` at the start of implementation, add its link in `ai-docs/tasks.md`, and log the Phase 3 deviations below.

## Key Changes

- Add a block-widget decoration layer backed by `StateField` for multi-line replacements. Keep existing inline `ViewPlugin` decorations, but extract shared selection-reveal logic so block widgets and inline decorations rebuild consistently.
- Add dependencies: `shiki@^4`, `@shikijs/transformers@^4`, `katex`, `mermaid`, and `dompurify`.
- Update Shiki implementation to use the JavaScript regex engine, a curated static language map, `light-plus`/`dark-plus`, and class-based CSS output via Shiki transformers. Do not loosen CSP with `unsafe-inline`.
- Add a nonce-backed dynamic style path for generated Shiki CSS and Mermaid SVG styles; verify generated Shiki HTML has no inline `style=` attributes.
- Use session-only CM6 state for table forced-raw toggles and frontmatter expansion. Do not persist these via `vscode.setState()` in Phase 3.

## Implementation Details

- Documentation first:
  - Create `ai-docs/phases/phase-03/decisions.md` with `## Deviations From Plan` and `## Decisions`.
  - Record Shiki v4 override, class-based Shiki CSS, curated language loading, conservative math scanning, DOMPurify sanitization, local HTML image resolution, simple-pair inline HTML scope, and session-only raw state.
  - Update Shiki references in project docs from v3 to v4 if implementation touches documentation beyond the decisions file.

- Code blocks and Shiki:
  - P3-T1 adds `CodeBlockWidget` and a block decoration field for `FencedCode`.
  - P3-T2 adds `src/shikiHighlighter.ts` using Shiki v4 with `createJavaScriptRegexEngine`.
  - Lazy-load only curated grammars: JavaScript, TypeScript, JSON, HTML, CSS, Python, Bash/Shell, Markdown, and plaintext aliases; unknown languages render as text.
  - P3-T3/P3-T5 add batched webview-host highlight messages, content-hash caching, 250ms debounce, and `IntersectionObserver` with `root: view.scrollDOM` and `rootMargin: "200%"`.
  - P3-T4 switches themes through CSS classes/variables only; theme changes must not require re-highlighting.

- Advanced widgets:
  - Tables use Lezer GFM table nodes, render read-only HTML, support alignment, and expose a raw-source toggle backed by a mapped `StateField`.
  - Math uses conservative scanners for `$...$` and `$$...$$`, skipping code/link/image ranges and escaped/currency-like dollars. KaTeX loads only after math is detected.
  - Mermaid is handled as a special fenced-code language, lazy-loaded, debounced at 500ms, sanitized, themed from VS Code body classes, and re-rendered on theme changes.
  - Frontmatter uses a manual first-document-range scanner because current Lezer parsing treats it as markdown, not frontmatter.
  - Embedded HTML uses DOMPurify with the Phase 3 allowlist. Render simple balanced same-line inline pairs; complex inline HTML stays raw. Resolve sanitized local `<img src>` values through the existing host URI resolver and use deterministic missing-image fallback behavior.

## Test Plan

- Run `npm run compile`, `npm run check-types`, and `npm run lint`.
- Manually verify in the Extension Development Host:
  - code block raw reveal, highlighting, unknown-language fallback, language changes, lazy highlighting with many blocks, and theme switching without re-highlight;
  - non-empty selection reveals all intersecting block widgets, pointer drag selection does not cause layout jumps, and blur returns to preview mode;
  - table rendering, alignment, raw toggle, and read-only behavior;
  - KaTeX lazy loading, inline/display math rendering, and invalid math fallback;
  - Mermaid lazy loading, debounced rerender, theme changes, and invalid diagram fallback;
  - frontmatter collapsed-by-default, click expand, click-away/Esc collapse;
  - `<kbd>Ctrl+C</kbd>` renders, `<script>` never executes, unsafe attributes/URIs are stripped, and local HTML images resolve or show fallback.
- Verify source preservation by editing, saving, closing, reopening, and confirming markdown bytes are unchanged except for intentional user edits.

## Assumptions And References

- Defaults selected during planning: class-based Shiki CSS, conservative math scanning, DOMPurify, curated Shiki language map, local HTML image resolution, simple inline HTML pairs, `light-plus`/`dark-plus`, and session-only widget raw state.
- Phase 3 does not add table cell editing, MDX support, export, or collaborative behavior.
- Shiki v4 references used: [regex engines](https://github.com/shikijs/shiki/blob/main/docs/guide/regex-engines.md), [transformerStyleToClass](https://github.com/shikijs/shiki/blob/main/docs/packages/transformers.md), and [dual themes](https://github.com/shikijs/shiki/blob/main/docs/guide/dual-themes.md).
