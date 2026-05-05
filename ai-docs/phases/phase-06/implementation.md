# Phase 6: Document Outline & Navigation — Implementation Plan

## Context

Phase 6 adds a document outline panel and an in-webview breadcrumb bar to MarkdownWeave. The plan deviates from the original in two important ways decided during planning:

1. **No remark/unified** — the webview already has a full CM6/Lezer parse tree. Headings are extracted there and sent to the host via `postMessage`. This avoids a duplicate parse and a ~150 KB dependency.
2. **Breadcrumbs stay in the webview** — VS Code's native breadcrumb cannot show heading-level symbols for custom editors (no cursor-position API). Webview-internal breadcrumbs also survive a future Electron port unchanged.

## Architecture

### Data flow

```
[doc change / cursor move]
        │
        ▼
webview: syntaxTree(state) → extractHeadings()
        │
        ├─ on doc change (debounced 300ms):
        │    postMessage({ type: 'headings', items })  →  OutlineProvider.setHeadings()
        │                                                      └─ _onDidChangeTreeData.fire()
        │
        └─ on cursor move (debounced 100ms):
             postMessage({ type: 'cursorLine', line })  →  treeView.reveal(item, { select: true })
             also: breadcrumb bar updates locally (no host round-trip)

[outline item click]
TreeItem command → markdownWeave.scrollToHeading (line)
  → activePanel.webview.postMessage({ type: 'scrollToHeading', line })
  → editor.ts: scrollToLine(line) via CM6 scrollIntoView
```

### Multi-document support

Each `MarkdownWeaveEditorProvider` instance keeps its own `lastKnownHeadings: HeadingItem[]`. The shared `OutlineProvider` exposes `setHeadings(items)`. When a panel becomes active, its provider calls `outlineProvider.setHeadings(this.lastKnownHeadings)` so the sidebar always reflects the focused document.

---

## Task-by-task plan

### P6-T1 — Heading extraction utility in webview (replaces remark setup)

**Deviation from plan:** T1 was "remark/unified setup on extension host". Instead we create a webview utility. No remark is installed.

**New file:** `webview-ui/src/headings.ts`

```typescript
export interface HeadingItem {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  line: number;   // 1-based
  from: number;   // char offset in document
}

export function extractHeadings(state: EditorState): HeadingItem[]
```

- Walk `syntaxTree(state).iterate()` over the full document (not just viewport — outline needs all headings)
- Match node names against `/^(?:ATX|Setext)Heading([1-6])$/`
- For ATXHeading: `state.sliceDoc(node.from, node.to)` → strip leading `#`s and trailing whitespace
- For SetextHeading: take only the first line of the node range (text line above `===`/`---`)
- Return `false` from `enter` to skip recursing into heading children

**Also add new message types** in `webview-ui/src/bridge.ts` and `src/markdownWeaveEditor.ts`:

Webview → Host:
```typescript
{ type: 'headings'; items: HeadingItem[] }
{ type: 'cursorLine'; line: number }
```

Host → Webview (update existing `HostScrollToHeadingMessage`):
```typescript
// Change from { heading: string } to { line: number }
{ type: 'scrollToHeading'; line: number }
```

---

### P6-T2 — TreeView provider for outline sidebar (replaces heading extraction from AST)

**Deviation from plan:** T2 was "heading extraction from remark AST". That work is done in T1. T2 is now the TreeView provider (original T3).

**New file:** `src/outlineProvider.ts`

```typescript
export interface HeadingItem {
  level: 1|2|3|4|5|6; text: string; line: number; from: number;
}

export class OutlineProvider implements vscode.TreeDataProvider<HeadingItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private headings: HeadingItem[] = [];

  setHeadings(items: HeadingItem[]): void { ... }   // fires event
  getTreeItem(h: HeadingItem): vscode.TreeItem { ... }
  getChildren(h?: HeadingItem): HeadingItem[] { ... } // hierarchy by level
}
```

`getTreeItem()`:
- Label = `h.text`
- `collapsibleState = None` (flat list is fine; indentation via label padding or description)
- `iconPath` = codicon based on level (`symbol-class` for H1, `symbol-method` for H2, etc.)
- `command` = `{ command: 'markdownWeave.scrollToHeading', arguments: [h.line] }`

`getChildren()`:
- Root call (no arg): return all H1s (or all headings if no H1s exist — don't hide orphans)
- Child call: return headings whose level is exactly `parent.level + 1` and fall between parent and the next sibling of the same level

**Modify `src/extension.ts` / `src/markdownWeaveEditor.ts`:**
- Instantiate `OutlineProvider`, create `vscode.window.createTreeView('markdownWeave.outline', { treeDataProvider, showCollapseAll: false })`
- Register `markdownWeave.scrollToHeading` command: posts `{ type: 'scrollToHeading', line }` to `MarkdownWeaveEditorProvider.activePanel`

**Modify `package.json`:**
```json
"views": {
  "explorer": [
    {
      "id": "markdownWeave.outline",
      "name": "MarkdownWeave Outline",
      "when": "activeCustomEditorId == 'markdownWeave.editor'"
    }
  ]
}
```

---

### P6-T3 — Click-to-scroll: outline item → scroll webview to heading

**Modify `webview-ui/src/editor.ts`:**
- Update `scrollToHeading(heading: string)` → `scrollToLine(line: number)`
- Implementation: `state.doc.line(line)` → dispatch `EditorView.scrollIntoView(linePos, { y: 'start' })` + cursor at line start
- Export via the editor facade

**Modify `webview-ui/src/main.ts`:**
```typescript
if (message.type === 'scrollToHeading') {
  editor?.scrollToLine(message.line);
}
```

---

### P6-T4 — Active heading highlight in outline (cursor sync)

**Modify `webview-ui/src/editor.ts`:**
- Add a CM6 `EditorView.updateListener` that fires on cursor change
- Debounce 100ms: `postMessage({ type: 'cursorLine', line: cursorLine })`

**Modify `src/markdownWeaveEditor.ts`:**
- Handle `'cursorLine'` message: find the heading item where `h.line <= cursor.line` and the next heading's line > cursor.line
- Call `treeView.reveal(item, { select: true, focus: false, expand: false })`

---

### P6-T5 — Outline auto-refresh on document change

**Modify `webview-ui/src/editor.ts`:**
- Add an `EditorView.updateListener` that fires when `update.docChanged`
- Debounce 300ms: call `extractHeadings(view.state)` → `postMessage({ type: 'headings', items })`
- Also fire immediately on initial load (after `init` message received)

**Modify `src/markdownWeaveEditor.ts`:**
- Handle `'headings'` message: store on the provider instance as `lastKnownHeadings`
- If this panel is the active panel: call `outlineProvider.setHeadings(items)`

**Modify `src/markdownWeaveEditor.ts` `onDidChangeViewState`:**
- When panel becomes active: `outlineProvider.setHeadings(this.lastKnownHeadings)`
- When panel becomes inactive (and no other MW panel is active): `outlineProvider.setHeadings([])`

---

### P6-T6 — Breadcrumb bar in webview

**Modify `src/markdownWeaveEditor.ts` HTML template:**
```html
<main id="app">
  <nav id="breadcrumb" aria-label="Document breadcrumb"></nav>  ← ADD
  <div id="status">Markdown Weave loading...</div>
  <div id="editor" aria-label="Markdown source"></div>
</main>
```

**New file:** `webview-ui/src/breadcrumb.ts`

```typescript
export class Breadcrumb {
  constructor(private container: HTMLElement, private view: EditorView) {}

  update(headings: HeadingItem[], cursorLine: number): void
  // Computes heading hierarchy at cursor, renders segments
}
```

Hierarchy computation:
- From `headings`, walk backward from `cursorLine` collecting the nearest heading of each level (H1, H2, H3...) — gives the "ancestor chain"
- Render: `<button class="bc-seg" data-line="N">Title</button>` with `›` separators between levels

No message passing needed — the breadcrumb runs entirely in the webview, driven by cursor updates and heading extraction (both already available from T4/T5 work).

**Modify `webview-ui/src/main.css`:**
```css
#breadcrumb {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 4px 20px;
  font-size: 12px;
  color: var(--vscode-breadcrumb-foreground);
  background: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-editorWidget-border);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#breadcrumb:empty { display: none; }
```

---

### P6-T7 — Breadcrumb click-to-scroll + sibling dropdown

**Extend `webview-ui/src/breadcrumb.ts`:**

Click on segment:
- `view.dispatch({ selection: EditorSelection.cursor(from), effects: EditorView.scrollIntoView(from, { y: 'start' }) })`

Sibling dropdown:
- Each segment gets a `▾` chevron button alongside the label
- Clicking chevron computes siblings: headings at the same level that share the same parent heading
- Renders an absolutely-positioned dropdown `<ul>` below the segment
- Click a sibling → scroll to that heading's line
- Dropdown dismisses on `blur` / `focusout` / `Escape`

Dropdown positioning: use `getBoundingClientRect()` of the chevron + fixed positioning. No popover API dependency.

---

## Critical files

| File | Action | Purpose |
|---|---|---|
| `webview-ui/src/headings.ts` | CREATE | `extractHeadings()` + `HeadingItem` type |
| `webview-ui/src/breadcrumb.ts` | CREATE | Breadcrumb DOM component |
| `webview-ui/src/bridge.ts` | MODIFY | Add `WebviewHeadingsMessage`, `WebviewCursorLineMessage` |
| `webview-ui/src/editor.ts` | MODIFY | Doc-change/cursor listeners, `scrollToLine()` |
| `webview-ui/src/main.ts` | MODIFY | Handle `scrollToHeading` by line; wire breadcrumb + heading msgs |
| `webview-ui/src/main.css` | MODIFY | Breadcrumb bar styles |
| `src/outlineProvider.ts` | CREATE | `OutlineProvider` TreeDataProvider |
| `src/markdownWeaveEditor.ts` | MODIFY | Handle new msgs, `lastKnownHeadings`, panel activation, TreeView reveal |
| `src/extension.ts` | MODIFY | Register OutlineProvider, `scrollToHeading` command, TreeView |
| `package.json` | MODIFY | Add `views` (Explorer), `markdownWeave.scrollToHeading` command |

## Decisions to record in `ai-docs/phases/phase-06/decisions.md`

- **T1**: remark/unified replaced by Lezer-based extraction in webview
- **T2**: heading extraction from remark AST replaced by TreeView provider (original T3)
- Tasks T3–T7 each shift from the original numbering (original T4→T3, etc.)
- Breadcrumb retained (T6/T7) with justification: custom editors cannot surface headings in VS Code's native breadcrumb; webview implementation is also Electron-portable

## Verification

1. Open a `.md` file with MarkdownWeave — Explorer sidebar shows "MarkdownWeave Outline" panel with heading tree
2. Click a heading in the outline → editor scrolls to that heading
3. Move cursor through document → outline highlights the current heading
4. Add a new `## Heading` → outline updates within 300 ms
5. Breadcrumb bar at top of webview shows current heading path (e.g., `H1 Introduction › H2 Installation › H3 Requirements`)
6. Click a breadcrumb segment → editor scrolls to that heading
7. Click `▾` on a breadcrumb segment → dropdown shows siblings; click one → scrolls to it
8. Open a second `.md` file in MarkdownWeave → switching between the two panels updates the outline to match the focused document
