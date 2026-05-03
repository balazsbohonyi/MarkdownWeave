# Phase 04 Decisions

This document records Phase 4 implementation deviations from `plan.md` and durable decisions.

## Post-Testing Fixes

### Wiki link parser requires `before: 'Link'` priority

The `parseInline` entry for `WikiLink` must specify `before: 'Link'`.

Without it, `@lezer/markdown`'s built-in `Link` inline parser runs first for every `[` character and immediately advances past it (returning `start + 1`) to register a link-opener delimiter. Our WikiLink parser never sees `[[` at position 0, so no `WikiLink` nodes are produced. The GFM parser then treats the inner `[plan]` as a link reference, causing `linkDecoration` to partially style the text — hiding one `[` and one `]`, yielding the visible `[plan]` artefact. Every downstream bug (wrong rendering, cursor not revealing raw markdown, broken-link styling absent, Ctrl+Click silent) traces to this single missing field.

Fix: `before: 'Link'` in `webview-ui/src/wikiLink/parser.ts` line 15.

## Deviations From Plan

### Unified widget rendering for all wiki link variants

The Phase 4 plan (P4-T2/T3/T4) described separate `Decoration.replace` on `[[`/`]]` markers with `Decoration.mark` on the visible content (the marker-hiding approach used for emphasis and links).

Instead, all wiki link variants (`[[page]]`, `[[page|alias]]`, `[[page#heading]]`, `[[page#heading|alias]]`) use a single `Decoration.replace({ widget: WikiLinkWidget })` spanning the full `[[...]]` range.

Reason:

`[[page#heading]]` requires synthesizing the display text "page > heading" where the `>` separator does not exist in the source. The marker-hiding approach cannot insert content; a widget is required. Rather than using two different mechanisms for different variants, all variants use the same widget path for consistency.

Implication:

The `WikiLinkWidget` receives the pre-computed display text and existence status at decoration build time. The widget is pure-display: it renders a `<span>` with `mw-wikilink` or `mw-wikilink-broken` class. Cursor entering `[node.from, node.to]` triggers `isEditing()` and removes the widget, revealing raw `[[...]]` source.

### Section heading display is "page > heading" (non-configurable in Phase 4)

The plan notes heading display as configurable. Since settings support is deferred to Phase 9, the separator is hardcoded as `" > "` in the decoration handler (`wikiLinkDecoration` in `decorations/index.ts`).

Implication:

Phase 9 can replace the hardcoded string with a configurable setting. No structural change will be needed — only the string value changes.

### Wiki link status cache is per-editor-session on both sides

The host-side `wikiLinkCache` (`Map<string, { exists, uri }>`) is a closure variable inside `resolveCustomTextEditor`, scoped to each editor instance. The webview-side `wikiLinkStatusField` (CM6 StateField) is also ephemeral per session.

Implication:

Cache is not shared across editor tabs and is discarded on editor close. This matches the image URI cache pattern established in Phase 1. For Phase 4 scale this is sufficient.

### `findWikiLinkTargetAt` uses `node.getChild()` not `childNodes()`

The click handler helper `findWikiLinkTargetAt()` (in `decorations/index.ts`) uses the public Lezer `SyntaxNode.getChild()` API instead of the module-private `childNodes()` helper. This avoids exporting internal utilities.

## Decisions

### Ctrl+Click on broken wiki links is silent

When a user Ctrl+Clicks on a `[[page]]` where the target file does not exist, the handler returns true (consuming the event) but performs no action and shows no notification. The visual broken-link styling is the user's indicator that the target does not exist.

### File event listeners invalidate the full wiki link cache

`onDidCreateFiles`, `onDidDeleteFiles`, and `onDidRenameFiles` all call `invalidateWikiLinkCache()` which clears the entire host-side cache and posts `clearWikiLinkCache` to the webview. The webview bridge clears its local `wikiLinkStatusCache` and the ViewPlugin re-requests all visible targets on the next update.

This is coarse-grained (any file event clears the whole cache) but correct. For Phase 4 scope, targeted invalidation is not needed.

### Empty targets, headings, and aliases are excluded at parse time

The Lezer inline parser (`wikiLink/parser.ts`) rejects:
- Empty targets: `[[]]` or `[[#heading]]` (returns -1)
- Empty headings: `[[page#]]` — `WikiLinkHeading` node is not emitted
- Empty aliases: `[[page|]]` — `WikiLinkAlias` node is not emitted.This prevents the decoration handler from needing to guard against empty strings.
