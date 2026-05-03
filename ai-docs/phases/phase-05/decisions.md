# Phase 05 Decisions

## Decisions

### CM6 keymap + VS Code keybindings dual registration

Both the CM6 keymap (webview) and VS Code `contributes.keybindings` register the same shortcuts. The VS Code keybinding fires the command in the extension host, which posts `{ type: 'runCommand', command }` to the webview. The CM6 keymap handles the shortcut directly in-webview.

In practice, when the user presses a registered shortcut while the MarkdownWeave editor is focused, VS Code intercepts the key event at the host level and fires the command before the webview receives it, so the CM6 keymap entry serves as a fallback for environments where VS Code keybinding interception is not in effect. No double-execution has been observed.

### Italic toggle uses `*` marker (not `_`)

The plan specifies `*...*` for italic. A guard prevents the italic unwrap check from matching bold markers: if `twoBefore === '**'` the markers are identified as bold, not italic.

### `insertLink` uses inline placeholder — no InputBox

The plan offered an `InputBox` alternative. The inline approach (`[selected](url)` with "url" selected) was chosen as it is immediate and requires no round-trip to the extension host.

### `toggleCodeBlock` uses `resolveInner` to detect FencedCode context

The same tree-walk approach used by `isSelectionInsideFencedCode` in `editor.ts` is used in `toggleCodeBlock` to detect whether the cursor is inside a fenced code block. If found, both the opening and closing fence lines are deleted.

### Image paste does not track drop position per-request

The `imageInserted` response inserts at the current cursor position via `insertAtCursor`. Since the paste event fires synchronously and the user's cursor does not move between paste and response, this produces correct results in practice.

### File drop uses `file.path` (Electron extension)

`File.path` is an Electron-specific property available in VS Code webviews. It is accessed via `(file as File & { path?: string }).path`. If `filePath` is empty (non-filesystem drag source), the extension host returns no response and nothing is inserted.

### Heading level max is 6 (standard markdown)

The plan says "up to `####`" (h4), but the implementation uses h6 (the full markdown spec). The "Done when" example (3 presses → `###`) is satisfied either way.

## Deviations From Plan

### `workspace.fs.createDirectory` has no `ignoreIfExists` option

The plan mentions `{ ignoreIfExists: true }` as an option to `createDirectory`, but the VS Code `FileSystem` API does not accept options on `createDirectory`. A `try/catch` block is used instead to silently ignore "already exists" errors.

### Drop handler classifies files in the extension host, not the webview

The plan's drop flow (P5-T11/T12/T13) shows per-type handling in the webview (image → `![]()`, markdown → `[]()`, generic → `[]()`). The classification is instead done entirely in the extension host, which keeps the webview message simple (`dropFile` with path/name/mimeType) and the host authoritative on file type detection.
