# Phase 6 Fix Plan — Session Handoff

## Status

Working from `ai-docs/phases/phase-06/fix-plan.md`. Partway through implementation. A second round of testing found new/remaining issues. This file records what is done, what is broken, and exactly what the next session needs to do.

---

## Already Implemented (do NOT re-do)

These changes are in the working tree (unstaged):

| Item | File | Status |
|---|---|---|
| B1+B3: `<= to` revert | `webview-ui/src/decorations/selectionUtils.ts:42` | Done |
| 1.3+2.1: frontmatter filter | `webview-ui/src/headings.ts` | Done |
| 2.3: rename outline title | `package.json` | Done |
| 2.4: `H1  Title` label | `src/outlineProvider.ts` | Done |
| 2.5: `view.focus()` + cursor at end | `webview-ui/src/editor.ts` `scrollToLine()` | Done |
| 2.6: `tv.reveal()` error handling | `src/markdownWeaveEditor.ts` | Done |
| 1.2 partial: separator larger, hover foreground only | `webview-ui/src/main.css` | Done |
| 1.2 partial: chevron removed, hover-delay dropdown | `webview-ui/src/breadcrumb.ts` | Done |
| 1.4: top-level headings when above first heading | `webview-ui/src/breadcrumb.ts` | Done |
| 1.6: cursor at end of heading on breadcrumb click | `webview-ui/src/breadcrumb.ts` | Done |
| 1.7: dropdown right-edge clamp | `webview-ui/src/breadcrumb.ts` | Done |
| 1.5 partial: CSS `overflow-x: auto` + scrollbar hide | `webview-ui/src/main.css` | Done (but broken — see below) |
| sticky breadcrumb attempt | `webview-ui/src/main.css` | Done but BROKEN — see below |

---

## Broken / Still Failing

### SCROLL BROKEN — URGENT
`body { overflow: hidden }` was added to `main.css` body rule. This completely breaks scrolling in the WebView. **Must be removed first thing.**

### Breadcrumb height changes on every keypress (B2 not fully fixed)
The `.bc-sep` separator uses `font-size: 16px`, which is taller than the container's `font-size: 13px`. When the separator appears (multiple ancestors) vs disappears (single ancestor), the container height changes. Fix: give `#breadcrumb` a fixed `min-height` and set `line-height` to prevent the 16px separator from expanding container height. The `visibility: hidden` on `:empty` did not fully solve B2 because the height varies with ancestor count, not just presence/absence.

### Breadcrumb not sticky
`position: sticky; top: 0` was added but it's not working. The breadcrumb "slides in and becomes hidden" as cursor moves down. Root cause not fully diagnosed — likely the sticky context is wrong (needs a scrollable ancestor, and with body `overflow: hidden` removed there may be none at the `#app` level). Needs a different approach. Consider `position: sticky` on `#app` level, or rethink layout so CM6 scroller is the scroll container and breadcrumb sits above it always.

### Horizontal scroll not working
Breadcrumb items shrink (get ellipsis) instead of scrolling. Fix: `.bc-segment` needs `flex-shrink: 0` so items don't compress; the container `overflow-x: auto` then provides scroll. Also the `max-width: 18em` on `.bc-segment` combined with `flex-shrink: 0` may need adjustment.

### Cursor jumps to line above when navigating back to a newly added heading
Intermittent. "When adding a heading, moving to next line, and then navigating back up one line, cursor jumps at the line above the heading." Not reproduced for existing headings. Likely a timing issue: new heading boundary is added to `collectMarkdownHiddenBoundaries` before the Lezer tree fully updates, causing `adjustHiddenBoundaryTransaction` to snap cursor to wrong position. **Needs `adjustHiddenBoundaryTransaction` and `moveCursorOutsideHiddenBoundary` read before fixing.**

### Selecting lines above heading + delete also deletes `#` 
"When selecting a couple of lines above a heading (including the adjacent line above the heading) and deleting the selection, it also deletes the `#` character from the heading." Root cause: `expandSelectionToHiddenBoundaries` is expanding the selection end into the hidden `##` prefix of the heading below. **Needs `adjustHiddenBoundaryTransaction` read before fixing.**

### Cursor lands before closing `**` markers after clicking
"Clicking at the end of decorated elements moves the cursor before the closing markdown markers." After the `<= to` revert, the boundary snap (`moveCursorOutsideHiddenBoundary`) should snap cursor from `contentTo` of the marker boundary to `boundary.to`. But it's apparently not firing for emphasis/heading markers, or the snap is to the wrong position. **Needs `moveCursorOutsideHiddenBoundary` and `adjustHiddenBoundaryTransaction` read before fixing.**

### Outline auto-highlight (2.6) not working
`tv.reveal()` call is still not highlighting the current heading as cursor moves. The `void → .then()` fix may not be sufficient. Root cause: VS Code's `treeView.reveal()` may silently fail if tree items haven't been rendered (lazy `getChildren` hasn't been called). Consider adding a `setTimeout(50)` delay before revealing.

---

## Code Locations Relevant to Remaining Bugs

### Boundary snap system (for cursor/selection bugs)
- `webview-ui/src/decorations/index.ts` around line 143–155: `linkClickExtension` which calls `moveCursorOutsideHiddenBoundary` on `click`; `markdownBoundarySnapping` which is `EditorState.transactionFilter.of(adjustHiddenBoundaryTransaction)`
- `adjustHiddenBoundaryTransaction` — NOT YET READ. Located somewhere after line 155 in `index.ts`. This is the transaction filter that intercepts cursor moves and snaps them.
- `moveCursorOutsideHiddenBoundary` — NOT YET READ. Called on click events.
- `collectAllHiddenBoundaries` at line 827 in `index.ts` — combines `collectMarkdownHiddenBoundaries` + `collectBlockHiddenBoundaries`
- `collectMarkdownHiddenBoundaries` at line 834 in `index.ts` — collects heading and inline (emphasis/code/link) hidden boundaries. DOES include inline markers.
- `expandSelectionToHiddenBoundaries` in `ranges.ts:68` — already read. Expands selection to include hidden boundaries at selection edges.
- `getHiddenBoundarySnapPosition` in `ranges.ts:48` — already read. Snaps cursor at `contentFrom`/`contentTo` to `from`/`to`.

### Breadcrumb layout
- `webview-ui/src/main.css`: breadcrumb section starts around line 33
- `webview-ui/src/breadcrumb.ts`: fully rewritten in last session

### Outline reveal
- `src/markdownWeaveEditor.ts` around line 361: `revealHeadingForLine`

---

## Next Session Work Order

**Step 1 (immediate):** Remove `overflow: hidden` from `body` rule in `main.css`.

**Step 2:** Read `adjustHiddenBoundaryTransaction` and `moveCursorOutsideHiddenBoundary` in `index.ts` (lines 155–826 range). Understand how cursor snap fires on click and on transaction filter.

**Step 3:** Fix the three boundary bugs:
- Cursor jump on new heading navigation
- Selection delete including `#`
- Cursor before closing markers

**Step 4:** Fix breadcrumb layout issues:
- Remove `position: sticky` (or fix it properly — needs diagnosis of scroll context)
- Fix height jumping: give `#breadcrumb` a fixed `min-height` matching the tallest possible state; reduce `.bc-sep` font-size or set `line-height: 1` on the container
- Fix horizontal scroll: `flex-shrink: 0` on `.bc-segment`

**Step 5:** Fix outline auto-highlight (2.6): add `setTimeout(50)` in `revealHeadingForLine`.

**Step 6:** Add more top/bottom padding to breadcrumb container (user requested "double the current one" — currently `7px`, so `14px`).

---

## Current State of main.css breadcrumb section (as of end of last session)

```css
body {
  overflow: hidden;   /* <-- REMOVE THIS */
  ...
}

#breadcrumb {
  position: sticky;   /* <-- may need to remove or fix */
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0;
  margin: -20px -28px 12px;
  padding: 7px 28px;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid ...;
  background: ...;
  font-size: 13px;
  white-space: nowrap;
}

#breadcrumb::-webkit-scrollbar { display: none; }

#breadcrumb:empty {
  visibility: hidden;
  border-bottom: none;
}

.bc-sep {
  margin: 0 5px;
  font-size: 16px;   /* <-- this drives height variation */
  opacity: 0.5;
}

.bc-segment {
  display: inline-flex;
  flex-shrink: 1;   /* <-- change to flex-shrink: 0 */
  align-items: center;
  min-width: 0;
  max-width: 18em;
}
```
