# Phase 4: Wiki Links & Link Validation

---

## P4-T1: Wiki link parser extension for CM6 Lezer grammar

**Goal:** Teach the Lezer markdown parser to recognize `[[...]]` syntax as a distinct node type.

**Steps:**

1. Create a custom `MarkdownExtension` for `@codemirror/lang-markdown` that defines an inline parser for wiki links.
2. The parser should:
   - Match opening `[[`.
   - Consume content until `]]` or `|` (for alias syntax).
   - Emit a `WikiLink` node with children: `WikiLinkTarget` (the page name), optionally `WikiLinkAlias` (display text after `|`), and optionally `WikiLinkHeading` (text after `#`).
3. Register the extension in the CM6 `markdown()` language config.

**Done when:** `syntaxTree(state)` shows `WikiLink` nodes for `[[page]]`, `[[page|alias]]`, `[[page#heading]]`.

---

## P4-T2: `[[page]]` basic rendering + decoration hide/show

**Goal:** Wiki links render as styled link text with brackets hidden.

**Steps:**

1. Register decoration handler for the `WikiLink` node type (from P4-T1).
2. When cursor **outside**:
   - `Decoration.replace` on `[[` and `]]` to hide brackets.
   - `Decoration.mark` on the link text with class `mw-wikilink` (styled like links).
3. When cursor **inside**: raw `[[page]]` visible.

**Done when:** `[[my-page]]` renders as "my-page" in link styling. Cursor entering reveals `[[my-page]]`.

---

## P4-T3: Alias syntax `[[page|display text]]` rendering

**Goal:** `[[page|display text]]` renders showing only "display text".

**Steps:**

1. When the `WikiLink` node has a `WikiLinkAlias` child:
   - `Decoration.replace` on `[[page|` to hide the target and pipe.
   - `Decoration.replace` on `]]` to hide closing brackets.
   - Display only the alias text, styled as a link.
2. When cursor **inside**: full `[[page|display text]]` visible.

**Done when:** `[[long-page-name|Short Name]]` renders as "Short Name".

---

## P4-T4: Section links `[[page#heading]]` rendering

**Goal:** `[[page#heading]]` renders with the page reference visible.

**Steps:**

1. When the `WikiLink` node has a `WikiLinkHeading` child (text after `#`):
   - Render "page > heading" or just "heading" as the visible text (configurable preference).
   - Hide `[[`, `]]`, and optionally `#`.
2. When cursor **inside**: full `[[page#heading]]` visible.

**Done when:** `[[setup-guide#installation]]` renders as styled link text.

---

## P4-T5: File existence check

**Goal:** Extension host checks whether the target file of a wiki link exists in the workspace.

**Steps:**

1. When the webview encounters a `WikiLink` node during decoration, post `{ type: 'checkWikiLink', target: 'page-name', id: nodeId }` to extension host.
2. Extension host:
   - Search the workspace for a file named `{target}.md` or `{target}.markdown` (case-insensitive).
   - Search recursively in the workspace root.
   - Respond with `{ type: 'wikiLinkStatus', id: nodeId, exists: boolean, uri?: string }`.
3. Cache results per file path. Invalidate on `workspace.onDidCreateFiles`, `onDidDeleteFiles`, `onDidRenameFiles`.
4. Batch-process wiki link checks on document load (post all targets in one message).

**Done when:** Extension host correctly reports whether `[[my-page]]` targets an existing file.

---

## P4-T6: Broken link styling

**Goal:** Wiki links to non-existent files are styled differently (red/dimmed).

**Steps:**

1. When the file existence check (P4-T5) returns `exists: false`:
   - Apply `Decoration.mark` with class `mw-wikilink-broken` (red text or dimmed opacity + dashed underline).
2. When `exists: true`: normal link styling.
3. Update styling when file existence changes (file created/deleted).

**Done when:** `[[nonexistent-page]]` renders in red. Creating the file changes it to normal link color.

---

## P4-T7: Ctrl+Click on wiki link opens target file

**Goal:** Ctrl+Click on a wiki link navigates to the target markdown file.

**Steps:**

1. In the click handler (from P2-T9's Ctrl+Click infrastructure), also check for `WikiLink` nodes.
2. If Ctrl+Click on a wiki link and the target exists:
   - Post `{ type: 'openWikiLink', target }` to extension host.
   - Extension host finds the file URI (from the cache in P4-T5) and calls `vscode.window.showTextDocument(uri)`.
3. If the target doesn't exist, optionally offer to create it (stretch goal — can skip for v1).

**Done when:** Ctrl+Click on `[[existing-page]]` opens that file in VS Code.

---

