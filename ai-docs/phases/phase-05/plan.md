# Phase 5: Editing UX & Keyboard Shortcuts

---

## P5-T1: Bold toggle shortcut (`Ctrl+B`)

**Goal:** `Ctrl+B` wraps selected text in `**...**` or removes `**` if already bold.

**Steps:**

1. Create a CM6 command function `toggleBold(view: EditorView): boolean`.
2. If text is selected:
   - Check if selection is already wrapped in `**...**`.
   - If yes: remove the `**` markers.
   - If no: insert `**` before and after selection.
3. If no selection:
   - Insert `****` and place cursor between them.
4. Dispatch as a CM6 transaction (integrates with undo).
5. Add to CM6 keymap: `{ key: 'Mod-b', run: toggleBold }`.

**Done when:** Select "word" → Ctrl+B → becomes `**word**`. Press Ctrl+B again → unwraps.

---

## P5-T2: Italic toggle shortcut (`Ctrl+I`)

Same pattern as P5-T1 with `*...*`.

---

## P5-T3: Strikethrough toggle shortcut (`Ctrl+Shift+X`)

Same pattern as P5-T1 with `~~...~~`.

---

## P5-T4: Inline code toggle shortcut (`` Ctrl+` ``)

Same pattern as P5-T1 with `` `...` ``.

---

## P5-T5: Link insert/edit shortcut (`Ctrl+K`)

**Goal:** `Ctrl+K` wraps selected text as a link, prompting for URL.

**Steps:**

1. If text is selected: insert `[selected text](url)` with cursor positioned on `url` (selected for easy replacement).
2. If no selection: insert `[text](url)` with "text" selected.
3. Alternatively, post a message to the extension host to show a VS Code `InputBox` for the URL — this gives a better UX than editing inline.
4. Dispatch as CM6 transaction.

**Done when:** Select "click here" → Ctrl+K → becomes `[click here](url)` with "url" selected for typing.

---

## P5-T6: Fenced code block toggle shortcut (`Ctrl+Shift+C`)

**Goal:** `Ctrl+Shift+C` wraps selection in a fenced code block or removes fences if already in one.

**Steps:**

1. If text is selected and NOT in a code block: insert ` ```\n ` before and ` \n``` ` after.
2. If cursor is inside a fenced code block: remove the opening and closing fence lines.
3. If no selection: insert an empty fenced block and place cursor inside.

**Done when:** Select code → Ctrl+Shift+C → wrapped in fences. Again → unwrapped.

---

## P5-T7: Heading level increase/decrease (`Ctrl+Shift+]` / `[`)

**Goal:** Shortcuts to cycle heading level up or down.

**Steps:**

1. `Ctrl+Shift+]`: if current line is plain text, add `# `. If already a heading, add one more `#` (up to `####`).
2. `Ctrl+Shift+[`: if current line is a heading, remove one `#`. If `#` (h1), remove heading prefix entirely.
3. Operate on the line(s) containing the selection.

**Done when:** Pressing `Ctrl+Shift+]` three times on a line → `### Line`.

---

## P5-T8: Register all shortcuts as VS Code commands

**Goal:** Shortcuts are discoverable in the command palette and scoped to MarkdownWeave.

**Steps:**

1. Register each shortcut as a `contributes.commands` entry with a descriptive title (e.g., `MarkdownWeave: Toggle Bold`).
2. Add `contributes.keybindings` with `when: "activeCustomEditorId == 'markdownWeave.editor'"`.
3. In the extension host, register each command handler that forwards to the webview via `postMessage` (the actual toggle logic runs in the webview CM6 command).

**Done when:** All shortcuts appear in command palette with "MarkdownWeave:" prefix. Work only when a MarkdownWeave editor is active.

---

## P5-T9: Image paste from clipboard

**Goal:** Pasting an image from clipboard saves it to the assets directory and inserts markdown.

**Steps:**

1. In the webview, intercept the `paste` event on the CM6 editor.
2. Check `event.clipboardData.items` for image types (`image/png`, `image/jpeg`).
3. If an image is found:
   - Convert the `Blob` to an `ArrayBuffer`, then to a base64 string.
   - Post `{ type: 'pasteImage', data: base64, mimeType }` to the extension host.
4. Extension host:
   - Read `markdownWeave.imageAssetsPath` setting (default: `"assets"`).
   - Resolve path relative to workspace root.
   - Create directory if it doesn't exist (`workspace.fs.createDirectory`).
   - Generate filename: `image-{timestamp}.{ext}`.
   - Write the image file (`workspace.fs.writeFile`).
   - Compute relative path from the current document to the image file.
   - Respond with `{ type: 'imageInserted', markdownText: '![](relative/path.png)' }`.
5. Webview inserts the markdown text at the cursor position via CM6 transaction.

**Done when:** Copy a screenshot → paste in editor → image file appears in `assets/` → `![](assets/image-xxx.png)` inserted → image preview renders.

---

## P5-T10: Create assets directory if missing + configurable path

**Goal:** The assets directory is created automatically; path is configurable.

**Steps:**

1. Before writing a pasted image, check if the assets directory exists. If not, create it.
2. Setting `markdownWeave.imageAssetsPath` in `contributes.configuration`:
   - Type: `string`, default: `"assets"`.
   - Description: "Directory for pasted/dropped images, relative to workspace root."
3. The setting is read fresh each time an image is pasted (no caching needed — it changes rarely).

**Done when:** Changing `imageAssetsPath` to `"img"` → paste an image → saved to `img/`.

---

## P5-T11: Image file drag-and-drop

**Goal:** Dragging an image file into the editor inserts an image link.

**Steps:**

1. In the webview, intercept `drop` event on the CM6 editor.
2. Check `event.dataTransfer.files` for image types (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`).
3. For each image file:
   - Post `{ type: 'dropImage', fileName, relativeTo: documentUri }` to extension host.
   - Extension host computes the relative path from the document to the dropped file.
   - Extension host optionally copies the file to the assets directory (configurable: copy vs. link-in-place).
   - Responds with the markdown text.
4. Insert `![filename](relative/path)` at the drop position.

**Done when:** Drag `photo.png` from OS file manager into editor → `![photo.png](relative/path)` inserted.

---

## P5-T12: Markdown file drag-and-drop

**Goal:** Dragging a `.md` file into the editor inserts a markdown link.

**Steps:**

1. Check dropped files for `.md` / `.markdown` extension.
2. Compute relative path from current document to dropped file.
3. Insert `[filename](relative/path.md)` at drop position.

**Done when:** Drag `notes.md` into editor → `[notes.md](../notes.md)` inserted.

---

## P5-T13: Generic file drag-and-drop

**Goal:** Dragging any file type inserts a generic link.

**Steps:**

1. For files that are not images or markdown: insert `[filename](relative/path)`.
2. Compute relative path.

**Done when:** Drag `report.pdf` into editor → `[report.pdf](./report.pdf)` inserted.

---
