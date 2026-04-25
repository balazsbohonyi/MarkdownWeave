# Phase 3: Block Widgets & Advanced Rendering

---

## P3-T1: Fenced code block widget shell

**Goal:** Fenced code blocks render in a styled container; raw source (including fences) shows when cursor enters.

**Steps:**

1. Register handler for Lezer node type `FencedCode`.
2. When cursor **outside**:
   - `Decoration.replace({ block: true, widget: new CodeBlockWidget(code, lang) })`.
   - Widget renders a `<pre><code>` container with class `mw-codeblock`.
   - Parse the `CodeInfo` child to extract the language identifier.
   - Initially render plain (unhighlighted) code — Shiki integration comes in P3-T3.
   - Style: `var(--vscode-textCodeBlock-background)`, border-radius, padding.
3. When cursor **inside**: full raw source visible including ` ``` ` fences and language identifier.
4. Use a `StateField` (not just `ViewPlugin`) since code blocks span multiple lines — documented CM6 requirement for block widgets.

**Done when:** Fenced code blocks render in a styled box (no syntax highlighting yet). Cursor entering shows ` ```js\ncode\n``` `.

---

## P3-T2: Shiki v3 setup on extension host

**Goal:** Shiki highlighter initialized on the extension host (Node side) with the JS regex engine and on-demand language loading.

**Steps:**

1. Install `shiki` (v3+).
2. In `src/shikiHighlighter.ts`, create a singleton module:
   - Call `createHighlighterCore({ engine: createJavaScriptRegexEngine() })` on activation.
   - Pre-load a small set of common languages (JS, TS, JSON, HTML, CSS, Python, Bash, Markdown).
   - Expose `highlight(code: string, lang: string): Promise<string>` that:
     - Checks if the language grammar is loaded; if not, dynamically imports from `@shikijs/langs/{lang}` and loads it.
     - Falls back to plaintext if the language is unknown.
     - Returns highlighted HTML string.
3. Load dual themes: `github-light` and `github-dark` (or VS Code's `light-plus` / `dark-plus`).

**Done when:** `highlight('const x = 1;', 'typescript')` returns an HTML string with `<span style="color:...">` tokens.

---

## P3-T3: Shiki highlighting pipeline

**Goal:** Code blocks in the webview display syntax-highlighted code rendered by Shiki on the extension host.

**Steps:**

1. When the webview needs highlighting for a code block (on init and on code block content change):
   - Post `{ type: 'highlight', id: blockId, code, lang }` to extension host.
2. Extension host calls `shikiHighlighter.highlight(code, lang)` and responds with `{ type: 'highlighted', id: blockId, html }`.
3. Webview receives the response and updates the matching `CodeBlockWidget`'s inner HTML.
4. Debounce re-highlight requests (250ms) for code blocks being actively edited.
5. Batch multiple highlight requests into a single message if several code blocks are visible.

**Done when:** Code blocks show syntax-highlighted code. Changing the language identifier re-highlights.

---

## P3-T4: Shiki dual-theme output

**Goal:** Code blocks automatically switch between light and dark highlighting when VS Code's theme changes.

**Steps:**

1. Configure Shiki with `themes: { light: 'github-light', dark: 'github-dark' }`.
2. Highlighted output uses CSS variables: `style="color:var(--shiki-light);--shiki-dark:#xxx"`.
3. In the webview CSS, add rules that swap `--shiki-light` / `--shiki-dark` based on the `vscode-light` / `vscode-dark` body class.
4. No re-render needed on theme change — CSS handles the switch.

**Done when:** Switch VS Code theme → code block colors update instantly without re-highlighting.

---

## P3-T5: Lazy code block highlighting

**Goal:** Only code blocks visible in the viewport are highlighted; off-screen blocks show plain text until scrolled into view.

**Steps:**

1. On initial render, code block widgets render plain `<pre><code>` with unhighlighted text.
2. Attach an `IntersectionObserver` with `rootMargin: "200%"` (two viewport heights of overscan) to each code block widget's DOM element.
3. When a code block enters the observed area, trigger a highlight request to the extension host.
4. Cache highlighted results by content hash + language — re-highlight only if content changes.
5. When a code block leaves the viewport (scrolls far away), optionally replace with plain text to reduce DOM complexity (low priority).

**Done when:** Opening a file with 50 code blocks highlights only the visible ones. Scrolling triggers highlighting for newly visible blocks.

---

## P3-T6: Table rendering as HTML table widget (read-only)

**Goal:** GFM pipe tables render as styled HTML `<table>` elements.

**Steps:**

1. Register handler for Lezer node type `Table`.
2. Parse table structure: extract header row, delimiter row (for alignment), and body rows.
3. When cursor **outside**:
   - `Decoration.replace({ block: true, widget: new TableWidget(headers, rows, alignments) })`.
   - Widget renders `<table>` with `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`.
   - Apply column alignment from delimiter row (`:---`, `:---:`, `---:`).
   - Style with VS Code theme vars: border color, header background, alternating row backgrounds.
4. Table is **read-only** in v1 — clicking into it reveals raw source.
5. When cursor **inside**: raw pipe-table source visible.

**Done when:** Pipe tables render as styled HTML tables. Column alignment works.

---

## P3-T7: Table raw-source toggle button

**Goal:** Tables have a small toggle button that switches between rendered view and raw pipe-table source.

**Steps:**

1. Add a small icon button (e.g., `<>` icon) to the top-right corner of the `TableWidget`.
2. Clicking the button:
   - If currently rendered: remove the widget decoration → raw source visible (equivalent to "placing cursor inside").
   - If currently raw: re-apply the widget decoration → rendered table visible.
3. Implement as a `StateEffect` that adds/removes the table's range from a "force-raw" `StateField`.
4. The decoration infrastructure (P2-T5) checks this field in addition to cursor position.

**Done when:** Clicking the toggle button switches the table between rendered and raw view, independent of cursor position.

---

## P3-T8: KaTeX setup (on-demand loading)

**Goal:** KaTeX library loaded only when math syntax is detected in the document.

**Steps:**

1. Install `katex`.
2. In the webview, do NOT import KaTeX at the top level.
3. Create a lazy loader: `let katexPromise: Promise<typeof katex> | null = null; function loadKaTeX() { return katexPromise ??= import('katex'); }`.
4. On document init, scan for `$` or `$$` tokens in the Lezer tree. If found, trigger `loadKaTeX()`.
5. Include KaTeX CSS as a `<link>` tag that is only added to the DOM when KaTeX is loaded.

**Done when:** Documents without math: KaTeX is never loaded (verify via Network tab). Documents with math: KaTeX loads on first encounter.

---

## P3-T9: Inline math (`$...$`) decoration

**Goal:** Inline math renders as a formatted equation; cursor entering reveals raw LaTeX source.

**Steps:**

1. The Lezer markdown parser doesn't natively support `$` math. Add a custom parser extension or use `@lezer/markdown`'s `defineNodes` / `parseInline` to recognize `$...$`.
2. Register decoration handler for the custom math node type.
3. When cursor **outside**:
   - `Decoration.replace` with a `MathWidget` that calls `katex.renderToString(tex, { displayMode: false, throwOnError: false })`.
   - On render error, show the raw source with a red underline.
4. When cursor **inside**: raw `$E = mc^2$` visible.

**Done when:** `$E = mc^2$` renders as a formatted inline equation. Cursor entering reveals the LaTeX source.

---

## P3-T10: Display math (`$$...$$`) block widget

**Goal:** Block math renders as a centered equation.

**Steps:**

1. Recognize `$$...$$` blocks (multi-line) via custom Lezer extension or post-parse scan.
2. When cursor **outside**:
   - `Decoration.replace({ block: true, widget: new DisplayMathWidget(tex) })`.
   - Widget calls `katex.renderToString(tex, { displayMode: true })`.
   - Centered horizontally with margin.
3. When cursor **inside**: raw `$$\n...\n$$` visible.
4. Re-render on content change (debounced 300ms).

**Done when:** Multi-line math blocks render as centered equations.

---

## P3-T11: Mermaid diagram block widget

**Goal:** Code blocks with ` ```mermaid ` fence render as SVG diagrams.

**Steps:**

1. Install `mermaid` as a dependency.
2. Lazy-load Mermaid only when a mermaid code block is detected (same pattern as P3-T8).
3. In the `CodeBlockWidget`, check if `lang === 'mermaid'`. If so, instead of Shiki highlighting, use Mermaid rendering.
4. Call `mermaid.render('mermaid-' + blockId, code)` to produce SVG.
5. Debounce re-render on content change (500ms — Mermaid is slower than KaTeX).
6. On render error, show the raw code with an error message below.
7. Apply theme: call `mermaid.initialize({ theme: isDarkTheme ? 'dark' : 'default' })` on theme change.
8. Cursor entering reveals raw mermaid source code.

**Done when:** ` ```mermaid\nflowchart TD\n  A-->B\n``` ` renders as an SVG flowchart.

---

## P3-T12: Frontmatter collapse/expand pill widget

**Goal:** YAML frontmatter collapses into a small pill by default; clicking expands to show raw YAML.

**Steps:**

1. Detect frontmatter: first line of document is `---`, followed by YAML, followed by closing `---`.
2. Use the `remark-frontmatter` plugin or a manual scan for the opening/closing `---` delimiters.
3. When collapsed (default state):
   - `Decoration.replace({ block: true, widget: new FrontmatterPillWidget() })` spanning the entire frontmatter range.
   - Pill widget renders a small clickable badge: `📋 Frontmatter` or just `---` in a rounded container.
4. When expanded (user clicked the pill):
   - Remove the replacement decoration → raw YAML visible.
   - Maintain a `StateField<boolean>` for frontmatter expanded/collapsed state.
5. Clicking the pill toggles the `StateField` via a `StateEffect`.
6. Clicking away from the frontmatter or pressing Esc collapses it again.

**Done when:** Document with frontmatter shows a collapsed pill. Clicking expands to raw YAML. Clicking away collapses.

---

## P3-T13: Embedded HTML rendering (with sanitization)

**Goal:** HTML tags within markdown render as actual HTML, with XSS-dangerous elements stripped.

**Steps:**

1. Register handler for Lezer node types: `HTMLTag`, `HTMLBlock`.
2. Sanitization allowlist: `mark`, `sup`, `sub`, `kbd`, `abbr`, `details`, `summary`, `div`, `span`, `table`, `tr`, `td`, `th`, `thead`, `tbody`, `br`, `hr`, `img` (with `src`/`alt`/`width`/`height` only).
3. Strip: `script`, `iframe`, `object`, `embed`, `form`, `input`, `textarea`, `button`, `link`, `style`, all `on*` event handler attributes, `javascript:` URIs.
4. For inline HTML (e.g., `<mark>text</mark>`):
   - `Decoration.mark` with a custom CSS class that applies the HTML element's styling.
5. For block HTML (e.g., `<details><summary>...`):
   - `Decoration.replace({ block: true, widget: new HtmlBlockWidget(sanitizedHtml) })`.
6. Cursor entering the HTML region reveals raw source.

**Done when:** `<kbd>Ctrl+C</kbd>` renders with keyboard styling. `<script>alert('xss')</script>` is stripped — no script execution.

---
