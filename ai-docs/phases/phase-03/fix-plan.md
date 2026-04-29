# Phase 3 Fix Plan

## Summary

Fix the tested Phase 3 issues by replacing opaque editing behavior with source-preserving CodeMirror decorations where needed, while keeping the current staged Phase 3 work uncommitted. The implementation will stage the fixes with the existing Phase 3 changes and leave the unstaged `README.md` change untouched.

## Key Changes

- Add shared frontmatter exclusion so Phase 2 heading/horizontal-rule decorators do not decorate YAML frontmatter. Expanded frontmatter stays raw until cursor leaves or Esc is pressed, and the pill label becomes `Frontmatter`.
- Add optimistic active-line heading styling: while the cursor is on a line starting with `#` through `######`, apply heading sizing even before the required space is typed. Do not auto-insert spaces or treat invalid syntax as a real parsed heading.
- Rework fenced code blocks from opaque replacement widgets into editable CodeMirror source with Shiki v4 token decorations:
  - inactive state hides fences but shows a language label/header and highlighted code;
  - active state shows fences/language plus editable highlighted code;
  - normal Ctrl+V inserts `text/plain` once, preserving indentation and line breaks;
  - Tab inside code follows VS Code indentation settings, falling back to the current tab size.
- Update bridge/host interfaces so init/update messages include document EOL and indentation settings, and Shiki responses can return token ranges/classes instead of only HTML. Apply edits against normalized snapshots but map back to VS Code line/character ranges so CRLF files remain CRLF.
- Make table raw mode sticky while the cursor remains inside the table range. Arrow/click navigation inside raw tables must not immediately collapse back to preview.
- Add universal keyboard entry for collapsed block widgets: arrowing into code, display math, Mermaid, HTML, or table blocks reveals source at the logical edge instead of skipping the block.
- Request CodeMirror remeasurement after async widget changes: KaTeX render, Mermaid render, HTML image URI resolution, sanitizer fallback updates, and any dynamic widget height changes. This targets click-offset and cursor-jump bugs after tables, HTML, math, and Mermaid.
- Extend math scanning to support both multiline display blocks and single-line `$$ ... $$` display math, including long formulas. Keep conservative inline `$...$` handling for currency/escaped dollars.
- Render allowed HTML `<img>` tags both standalone and inline, resolving relative paths through the existing host image resolver. Unsafe or unsupported HTML should not silently disappear: dangerous blocks keep the sanitizer placeholder, unsupported inline HTML remains raw unless explicitly rendered.
- Configure Mermaid to use SVG text labels (`htmlLabels: false`) under strict sanitization so labels and emoji render without allowing HTML label content.

## Test Plan

- Run `npm.cmd run check-types`, `npm.cmd run compile`, and `npm.cmd run lint`.
- Add `manual-tests/phase-03-test-document.md` based on the attached document, using a repo-local existing image path for the HTML image case.
- Manually verify in the Extension Development Host:
  - heading typing does not visually flicker for `##Heading` before the space is added;
  - frontmatter raw mode shows literal `---` markers and normal YAML text, with no HR/heading styling;
  - code blocks show language labels inactive, reveal fences active, keep syntax highlighting, support selection, arrow navigation, plain paste, and Tab indentation;
  - tables stay raw during up/down/left/right editing and clicks land on the intended raw line;
  - clicks below tables and HTML blocks land correctly after async rendering;
  - local HTML images render, `<script>` remains sanitized, and unsafe attributes/URLs are stripped;
  - inline math, multiline display math, and single-line long display math render and reveal raw source by keyboard;
  - Mermaid labels and emoji are visible.

## Assumptions

- Keep Phase 3 changes staged and do not commit.
- Do not add a full automated test harness in this pass; use a tracked manual fixture plus compile/type/lint checks.
- Keep Phase 3 table editing raw-source only; no cell-level editing.
- Keep Shiki v4, curated language loading, CSP-safe generated CSS/classes, and unknown-language plaintext fallback.
