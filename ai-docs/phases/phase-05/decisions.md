# Phase 05 Decisions

## Decisions

### Inline code shortcut changed from Ctrl+` to Ctrl+Shift+`

`Ctrl+`` conflicts with VS Code's terminal toggle, and user-defined VS Code keybindings take precedence over extension keybindings regardless of `when` conditions. Changed to `Ctrl+Shift+`` in both `package.json` and the CM6 keymap (`Mod-Shift-\``).

### Heading shortcuts use VS Code postMessage path only (no CM6 keymap entry)

`Mod-Shift-]` and `Mod-Shift-[` were removed from the CM6 keymap. On US keyboards Shift+`]` produces `}`, and CM6's key resolution (which uses numeric key codes) fires the handler but in a state where the VS Code postMessage path also fires, producing a corrupted heading (`###   ## Wiki Links`). The heading shortcuts work correctly via the VS Code `keybindings` → `runCommand` path alone.

### Format commands reset selection reveal state after application

After applying bold/italic/strikethrough/inline-code/code-block/heading, `revealState` was left as `'committed'` from the user's prior selection, causing `isEditing` to return `true` and leaving raw markers (e.g. `~~`) visible alongside the WYSIWYG formatting. `postFormatState()` in `editor.ts` dispatches `setSelectionRevealState.of('none')` after every format command so decorations immediately hide the markers.

### Double-fire prevention via CM6 deduplication flag

Both the CM6 keymap (webview) and VS Code `contributes.keybindings` must register the same shortcuts. Removing the VS Code keybindings causes VS Code's own built-ins to fire alongside CM6 (e.g. Ctrl+B → sidebar toggle, Ctrl+Shift+X → Extensions panel, Ctrl+` → theme selector). Removing the CM6 entries causes CM6's defaultKeymap to fire on the same keys (e.g. `Mod-i` → `selectParentSyntax`).

Both are required, but they produce double-execution: VS Code intercepts the keydown from the webview AND the webview's DOM also receives the keydown event. The CM6 keymap fires synchronously (DOM event); the VS Code command fires asynchronously via IPC → extension host → `postMessage`.

Fix: a `pendingCM6Command` flag is set whenever a formatting command is handled by the CM6 keymap. The `runCommand` handler (which runs postMessage-triggered invocations) checks this flag: if the command name matches and the flag is less than 100ms old, it skips execution and clears the flag. Command-palette invocations produce no DOM keydown, so no flag is set and they run normally. See `dedup()` and `cm6Handled()` in `editor.ts`.

### Italic toggle uses `*` marker (not `_`)

The plan specifies `*...*` for italic. A guard prevents the italic unwrap check from matching bold markers: if `twoBefore === '**'` the markers are identified as bold, not italic.

### `insertLink` uses Obsidian-style link creation

No placeholder text is used. With a selection, the selected text becomes the link text and cursor is placed between `()` for URL entry: `[selected text](|)`. Without a selection, an empty link with cursor between `[]` is inserted: `[|]()`. When the cursor is already inside a Link node, `insertLink` returns `false` (no-op, no double-wrapping).

`insertLink` does **not** dispatch a `setSelectionRevealState` effect. The link shows as raw markdown because the cursor is placed inside the new Link node, causing `isEditing` to return `true` via the empty-cursor range check — reveal state is not involved. `postFormatState` in `editor.ts` dispatches `'none'` after `insertLink` (same as all other format commands) as a safety reset.

### Zero-length `Decoration.mark` ranges are avoided in `linkDecoration`

When a link has empty text (e.g. `[]()`), `textFrom === textTo` and `linkDecoration` would create a zero-length `Decoration.mark` range at the same `from` position as a `Decoration.replace` range (hiding `]()`). The mark is pushed before the replace in the ranges array, but CodeMirror requires `replace` to sort before `mark` at the same `from` position. `Decoration.set(ranges, true)` treats input as sorted, so this ordering violation corrupts the entire `DecorationSet`, causing all link decorations to be dropped and every link in the document to appear as raw markdown.

Fix: when `textFrom === textTo`, skip the mark range entirely. An empty link has no visible text to style, so the mark decoration is not needed.

### `setSelectionRevealState.of('committed')` must not be dispatched for empty-cursor positions

When `setSelectionRevealState.of('committed')` is dispatched with an empty cursor (not a range), `selectionRevealField.update` may not reset it to `'none'` in time, leaving `revealState = 'committed'` across subsequent `buildDecorations` calls. The `'committed'` state interacts with decoration range building in ways that can corrupt the `DecorationSet` (out-of-order ranges), causing all link decorations to be dropped and every link in the document to appear as raw markdown. The fix is to never dispatch `'committed'` for insertions that produce an empty cursor; rely on cursor position alone for `isEditing`.

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
