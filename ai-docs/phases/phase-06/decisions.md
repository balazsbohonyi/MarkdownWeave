## Deviations From Plan

### T1: remark/unified not installed
**Original plan:** Install remark/unified on extension host for AST-based heading extraction.
**Actual:** No remark installed. The webview already has a full Lezer parse tree via CM6; headings are extracted there using `syntaxTree(state).iterate()` and posted to the host via `postMessage({ type: 'headings', items })`. This avoids a ~150 KB dependency and a duplicate parse pass.

New file: `webview-ui/src/headings.ts` — `extractHeadings(state: EditorState): HeadingItem[]`.

### T2: TreeView provider (not remark heading extraction)
**Original plan:** Extract headings from remark AST.
**Actual:** T1 already handles extraction. T2 implements the VS Code TreeView provider (`src/outlineProvider.ts`) — original plan's T3.

### T3–T5: Task numbering shifted
Because T1 and T2 merged their original scopes, the remaining tasks shift:
- Original T4 (click-to-scroll) → done as T3
- Original T5 (active heading highlight) → done as T4
- Original T6 (auto-refresh) → done as T5

### T7–T8: Breadcrumbs retained in webview
**Decision:** Implement breadcrumbs inside the webview (not skip, not via VS Code native API).

**Why:** VS Code's breadcrumb cannot show heading-level symbols for custom editors — there is no API to expose cursor position from a webview-based editor to VS Code's breadcrumb system. Implementing breadcrumbs in the webview DOM is the only way to get heading-level navigation, and it is Electron-portable (the extension will be ported to a standalone Electron app where VS Code APIs won't exist).

Original T7 → done as T6; original T8 → done as T7.

### scrollToLine vs scrollToHeading
A new `HostScrollToLineMessage` (`{ type: 'scrollToLine'; line: number }`) was added alongside the existing `scrollToHeading` (which uses heading text for wiki link anchor navigation). The outline uses `scrollToLine` (exact line known from Lezer), while wiki links keep using `scrollToHeading` (text-based search, no line info available).

## Decisions

- `HeadingItem` interface defined in both `webview-ui/src/headings.ts` (webview) and `src/outlineProvider.ts` (host) separately — no shared types file exists in the project.
- Breadcrumb `<nav id="breadcrumb">` placed as first child of `<main id="app">` with negative margins to break out of the 20px/28px app padding, giving it full width.
- Breadcrumb sibling dropdown uses `position: fixed` with `getBoundingClientRect()` — no popover API dependency.
- Initial headings sent to host immediately after document load (not only on change), so the outline populates without requiring the user to type.
