# Phase 6: Document Outline & Navigation

---

## P6-T1: remark/unified setup for AST analysis on extension host

**Goal:** remark installed and configured on the extension host for document analysis.

**Steps:**

1. Install `remark`, `remark-parse`, `remark-gfm`, `remark-frontmatter`, `unified`.
2. Create `src/remarkAnalyzer.ts` with a function `parseDocument(text: string): Root` that returns the remark AST.
3. Include GFM (tables, task lists, strikethrough) and frontmatter extensions.
4. This module is used for outline extraction, link validation, and future export features.

**Done when:** `parseDocument(markdownText)` returns a full AST with position info on every node.

---

## P6-T2: Heading extraction from document AST

**Goal:** Extract an ordered list of headings with their levels, text content, and line positions.

**Steps:**

1. Walk the remark AST from P6-T1.
2. For each `heading` node, extract: `{ level, text: toString(node), line: node.position.start.line }`.
3. Return as `Heading[]`.

**Done when:** A document with `# Title`, `## Section`, `### Subsection` returns `[{level:1, text:'Title'}, {level:2, text:'Section'}, {level:3, text:'Subsection'}]`.

---

## P6-T3: TreeView provider for outline sidebar

**Goal:** VS Code sidebar panel showing the document's heading structure.

**Steps:**

1. Create `src/outlineProvider.ts` implementing `vscode.TreeDataProvider<HeadingItem>`.
2. Register as a view in `contributes.views` under the Explorer sidebar or a custom activity bar icon.
3. `getChildren()` returns the heading tree: top-level headings as roots, subheadings as children.
4. Each `TreeItem` displays the heading text with an icon indicating level (e.g., `H1`, `H2`).
5. Trigger `_onDidChangeTreeData` when the active document changes or its content changes.

**Done when:** Opening a `.md` file shows its heading structure in the sidebar.

---

## P6-T4: Click-to-scroll — outline item → scroll webview to heading

**Goal:** Clicking a heading in the outline scrolls the editor to that heading.

**Steps:**

1. In the `TreeDataProvider`, set `command` on each `TreeItem` to trigger `markdownWeave.scrollToHeading` with the heading's line number.
2. The command handler posts `{ type: 'scrollToLine', line }` to the active MarkdownWeave webview.
3. In the webview, on receiving `scrollToLine`, call `view.dispatch({ effects: EditorView.scrollIntoView(linePos, { y: 'start' }) })`.
4. Also place the cursor at the heading line.

**Done when:** Click "Installation" in outline → editor scrolls to the `## Installation` heading.

---

## P6-T5: Active heading highlight in outline

**Goal:** The outline highlights which heading the cursor is currently within.

**Steps:**

1. When the cursor moves in the webview, determine the nearest preceding heading (find the heading whose line is ≤ cursor line).
2. Post `{ type: 'cursorHeading', line }` to extension host (debounced 100ms).
3. Extension host updates the outline `TreeView` to highlight the corresponding item (using `treeView.reveal(item, { select: true })`).

**Done when:** Moving the cursor through the document highlights different headings in the outline sidebar.

---

## P6-T6: Outline auto-refresh on document change

**Goal:** Outline updates when the document changes (headings added, removed, renamed).

**Steps:**

1. Listen to `workspace.onDidChangeTextDocument` for the active document.
2. Debounce heading extraction (300ms).
3. Re-parse headings via P6-T2 and fire `_onDidChangeTreeData.fire()` on the `TreeDataProvider`.

**Done when:** Typing a new `## Heading` in the document → outline updates within 300ms.

---

## P6-T7: Breadcrumb bar in webview

**Goal:** A breadcrumb trail at the top of the webview showing the current heading context.

**Steps:**

1. Create a fixed-position breadcrumb bar DOM element above the CM6 editor in the webview.
2. On cursor change, walk backward through the document to find the heading hierarchy (e.g., the current h3 is inside an h2 which is inside an h1).
3. Render breadcrumb segments: `H1 Title > H2 Section > H3 Subsection`.
4. Style with small font, separator icons, theme-appropriate colors.
5. Debounce updates (100ms).

**Done when:** Cursor in a subsection shows the full heading path in the breadcrumb bar.

---

## P6-T8: Breadcrumb click-to-scroll + sibling dropdown

**Goal:** Clicking a breadcrumb segment scrolls to that heading; hovering shows sibling headings at that level.

**Steps:**

1. Each breadcrumb segment is clickable — clicking scrolls the editor to that heading.
2. Each segment has a dropdown arrow that, when clicked, shows a list of sibling headings at the same level under the same parent.
3. Clicking a sibling in the dropdown scrolls to that heading.
4. Dropdown dismisses on blur.

**Done when:** Click the `H2` breadcrumb segment → scrolls to that h2. Dropdown arrow shows other h2 siblings → click one → scrolls.

---

