# Phase 1: Extension Scaffolding & Custom Editor Provider

---

## P1-T1: Initialize project with `yo code` and configure TypeScript + ESLint

**Goal:** Runnable empty extension project with strict TypeScript and linting.

**Steps:**

1. Run `npx --package yo --package generator-code -- yo code`, select TypeScript + esbuild.
2. Set `engines.vscode` to `^1.90.0` in `package.json`.
3. Set `activationEvents: []` (empty array — VS Code ≥1.74 auto-generates from contribution points).
4. Enable `strict: true` in `tsconfig.json`.
5. Install and configure ESLint with `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`.
6. Add `.vscodeignore` to exclude `src/`, `webview-ui/src/`, `node_modules/`, `*.map`, `tsconfig.json`, `.eslintrc*`.
7. Create the directory structure:

```
markdownweave/
├── src/                    # Extension host code (Node target)
├── webview-ui/src/         # Webview code (browser target)
├── media/                  # Static assets (icon, etc.)
├── dist/                   # Build output (gitignored)
└── esbuild.mjs
```

**Done when:** `npm run compile` succeeds with zero errors. Project structure matches above.

---

## P1-T2: Configure dual esbuild build script

**Goal:** Single `esbuild.mjs` that builds both the extension host bundle and the webview bundle.

**Steps:**

1. Create `esbuild.mjs` with two `esbuild.build()` calls:
   - **Extension host:** entry `src/extension.ts` → `dist/extension.js`, platform `node`, format `cjs`, external `['vscode']`.
   - **Webview:** entry `webview-ui/src/main.ts` → `dist/webview.js`, platform `browser`, format `iife`, target `es2022`.
2. Accept `--watch` flag to enable both builds in watch mode simultaneously.
3. Accept `--production` flag to enable minification.
4. Update `package.json` scripts:
   - `"compile": "node esbuild.mjs"`
   - `"watch": "node esbuild.mjs --watch"`
   - `"package": "node esbuild.mjs --production"`
5. Install `esbuild` and `@esbuild-plugins/node-resolve` if needed.

**Done when:** Running `npm run compile` produces `dist/extension.js` and `dist/webview.js`. Running `npm run watch` rebuilds both on file changes.

---

## P1-T3: Set up F5 debug launch config

**Goal:** Pressing F5 compiles the extension and opens an Extension Development Host window.

**Steps:**

1. Create `.vscode/launch.json` with a `"Run Extension"` configuration:
   - `type: "extensionHost"`, `runtimeExecutable: "${execPath}"`, `args: ["--extensionDevelopmentPath=${workspaceFolder}"]`.
   - `preLaunchTask: "npm: compile"`.
2. Create `.vscode/tasks.json` with a compile task that runs the esbuild script.
3. Install the `connor4312.esbuild-problem-matcher` extension for build error highlighting.
4. Add a watch task variant for continuous compilation during debug.

**Done when:** F5 opens an Extension Development Host. The extension appears in the host's extension list.

---

## P1-T4: Implement `CustomTextEditorProvider` skeleton

**Goal:** A provider class that receives a `TextDocument` and creates a webview panel with a placeholder.

**Steps:**

1. Create `src/markdownWeaveEditor.ts` with a class implementing `vscode.CustomTextEditorProvider`.
2. Define a static `viewType = 'markdownWeave.editor'`.
3. Implement `resolveCustomTextEditor(document, webviewPanel, token)`:
   - Set `webviewPanel.webview.options` with `enableScripts: true`.
   - Set `localResourceRoots` to `[extensionUri/dist, extensionUri/media]` plus workspace folders.
   - Set `webviewPanel.webview.html` to a placeholder HTML string (just "MarkdownWeave loading...").
4. Wire up `webviewPanel.onDidDispose()` to clean up any listeners.

**Done when:** Opening a `.md` file with "Open With... → MarkdownWeave" shows the placeholder text in a webview.

---

## P1-T5: Register custom editor in `package.json` for `.md` / `.markdown`

**Goal:** VS Code knows about the MarkdownWeave custom editor and offers it for markdown files.

**Steps:**

1. Add `contributes.customEditors` entry:
   - `viewType: "markdownWeave.editor"`
   - `displayName: "MarkdownWeave"`
   - `selector: [{ "filenamePattern": "*.md" }, { "filenamePattern": "*.markdown" }]`
   - `priority: "option"` (does NOT replace VS Code's default editor)
2. In `src/extension.ts`, call `vscode.window.registerCustomEditorProvider()` inside `activate()`:
   - Pass `{ supportsMultipleEditorsPerDocument: true }`.
3. Push the registration disposable to `context.subscriptions`.

**Done when:** Right-clicking a `.md` file → "Open With..." shows "MarkdownWeave" as an option.

---

## P1-T6: Add `markdownWeave.openEditor` command + context menu

**Goal:** User can open the current file in MarkdownWeave via a command or right-click menu.

**Steps:**

1. Register command `markdownWeave.openEditor` in both `package.json` (`contributes.commands`) and in `extension.ts` (`vscode.commands.registerCommand`).
2. Command handler: get the active editor's `document.uri` and call `vscode.commands.executeCommand('vscode.openWith', uri, 'markdownWeave.editor')`.
3. Add `contributes.menus.explorer/context` entry with `when: "resourceExtname =~ /\\.(md|markdown)$/"` and `group: "navigation"`.

**Done when:** Right-click on `.md` in Explorer → "Open with MarkdownWeave" works. Command palette → "MarkdownWeave: Open with MarkdownWeave" works.

---

## P1-T7: Create webview HTML shell with CSP and asset loading

**Goal:** Secure webview HTML that loads the bundled JS and CSS with proper Content Security Policy.

**Steps:**

1. Create a `getHtmlForWebview(webview: vscode.Webview): string` method on the provider.
2. Generate a cryptographic nonce per render: `crypto.randomBytes(16).toString('base64')`.
3. Build the CSP meta tag:
   ```
   default-src 'none';
   img-src ${webview.cspSource} https: data:;
   style-src ${webview.cspSource};
   font-src ${webview.cspSource};
   script-src 'nonce-${nonce}';
   ```
4. Resolve asset URIs via `webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'))`.
5. HTML includes a `<div id="editor"></div>` mount point, the CSS `<link>`, and the `<script nonce="...">` tag.
6. **Never use `'unsafe-inline'`** in `script-src`.

**Done when:** Webview loads with no CSP errors in the webview DevTools console. `console.log('webview loaded')` appears in webview DevTools.

---

## P1-T8: Implement ready-handshake between extension host and webview

**Goal:** Prevent race conditions by ensuring the webview is fully initialized before sending document content.

**Steps:**

1. In the webview JS (`webview-ui/src/main.ts`):
   - Acquire the VS Code API: `const vscode = acquireVsCodeApi()`.
   - Add a `window.addEventListener('message', handler)` for incoming messages.
   - On `window.load`, post `{ type: 'ready' }` to the extension host.
2. In the extension host (`resolveCustomTextEditor`):
   - Listen for `webview.onDidReceiveMessage`.
   - When `{ type: 'ready' }` is received, respond with `{ type: 'init', content: document.getText() }`.
3. The webview message handler receives `init` and stores the document content.

**Done when:** Webview receives the full document text after load. Verified by logging `content.length` in webview DevTools.

---

## P1-T9: Implement webview → extension edit pipeline

**Goal:** Edits made in the webview update the VS Code `TextDocument` and integrate with undo/redo.

**Steps:**

1. Define a message schema for edits: `{ type: 'edit', from: number, to: number, insert: string }` where `from`/`to` are character offsets in the document.
2. In the webview, when user makes an edit, post this message via `vscode.postMessage()`.
3. In the extension host, on receiving an `edit` message:
   - Create a `WorkspaceEdit`.
   - Convert offsets to `Position` via `document.positionAt(offset)`.
   - Call `edit.replace(document.uri, range, insert)`.
   - Call `workspace.applyEdit(edit)`.
4. Tag outgoing edits with a `source: 'webview'` flag for echo-loop prevention (P1-T11).

**Done when:** Typing "hello" in the webview → file shows as modified (dirty dot) → `Ctrl+S` saves → file on disk contains "hello".

---

## P1-T10: Implement extension → webview document sync

**Goal:** External changes to the file (Git operations, terminal edits, other extensions) appear in the webview.

**Steps:**

1. Subscribe to `vscode.workspace.onDidChangeTextDocument` in `resolveCustomTextEditor`.
2. Filter by `event.document.uri.toString() === document.uri.toString()`.
3. Skip events with `event.contentChanges.length === 0`.
4. Post `{ type: 'update', content: document.getText(), source: 'extension' }` to the webview.
5. In the webview, on receiving `update`, compare with current content and update if different.

**Done when:** Edit the file in a terminal (`echo "test" >> file.md`) → webview updates without manual refresh.

---

## P1-T11: Add echo-loop prevention and debouncing

**Goal:** Prevent infinite loops where webview edit → extension applies → triggers `onDidChangeTextDocument` → sends update back to webview → repeat.

**Steps:**

1. In the extension host, maintain a `suppressNextSync: boolean` flag. Set it to `true` before `applyEdit`, reset on next tick.
2. In the `onDidChangeTextDocument` handler, skip if `suppressNextSync` is true.
3. In the webview, on receiving an `update` message with `source: 'extension'`, compare the incoming text with `editor.state.doc.toString()` — skip if identical.
4. Debounce webview→extension edit messages with a 200ms trailing debounce. Batch rapid keystrokes into a single edit message.
5. Write a test scenario: type rapidly → verify only one `applyEdit` per debounce window, no echo loops.

**Done when:** Rapid typing produces no console errors, no cursor jumps, and no duplicate characters. External file changes update the webview exactly once.

---

## P1-T12: Implement webview state persistence

**Goal:** Scroll position and cursor location survive webview disposal (tab backgrounding, VS Code restart).

**Steps:**

1. In the webview, on scroll and cursor change (debounced 200ms), call `vscode.setState({ scrollTop, cursorOffset })`.
2. On webview initialization, call `vscode.getState()` and if state exists, restore scroll position and cursor after the editor mounts.
3. Ensure restoration waits until the CM6 `EditorView` has completed its initial layout pass before calling `scrollTo`.

**Done when:** Open a `.md` file → scroll to the middle → switch to another tab → switch back → scroll position and cursor are preserved.

---
