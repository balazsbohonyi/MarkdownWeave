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

**Goal:** Pasting an image from clipboard saves it relative to the current document and inserts markdown.

**Steps:**

1. In the webview, intercept the `paste` event on the CM6 editor.
2. Check `event.clipboardData.items` for image types (`image/png`, `image/jpeg`).
3. If an image is found:
   - Convert the `Blob` to an `ArrayBuffer`, then to a base64 string.
   - Post `{ type: 'pasteImage', data: base64, mimeType }` to the extension host.
4. Extension host:
   - Read `markdownWeave.pasteImageFolder` setting (default: `""`).
   - Resolve target dir: `path.join(path.dirname(documentFsPath), pasteImageFolder)`.
   - Create directory if it doesn't exist (`workspace.fs.createDirectory`).
   - Generate filename: `image-{Date.now()}.{ext}` (ext derived from mimeType).
   - Write the image file (`workspace.fs.writeFile`).
   - Compute relative path from document dir to saved file (`path.relative`).
   - Respond with `{ type: 'imageInserted', markdownText: '![](relative/path.ext)' }`.
5. Webview inserts the markdown text at the cursor position via CM6 transaction.

**Done when:** Copy a screenshot → paste in editor → image file appears next to the `.md` file → `![](image-xxx.png)` inserted → image preview renders.

---

## P5-T10: `pasteImageFolder` setting + auto-create folder if missing

**Goal:** The paste image folder is configurable (relative to document) and created automatically.

**Steps:**

1. Add to `contributes.configuration.properties` in `package.json`:
   ```json
   "markdownWeave.pasteImageFolder": {
     "type": "string",
     "default": "",
     "description": "Folder for pasted images, relative to the document file. Leave empty to save in the document's directory."
   }
   ```
2. In the paste handler on the extension host, read the setting fresh each time (no caching needed — it changes rarely).
3. Call `workspace.fs.createDirectory(targetUri)` before writing; pass `{ ignoreIfExists: true }` to avoid throwing if the folder already exists.
4. Remove any `markdownWeave.imageAssetsPath` entry from `package.json` if it was added in an earlier step.

**Done when:** Setting `pasteImageFolder` to `"screenshots"` → paste image → file saved to `{doc_dir}/screenshots/image-xxx.png` and inserted as `![](screenshots/image-xxx.png)`.

---

## P5-T11: Image file drag-and-drop

**Goal:** Dragging an image file into the editor inserts a relative image link. No file copying.

**Steps:**

1. In the webview, intercept `drop` event on the CM6 editor.
2. Check `event.dataTransfer.files` for image types (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`).
3. For each image file:
   - Post `{ type: 'dropFile', fileUri, documentUri }` to the extension host.
   - Extension host computes `path.relative(path.dirname(documentFsPath), droppedFileFsPath)`.
   - Responds with `{ type: 'insertMarkdown', text: '![filename](relative/path)' }`.
4. Insert the markdown text at the drop position via CM6 transaction.

**Done when:** Drag `photo.png` from OS file manager into editor → `![photo](relative/path/photo.png)` inserted with a correct relative path. No file is copied.

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

## P5-T14: Live image refresh on file-system change

**Goal:** When an image file referenced in the document is deleted, created, or renamed while the editor is open, MarkdownWeave automatically updates the decoration — showing the missing-image placeholder for deleted files and the rendered preview for newly available files — without requiring a document reload.

**Steps:**

1. In `src/markdownWeaveEditor.ts`, extend the existing `onDidCreateFiles`, `onDidDeleteFiles`, and `onDidRenameFiles` handlers to also post `{ type: 'clearImageUriCache' }` to the webview alongside the existing `invalidateWikiLinkCache()` call.
2. In `webview-ui/src/bridge.ts`:
   - Add `HostClearImageUriCacheMessage` type (`{ type: 'clearImageUriCache' }`).
   - Add it to the `HostMessage` union.
   - Add an `imageUriClearCallback` variable and `setImageUriClearCallback` export (mirrors the wiki link pattern).
   - Handle the message in `handleBridgeMessage`: clear `imageUriCache`, `pendingImageUriRequests`, `imageUriHandlers`, then call the callback.
3. In `webview-ui/src/widgets/ImageWidget.ts`, add `cacheVersion: number` to `ImageWidgetOptions` and include it in `eq()` so CM6 recreates widget DOM (and re-resolves the URI) whenever the version changes.
4. In `webview-ui/src/decorations/index.ts`:
   - Add a module-level `imageCacheVersion` counter and a `bumpImageCacheVersion(view)` function that increments it and dispatches an empty CM6 transaction to trigger a decoration rebuild.
   - Pass `cacheVersion: imageCacheVersion` to every `ImageWidget` constructor call in `buildImageDecorations`.
   - In the `markdownDecorations` plugin constructor, call `setImageUriClearCallback(() => bumpImageCacheVersion(view))`. Add a `destroy()` method that calls `setImageUriClearCallback(undefined)`.

**Done when:** Open a document with an image preview rendered. Delete the image file from the VS Code Explorer sidebar. Within ~1 second, the editor shows the missing-image placeholder without reloading. Restore the file — the rendered preview reappears automatically.

---
