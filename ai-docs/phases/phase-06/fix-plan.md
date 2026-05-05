# Plan: Phase 6 Post-Testing Fixes

## Context

After Phase 6 (document outline + breadcrumbs), testing revealed three bugs and a set of UX improvements needed across both the breadcrumb and the MarkdownWeave Outline sidebar panel. This plan addresses all reported issues in a single pass.

---

## Bug Fixes

### B1 + B3 — `isEditing` boundary (same root cause)

**File:** `webview-ui/src/decorations/selectionUtils.ts:42`

Commit `8e9a78a` (P5-T9) changed `range.from <= to` to `range.from < to` with the stated reason "cursor at position N is now outside range ending at N". This broke:
- **B1**: typing `##` on a new line → cursor lands at `to` (end of heading node) → `isEditing` returns false → `Decoration.replace({})` hides the `#` prefix even while typing
- **B3**: clicking at the end of any decorated element → cursor at `to` → decoration doesn't reveal raw markdown

**Analysis of the P5 image-paste case:** After inserting `![alt](img.png)\n`, the cursor is placed at `imageTo + 1` (after the `\n`). The image node regex match ends before the `\n`, so `imageTo` is the position after `)`. Cursor at `imageTo + 1` already fails the `<= to` test, so image paste was never actually broken by the original `<= to` logic. The P5-T9 fix was unnecessary and overly broad.

**Fix:** Revert line 42 from `range.from < to` back to `range.from <= to`. No other changes needed.

---

### B2 — Breadcrumb height change causes content/scrollbar jump

**File:** `webview-ui/src/main.css`

The `#breadcrumb:empty { display: none }` rule causes the breadcrumb to appear/disappear, changing the available height for the CM6 editor. CM6 responds by recalculating its viewport geometry, which causes the scroll position to jump.

**Fix:** Change `display: none` to `visibility: hidden; border-bottom: none` on the empty state. This preserves the height of the breadcrumb bar so CM6's available space never changes. Note: after implementing 1.4 (show top-level headings when above first heading), the breadcrumb will rarely be empty anyway; the only remaining empty case is a document with no headings at all.

---

## Breadcrumb Improvements

### 1.1 — Sticky breadcrumb

**File:** `webview-ui/src/main.css`

Add `position: sticky; top: 0; z-index: 10` to `#breadcrumb`. The breadcrumb already sits outside CM6's `.cm-scroller`, so in the normal flow it doesn't scroll away — sticky ensures it stays anchored even if the outer `body` scrolls in edge cases. Also add `overflow: hidden` to `body` to suppress any accidental body-level scroll.

---

### 1.2 — Breadcrumb styling overhaul

**Files:** `webview-ui/src/main.css`, `webview-ui/src/breadcrumb.ts`

CSS changes:
- `#breadcrumb` font-size: `12px` → `13px`
- `#breadcrumb` padding: `5px 28px` → `7px 28px`
- `.bc-sep` character: keep `›` but set `font-size: 16px; margin: 0 5px` so it's more prominent
- `.bc-label:hover`: **remove** `background: var(--vscode-list-hoverBackground)`. Change color to `var(--vscode-editor-foreground)` (slightly brighter than the dim breadcrumb foreground). No background change on hover.
- `.bc-chevron` and `.bc-chevron:not(:disabled):hover`: **remove entirely** (chevron button is gone)

Breadcrumb.ts changes:
- In `createSegment()`: remove the `chevron` button creation entirely
- Add hover-based dropdown: on `mouseenter` of the segment wrapper `<span>`, start a 1000 ms timeout; on `mouseleave`, cancel it and close any open dropdown. On timeout fire, call `openDropdown(wrap, siblings)`.
- Clicking the label only calls `scrollToHeading()` — no dropdown involvement on click.

---

### 1.3 — Exclude frontmatter from breadcrumbs (and outline)

**File:** `webview-ui/src/headings.ts`

The Lezer markdown parser has no built-in frontmatter support, so `---` at end of a frontmatter block is parsed as a SetextHeading2 marker for the YAML property line above it (e.g., `title: My Document` becomes a setext H2). This causes frontmatter content to appear in the headings list used by both breadcrumbs and the outline.

**Fix:** At the top of `extractHeadings()`, call `findFrontmatterRange(state)` (already exists in `webview-ui/src/decorations/ranges.ts`). In the `syntaxTree.iterate()` callback, skip any heading node whose range falls inside the frontmatter range:

```typescript
import { findFrontmatterRange } from './decorations/ranges';

export function extractHeadings(state: EditorState): HeadingItem[] {
  const frontmatter = findFrontmatterRange(state);
  // ...
  enter(node) {
    const m = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
    if (!m) return;
    if (frontmatter && node.from >= frontmatter.from && node.to <= frontmatter.to) {
      return false; // skip, don't recurse
    }
    // ... rest unchanged
  }
}
```

This single fix covers both 1.3 (breadcrumbs) and 2.1 (outline), since both consume the same `HeadingItem[]` from `extractHeadings`.

---

### 1.4 — Show top-level headings when cursor is above first heading

**File:** `webview-ui/src/breadcrumb.ts`

Currently `computeAncestors()` returns `[]` when cursor is above all headings → breadcrumb renders nothing.

**New behavior:** When `byLevel.size === 0` (no headings above cursor), find the minimum level present in the full headings list and return a single synthetic item: the **first heading** at that minimum level. The dropdown for that item will contain all headings at the same top level.

Implementation: after the early `byLevel.size === 0` check, instead of returning `[]`, do:
```typescript
if (byLevel.size === 0) {
  const topLevel = Math.min(...this.headings.map(h => h.level));
  const first = this.headings.find(h => h.level === topLevel);
  return first ? [first] : [];
}
```

`computeSiblings` for `index = 0` already returns all headings at the same level with no parent boundary, so the dropdown will correctly list all top-level headings.

---

### 1.5 — Horizontal scrolling without visible scrollbar

**File:** `webview-ui/src/main.css`

Change `#breadcrumb`'s `overflow: hidden` to `overflow-x: auto` and hide the scrollbar:

```css
#breadcrumb {
  overflow-x: auto;
  scrollbar-width: none; /* Firefox */
}
#breadcrumb::-webkit-scrollbar {
  display: none; /* Chrome/Electron */
}
```

Mouse-wheel horizontal scrolling over the breadcrumb: Electron/Chrome natively maps trackpad horizontal swipe to `scrollLeft` when `overflow-x: auto` is set. For a standard vertical mouse wheel (which produces `deltaY`, not `deltaX`), add a wheel listener in `main.ts` (or `Breadcrumb` constructor) that maps `deltaY → scrollLeft` when cursor is over the breadcrumb:

```typescript
container.addEventListener('wheel', (e) => {
  if (e.deltaX !== 0) return; // already horizontal, let it through
  if (e.deltaY !== 0) {
    e.preventDefault();
    container.scrollLeft += e.deltaY;
  }
}, { passive: false });
```

---

### 1.6 — Cursor at end of heading after breadcrumb click

**File:** `webview-ui/src/breadcrumb.ts`

In `scrollToHeading()`, change the cursor position from `heading.from` (start of heading) to the end of the heading line:

```typescript
private scrollToHeading(heading: HeadingItem): void {
  const line = this.view.state.doc.lineAt(heading.from);
  this.view.dispatch({
    selection: EditorSelection.cursor(line.to),
    effects: EditorView.scrollIntoView(heading.from, { y: 'start' })
  });
  this.view.focus();
}
```

---

### 1.7 — Dropdown overflow at right edge

**File:** `webview-ui/src/breadcrumb.ts`

In `openDropdown()`, after appending the dropdown to `document.body`, check if it extends past the right viewport edge and clamp it:

```typescript
document.body.appendChild(dropdown);
// Clamp to viewport
const dr = dropdown.getBoundingClientRect();
if (dr.right > window.innerWidth) {
  dropdown.style.left = `${Math.max(0, window.innerWidth - dr.width)}px`;
}
```

---

## Outline Improvements

### 2.1 — Remove frontmatter from outline

Already covered by the fix in **1.3** (`headings.ts`). The outline receives headings via the same `extractHeadings()` call; filtering frontmatter there fixes both.

---

### 2.2 — Outline panel order

**No code change.** VS Code does not expose an API to control the order of built-in views (Outline, Timeline) relative to custom views in the Explorer sidebar. The user can drag panels to their preferred order manually.

---

### 2.3 — Rename outline panel title

**File:** `package.json`

Change the `"name"` of `markdownWeave.outline` from `"MarkdownWeave Outline"` to `"Markdown Weave Outline"` (add space, matches extension's display name pattern):

```json
{ "id": "markdownWeave.outline", "name": "Markdown Weave Outline", ... }
```

---

### 2.4 — Heading level as label prefix (remove generic icons)

**File:** `src/outlineProvider.ts`

In `getTreeItem()`:
- Change the `TreeItem` label from `item.text` to `` `H${item.level}  ${item.text}` ``
- Remove `treeItem.description = ...` (no right-side badge needed)
- Remove `treeItem.iconPath` (no codicon icon — VS Code shows the label starting at column 0, giving a cleaner look matching the user's selected preview)

Remove the `HEADING_ICONS` constant as it's no longer used.

---

### 2.5 — Focus webview and cursor at end after outline click

**File:** `webview-ui/src/editor.ts`

In `scrollToLine()`, after dispatching the transaction, add `view.focus()` and change the cursor position to end of line instead of start:

```typescript
function scrollToLine(line: number): void {
  requestAnimationFrame(() => {
    const clampedLine = Math.max(1, Math.min(line, doc.lines));
    const lineObj = doc.line(clampedLine);
    view.dispatch({
      selection: EditorSelection.cursor(lineObj.to),  // end of heading line
      effects: EditorView.scrollIntoView(lineObj.from, { y: 'start' })
    });
    view.focus();
  });
}
```

---

### 2.6 — Auto-highlight active heading in outline on cursor move

**File:** `src/markdownWeaveEditor.ts`

The `revealHeadingForLine` function already exists and calls `tv.reveal(heading, { select: true, focus: false, expand: true })`. The likely issue: VS Code's `treeView.reveal()` silently fails when called before the tree has been rendered (items not yet visited by `getTreeItem`/`getChildren`). Wrapping in a try-catch and adding a 50ms delay on first reveal should fix it:

```typescript
const revealHeadingForLine = (line: number): void => {
  const op = MarkdownWeaveEditorProvider.outlineProvider;
  const tv = MarkdownWeaveEditorProvider.treeView;
  if (!op || !tv) return;
  const heading = op.findHeadingForLine(line);
  if (!heading) return;
  tv.reveal(heading, { select: true, focus: false, expand: true }).then(
    undefined,
    () => { /* silently ignore reveal failures */ }
  );
};
```

Also verify that `MarkdownWeaveEditorProvider._activePanel` is set at document open time (not only on state-change events), since `cursorLine` messages can arrive before `onDidChangeViewState` fires.

---

## Critical Files

| File | Changes |
|---|---|
| `webview-ui/src/decorations/selectionUtils.ts` | B1+B3: `< to` → `<= to` (1 char) |
| `webview-ui/src/headings.ts` | 1.3+2.1: filter frontmatter range |
| `webview-ui/src/breadcrumb.ts` | 1.2, 1.4, 1.6, 1.7 |
| `webview-ui/src/main.css` | B2, 1.1, 1.2, 1.5 |
| `webview-ui/src/main.ts` | 1.5: wheel listener for horizontal scroll |
| `webview-ui/src/editor.ts` | 2.5: focus + cursor-at-end in scrollToLine |
| `src/outlineProvider.ts` | 2.4: label format |
| `package.json` | 2.3: rename view title |
| `src/markdownWeaveEditor.ts` | 2.6: reveal error handling + _activePanel timing |

---

## Verification

1. **B1**: Type `# ` on a blank line → `#` and space should be visible (heading renders as raw while cursor is on that line); press End → cursor at end of line → still shows raw `#`. Move away → heading decorates.
2. **B3**: Click at the very end of `**bold**` text → should reveal `**` markers. Click away → markers hide again.
3. **B2**: Open a document with a heading in the middle. Scroll so cursor is above the heading → breadcrumb updates. Scroll back into a heading → breadcrumb updates. No jumping of content.
4. **1.1**: Scroll the editor content down (long document) → breadcrumb stays pinned at top.
5. **1.2**: Verify larger font, bigger separator, no chevron arrow, hover only changes text color.
6. **1.3+2.1**: Open a file with YAML frontmatter (`---\ntitle: Test\n---`) → frontmatter line should NOT appear in breadcrumb or outline.
7. **1.4**: Place cursor at the very top of a document with headings → breadcrumb shows first top-level heading with dropdown on hover showing all siblings.
8. **1.5**: Shrink window width so breadcrumb items overflow → horizontal scroll works, no scrollbar visible.
9. **1.6+2.5**: Click a heading in breadcrumb or outline → cursor lands at end of heading text, not start.
10. **1.7**: Hover over a breadcrumb item near the right edge → dropdown stays within viewport.
11. **2.4**: Outline shows `H1  Title`, `H2  Section`, etc. — no description badge, no codicon icon.
12. **2.6**: Move cursor through a long document → the corresponding heading in the outline highlights as cursor enters each section.
