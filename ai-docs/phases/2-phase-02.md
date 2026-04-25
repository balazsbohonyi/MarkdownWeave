# Phase 2: CodeMirror 6 Integration & Core Inline Decorations

---

## P2-T1: Install CM6 packages and instantiate `EditorView` in webview

**Goal:** A functional CodeMirror 6 text editor running inside the webview.

**Steps:**

1. Install: `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, `@codemirror/language`, `@codemirror/commands`, `@codemirror/history`.
2. In `webview-ui/src/editor.ts`, create an `EditorView` configuration:
   - `doc`: initial content received from the extension host.
   - Extensions: `markdown()` language, `history()`, `defaultKeymap`, `historyKeymap`.
   - Mount to `document.getElementById('editor')`.
3. Verify basic editing: typing, selecting, backspace, arrow keys all work.
4. Verify the Lezer markdown syntax tree is available via `syntaxTree(state)`.

**Done when:** Webview shows a working text editor with markdown content. `syntaxTree(view.state).toString()` in DevTools shows parsed markdown nodes.

---

## P2-T2: Bridge CM6 transactions to the extension host edit pipeline

**Goal:** Every CM6 transaction that changes the document is forwarded to the extension host as an edit.

**Steps:**

1. Add an `EditorView.updateListener` extension that fires on every `ViewUpdate` where `update.docChanged` is true.
2. For each transaction in `update.transactions`, iterate `transaction.changes` and extract `{ fromA, toA, inserted }` (the change spec).
3. Post each change as `{ type: 'edit', from, to, insert: inserted.toString() }` to the extension host.
4. If the update was triggered by an incoming extension sync (P2-T3), skip posting (avoid echo loop).
5. Debounce per P1-T11.

**Done when:** Typing in CM6 → extension host receives edit messages → file marked dirty → save works.

---

## P2-T3: Bridge extension host document changes to CM6 state updates

**Goal:** When the extension host sends an `update` message (external file change), CM6's document state updates without disrupting the user.

**Steps:**

1. On receiving `{ type: 'update', content, source: 'extension' }`, compare `content` with `view.state.doc.toString()`.
2. If different, compute a minimal diff (e.g., using a simple LCS or just full replace for v1) and dispatch a CM6 transaction with the changes.
3. Tag the transaction with an annotation (e.g., `externalUpdate.of(true)`) so P2-T2 knows to skip forwarding it.
4. Preserve cursor position: capture `view.state.selection` before the update, remap it through the changes via `selection.map(changes)`, and set the new selection.

**Done when:** Edit file externally → CM6 updates → cursor stays in reasonable position → no echo loop.

---

## P2-T4: Apply VS Code theme CSS variables to CM6 base theme

**Goal:** CM6 editor visually matches the active VS Code theme.

**Steps:**

1. Create a CM6 theme via `EditorView.theme({...})` that maps:
   - `&`: `background: var(--vscode-editor-background)`, `color: var(--vscode-editor-foreground)`.
   - `.cm-cursor`: `border-color: var(--vscode-editorCursor-foreground)`.
   - `.cm-selectionBackground`: `background: var(--vscode-editor-selectionBackground)`.
   - `.cm-gutters`: VS Code gutter variables.
   - Font: `var(--vscode-editor-font-family)`, `var(--vscode-editor-font-size)`.
2. Detect `vscode-light` / `vscode-dark` / `vscode-high-contrast` body class for any decoration-specific color overrides.
3. Add a `MutationObserver` on `document.body` to detect theme class changes and reconfigure CM6 if needed.

**Done when:** Switching VS Code between light and dark themes updates the CM6 editor colors instantly.

---

## P2-T5: Build decoration infrastructure — `ViewPlugin` + selection-aware show/hide

**Goal:** Reusable infrastructure that all decoration types (headings, bold, links, etc.) build on top of.

**Steps:**

1. Create `webview-ui/src/decorations/index.ts` as the central decoration orchestrator.
2. Create a `ViewPlugin` that:
   - On `update` (doc change or selection change), walks the Lezer syntax tree via `syntaxTree(state).iterate()`.
   - For each markdown node, checks if the current selection intersects the node's range.
   - If selection is **outside** the node: emits decorations (hide markers, apply styles).
   - If selection is **inside** the node: emits no decorations (raw source visible).
3. Define the selection-intersection check as a helper in `selectionUtils.ts`: `isEditing(state: EditorState, from: number, to: number): boolean` — returns true if any selection range overlaps `[from, to]`.
4. For **block-level** elements (headings, code blocks, blockquotes): check at the full block range.
5. For **inline** elements (bold, italic, links, inline code): check at the individual inline element range (sub-block granularity).
6. Return a `DecorationSet` that merges all decorations sorted by position.
7. Export a pattern for registering individual decoration handlers (each handler receives a node type and returns decorations for it).

**Done when:** Infrastructure exists. A dummy decoration (e.g., highlighting all headings with a yellow background) works and disappears when the cursor enters the heading.

---

## P2-T6: Heading decoration (h1–h6, ATX + setext)

**Goal:** Headings render as styled large text with `#` markers hidden; raw source appears when the caret enters the heading.

**Steps:**

1. Register a decoration handler for Lezer node types `ATXHeading1` through `ATXHeading6` and `SetextHeading1`/`SetextHeading2`.
2. When cursor is **outside** the heading:
   - `Decoration.replace` on the `#` prefix (and space after) to hide it.
   - `Decoration.mark` on the heading text with CSS class `mw-h1` through `mw-h6`.
   - For setext headings, `Decoration.replace` on the `===`/`---` underline to hide it.
3. CSS for heading classes: decreasing font sizes (h1: 2em, h2: 1.5em, h3: 1.25em, etc.), bold weight.
4. When cursor is **inside**: no decorations → raw `## Heading text` visible.

**Done when:** Headings render large and bold without `#`. Arrow-keying into a heading reveals the raw `##`. Arrow-keying away re-renders.

---

## P2-T7: Bold / italic / strikethrough inline decoration (sub-block granularity)

**Goal:** Emphasis markers are hidden and text is styled; individual inline elements reveal their markers when the cursor is inside them (not the whole paragraph).

**Steps:**

1. Register handlers for Lezer node types: `StrongEmphasis`, `Emphasis`, `Strikethrough`.
2. For each node, identify the marker children (`EmphasisMark` — the `*`, `**`, `~~` tokens).
3. When cursor is **outside this specific inline node**:
   - `Decoration.replace` on marker tokens to hide them.
   - `Decoration.mark` on the content span with `font-weight: bold`, `font-style: italic`, or `text-decoration: line-through`.
4. When cursor is **inside this specific inline node**: no decorations on this node (but other inline nodes in the same paragraph stay decorated).
5. Handle nesting: `***bold italic***` has nested `Emphasis` inside `StrongEmphasis` — both layers of markers must be managed.

**Done when:** A paragraph with `some **bold** and *italic* text` — clicking on "bold" reveals `**bold**`, while "italic" stays rendered. Clicking elsewhere renders both.

---

## P2-T8: Inline code decoration

**Goal:** Inline code rendered with monospace + background; backtick markers hidden; sub-block reveal.

**Steps:**

1. Register handler for Lezer node type `InlineCode`.
2. Identify `CodeMark` children (the backtick tokens).
3. When cursor **outside**: `Decoration.replace` on backticks, `Decoration.mark` on content with class `mw-inline-code` (monospace font, `var(--vscode-textCodeBlock-background)` background, padding, border-radius).
4. When cursor **inside**: no decorations (backticks visible).
5. Handle double-backtick variants (`` ``code with `backtick` `` ``).

**Done when:** Inline code shows styled code without backticks. Cursor entering reveals backticks.

---

## P2-T9: Link decoration + Ctrl+Click to follow

**Goal:** Links render as styled clickable text with URL hidden; Ctrl+Click follows the link; regular click edits.

**Steps:**

1. Register handler for Lezer node type `Link`.
2. Identify child nodes: `LinkMark` (`[`, `]`), `URL` (the `(url)` part including parens), `LinkTitle`.
3. When cursor **outside the link node**:
   - `Decoration.replace` on `[` and `](url)` to hide.
   - `Decoration.mark` on the link text with class `mw-link` (underline, blue color from `var(--vscode-textLink-foreground)`).
4. When cursor **inside**: no decorations → full `[text](url)` visible.
5. Handle auto-links (`<https://...>`), reference links (`[text][ref]`).
6. Ctrl+Click handling:
   - In the `EditorView.domEventHandlers`, intercept `click` events with `event.ctrlKey || event.metaKey`.
   - Determine if the click position maps to a link node.
   - If so, extract the URL and post `{ type: 'openLink', url }` to the extension host.
   - Extension host calls `vscode.env.openExternal(vscode.Uri.parse(url))`.
7. Regular click (no Ctrl): let CM6 place the cursor normally → decoration reveals source.

**Done when:** Links render as blue underlined text. Ctrl+Click opens the URL. Regular click reveals `[text](url)`.

---

## P2-T10: Image decoration (inline preview + `=WxH` resize)

**Goal:** Images render as actual `<img>` previews with drag-to-resize support using the `=WxH` syntax.

**Steps:**

1. Register handler for Lezer node type `Image`.
2. When cursor **outside**:
   - `Decoration.replace({ block: true, widget: new ImageWidget(src, alt, width, height) })`.
   - `ImageWidget` extends `WidgetType`, renders an `<img>` element.
   - Resolve `src` relative to the current file's directory. Post `{ type: 'resolveImageUri', src }` to extension host, which returns a `webview.asWebviewUri` result. Cache the resolved URI.
   - Remote URLs (`https://...`) load directly.
   - If image fails to load, show a placeholder with the alt text.
3. Parse `=WxH` suffix: regex match `![alt](src =(\d+)x(\d+))` for width and height.
4. Drag-to-resize:
   - Add resize handles (bottom-right corner) to the `<img>` wrapper.
   - On drag end, calculate new `WxH` dimensions.
   - Post an edit to update the source: replace the existing `=WxH` or append it after the URL.
   - Edit dispatches as a CM6 transaction via the standard edit pipeline.
5. When cursor **inside**: no decorations → raw `![alt](src =WxH)` visible.

**Done when:** `![photo](./img.png =400x300)` renders a 400×300 image. Drag resize updates the dimensions in the source. Cursor entering reveals raw syntax.

---

## P2-T11: Blockquote decoration

**Goal:** Blockquotes render with a styled left border, `>` markers hidden.

**Steps:**

1. Register handler for Lezer node type `Blockquote`.
2. When cursor **outside**:
   - `Decoration.replace` on each `QuoteMark` (`>`) and trailing space to hide them.
   - `Decoration.line` on each blockquote line with class `mw-blockquote` (left border, left padding, muted text color).
3. Nested blockquotes (`> > text`): apply increasing left-border thickness or multiple colored borders.
4. When cursor **inside**: `>` markers visible.

**Done when:** Blockquotes render with styled left border. Nested blockquotes show increasing depth. Cursor entering reveals `>` markers.

---

## P2-T12: Horizontal rule decoration

**Goal:** `---`, `***`, `___` render as a horizontal line.

**Steps:**

1. Register handler for Lezer node type `HorizontalRule`.
2. When cursor **outside**:
   - `Decoration.replace({ block: true, widget: new HrWidget() })`.
   - `HrWidget` renders an `<hr>` styled element (thin line with theme-appropriate color).
3. When cursor **inside**: raw `---` visible.

**Done when:** `---` renders as a thin horizontal line. Cursor entering reveals the raw characters.

---

## P2-T13: List + checkbox decoration (clickable checkboxes)

**Goal:** Lists render with proper bullets/numbers; checkboxes are clickable to toggle state.

**Steps:**

1. Register handlers for `BulletList`, `OrderedList`, `ListItem`, `Task` (GFM task list extension).
2. Bullet lists: when cursor **outside**, `Decoration.replace` on `- ` / `* ` / `+ ` markers with styled bullet (e.g., `•` character or CSS `::before`). When cursor **inside** the specific list item, raw markers visible.
3. Ordered lists: similar treatment for `1. ` → rendered sequential number.
4. Nested lists: indentation handled via `Decoration.line` with increasing left padding based on nesting level from the Lezer tree.
5. Checkboxes (`- [ ]` / `- [x]`):
   - When cursor **outside**, render `Decoration.replace` on `[ ]` / `[x]` with a styled checkbox `<input type="checkbox">` widget.
   - Checkbox widget has a click handler that:
     - Computes the replacement text (`[ ]` → `[x]` or vice versa).
     - Posts an edit message to the extension host with the exact source offset of the `[ ]`/`[x]` range.
   - The edit flows through the normal `WorkspaceEdit` pipeline → undo works.
6. When cursor **inside** the list item, raw `- [ ] text` visible.

**Done when:** Lists render with bullets/numbers. Checkboxes are clickable. Clicking a checkbox updates the source and is undoable.

---
