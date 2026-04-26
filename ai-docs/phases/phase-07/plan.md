# Phase 7: Side-by-Side Mode

---

## P7-T1: `markdownWeave.openSideBySide` command

**Goal:** Command registered and accessible.

**Steps:**

1. Register `markdownWeave.openSideBySide` in `contributes.commands`.
2. Handler receives the current document's URI.

**Done when:** Command appears in the command palette.

---

## P7-T2: Open split layout

**Goal:** Open the file in a split view with raw source on the left and MarkdownWeave preview on the right.

**Steps:**

1. In the command handler:
   - Open the file in the default text editor in the current column: `vscode.window.showTextDocument(uri, { viewColumn: ViewColumn.One })`.
   - Open the same file with MarkdownWeave in the next column: `vscode.commands.executeCommand('vscode.openWith', uri, 'markdownWeave.editor', ViewColumn.Two)`.
2. Both editors share the same `TextDocument` — edits in one appear in the other automatically (handled by the existing document sync).

**Done when:** Running the command opens a split with raw markdown on the left and rendered preview on the right.

---

## P7-T3: Source-map based scroll sync

**Goal:** Scrolling in one pane scrolls the other to the corresponding position.

**Steps:**

1. Build a mapping between source line numbers and rendered heading/block positions using the Lezer syntax tree positions.
2. When the raw editor scrolls, compute which line is at the top of the viewport. Post `{ type: 'syncScroll', line }` to the MarkdownWeave webview.
3. The webview finds the corresponding position in its CM6 view and scrolls to it.
4. Avoid feedback loops: when scroll is triggered by sync (not user), suppress outgoing sync events.

**Done when:** Scrolling the raw editor scrolls the preview to the matching section.

---

## P7-T4: Bidirectional scroll sync

**Goal:** Scrolling the preview also scrolls the raw editor.

**Steps:**

1. When the MarkdownWeave webview is scrolled by the user, compute the top visible line.
2. Post `{ type: 'syncScrollReverse', line }` to the extension host.
3. Extension host calls `editor.revealRange()` on the raw text editor to scroll it.
4. Same feedback-loop prevention as P7-T3.

**Done when:** Scroll sync works in both directions — raw ↔ preview.

---

## P7-T5: Editor toolbar button + command palette entry

**Goal:** Easy access to the side-by-side command.

**Steps:**

1. Add an editor title icon button (using `contributes.menus.editor/title`) with `when: "activeCustomEditorId == 'markdownWeave.editor'"`.
2. Use a split-screen icon.
3. Clicking it runs the `markdownWeave.openSideBySide` command.

**Done when:** MarkdownWeave editor has a split icon in the toolbar that opens side-by-side mode.

---
