# Phase 02 Decisions

This document records Phase 2 implementation deviations from `plan.md` and follow-up decisions that future phases should read before changing related behavior.

## Deviations From Plan

### Webview edit messages use document snapshots

Phase 2 described forwarding each CM6 change as:

```ts
{ type: 'edit', from, to, insert }
```

The implementation sends a richer message:

```ts
{
  type: 'edit',
  changes: [{ from, to, insert, deleted }],
  before,
  after,
  source: 'webview'
}
```

Files:

- `webview-ui/src/bridge.ts`
- `webview-ui/src/editor.ts`
- `src/markdownWeaveEditor.ts`

Reason:

Applying individual async offset edits caused stale-offset corruption after save, close, and reopen. The host now uses the webview `after` snapshot and computes a minimal replacement from the current VS Code document text.

Implication:

Any code that dispatches CM6 transactions should let the normal `EditorView.updateListener` forward the edit. Do not post legacy `{ from, to, insert }` messages unless the host handler is updated to support both formats.

### External sync uses a minimal text diff

The phase allowed full-document replacement for v1, but the implementation computes a simple prefix/suffix replacement and maps the current CM6 selection through that change set.

File:

- `webview-ui/src/editor.ts`

Reason:

Full replacement disturbed cursor preservation and could leave reopened documents in surprising raw states.

Implication:

External sync should keep using `setContent()` instead of dispatching full-document replacements directly.

### Selection reveal is delayed during pointer selection

Selection-aware decorations still reveal intersecting nodes, but raw reveal is deferred while mouse selection is actively in progress.

Files:

- `webview-ui/src/decorations/index.ts`
- `webview-ui/src/decorations/selectionUtils.ts`

Reason:

Immediate decoration changes during drag selection made the document layout jump under the pointer.

Implication:

Widgets added in Phase 3 should not assume every `selectionSet` immediately rebuilds decorations. Selection-sensitive UI should tolerate delayed rebuild after pointer selection ends.

### Non-empty selection reveals every intersecting node

The implementation intentionally keeps `isEditing()` broad for non-empty selections:

```ts
range.from <= to && range.to >= from
```

File:

- `webview-ui/src/decorations/selectionUtils.ts`

Reason:

Selected markdown regions should reveal source for every intersecting markdown node.

Implication:

Phase 3 block widgets and advanced renderers should use the shared selection helper so selected blocks reveal raw source consistently.

### Raw reveal is focus-gated and keeps preview styling

Raw reveal only applies while the editor has focus. Active elements keep their semantic preview styling while markdown syntax markers are visible.

Files:

- `webview-ui/src/decorations/index.ts`
- `webview-ui/src/decorations/selectionUtils.ts`

Reason:

CM6's default stored cursor at offset 0 could leave the first markdown node in raw source mode even when no cursor was visibly active. Dropping all styling in source mode also caused distracting layout jumps.

Implication:

New decorations should avoid dropping all styling in source mode. Prefer hiding or showing syntax markers independently from semantic styling decorations.

### Image decorations are regex-scanned in visible ranges

Phase 2 requested a handler for Lezer `Image` nodes. The implementation scans visible text with a markdown image regex:

```ts
/!\[([^\]\n]*)\]\(([^)\n]*?)(?:\s+=(\d+)x(\d+))?\)/g
```

File:

- `webview-ui/src/decorations/index.ts`

Reason:

The Lezer markdown parser did not parse Typora-style image dimensions (`=WxH`) as part of an `Image` node.

Implication:

Phase 5 image paste/drag-and-drop and Phase 10 performance work should account for regex image detection. If image syntax support expands, replace this with a parser extension or a dedicated scanner module instead of adding more regex logic inline.

### Image URI resolution is asynchronous and cached

Image URI resolution goes through the extension host and the webview bridge caches resolved URI results by markdown `src`.

Files:

- `webview-ui/src/bridge.ts`
- `webview-ui/src/widgets/ImageWidget.ts`
- `src/markdownWeaveEditor.ts`

Reason:

Image URI resolution is asynchronous, and repeated selection-only decoration rebuilds were causing flicker.

Implication:

If Phase 5 or Phase 10 changes image path handling, keep cache invalidation in mind. The current cache is keyed by the raw markdown `src` string.

### Image source mode retains the preview

When an image is in source mode, the raw markdown remains visible and a preview or fallback is rendered below it.

Files:

- `webview-ui/src/decorations/index.ts`
- `webview-ui/src/widgets/ImageWidget.ts`
- `webview-ui/src/bridge.ts`
- `src/markdownWeaveEditor.ts`

Reason:

Testing showed this matches the desired Obsidian-style editing behavior better than hiding the preview while editing image syntax.

Implication:

If Phase 3 or later replaces image widgets, preserve the raw-source-above-preview behavior.

### Horizontal rules use a non-block replacement widget

The plan specified a block replacement widget for horizontal rules. The implementation uses a non-block replacement widget styled as a full-width rule.

Files:

- `webview-ui/src/decorations/index.ts`
- `webview-ui/src/widgets/HrWidget.ts`
- `webview-ui/src/main.css`

Reason:

CM6 block replacement was not reliably visible for `---`, `___`, and `***` in testing.

Implication:

If later phases introduce richer block widgets, do not regress horizontal-rule visibility.

### List items reveal only the editable prefix

List items no longer switch the whole line to raw source when the caret is in the list item text. The list marker and task checkbox stay rendered unless the caret is in the marker/task prefix range.

Files:

- `webview-ui/src/decorations/index.ts`
- `webview-ui/src/main.css`

Reason:

Whole-line reveal made list editing visually jumpy and exposed too much raw markdown during normal text editing.

Implication:

Nested list editing and future list commands should preserve prefix-granularity reveal behavior.

### Tab and Shift+Tab are Markdown-list-aware

Tab and Shift+Tab have custom list handlers. Pressing Tab inside a list item changes the raw indentation enough for Lezer/CommonMark to parse a real nested `OrderedList` or `BulletList`, and ordered markers are rewritten for the target level.

File:

- `webview-ui/src/editor.ts`

Reason:

Default indentation could make preview numbering look correct while leaving copied raw markdown with incorrect nested ordered-list numbers.

Implication:

Future list commands should update the source markdown, not only the rendered decoration, so copied markdown matches the preview.

### Fenced code blocks intentionally remain raw in Phase 2

Phase 2 did not implement code block widgets or syntax highlighting. Fenced code blocks render as raw markdown.

Reason:

Fenced code block rendering starts in Phase 3 (`P3-T1` through `P3-T5`).

Implication:

Do not treat raw fenced code blocks as a Phase 2 regression. Phase 3 should introduce the widget while preserving the same selection/editing rules.

## Decisions

### Markdown setext headings only exist for H1 and H2

The phase task mentions `SetextHeading1` and `SetextHeading2`; these are the complete set of Markdown setext heading levels. Markdown has no `SetextHeading3` through `SetextHeading6` syntax, so only ATX headings cover levels 3-6.

Implication:

Do not add non-standard setext heading levels unless MarkdownWeave explicitly adopts a custom syntax extension.

### CM6 content padding is 16px

The CM6 content padding is set to `16px`.

File:

- `webview-ui/src/editor.ts`

Implication:

Theme work in Phase 8 should preserve this as the current baseline unless a user setting overrides it.

### Webview shell has outer padding

The webview shell has outer padding around the editor container.

File:

- `webview-ui/src/main.css`

Implication:

Theme and layout work should treat this as the current spacing baseline.

### Missing images render a full-width fallback

The extension host checks local image existence before returning a webview URI. Missing images show a padded, centered fallback:

```text
"<image_name>" could not be found.
```

Files:

- `src/markdownWeaveEditor.ts`
- `webview-ui/src/widgets/ImageWidget.ts`
- `webview-ui/src/main.css`

Implication:

Later image handling should keep missing-file behavior deterministic instead of relying only on browser image load errors.

### Image resize handles are selection-only

Image resize handles are hidden by default and shown only for the selected image widget.

File:

- `webview-ui/src/widgets/ImageWidget.ts`

Implication:

Future image UI should avoid persistent resize chrome unless the image is selected.

### Inline boundary clicks snap outside markers

Emphasis, strikethrough, and inline-code boundary clicks snap the cursor outside hidden markers when clicking the visual start or end of styled text.

File:

- `webview-ui/src/decorations/index.ts`

Implication:

Future inline decorations should avoid placing the cursor inside hidden marker ranges unless the user clearly clicks inside the raw syntax.

### Checkbox clicks stay in preview mode

Checkbox widgets ignore CM mouse handling and place the cursor after the task marker when toggled, so checkbox clicks stay in preview mode instead of revealing the raw list prefix.

File:

- `webview-ui/src/widgets/CheckboxWidget.ts`

Implication:

Future task-list behavior should preserve preview-mode toggling.

### Rendered list markers are computed by list structure

Rendered ordered-list markers are computed from each `OrderedList` node's direct `ListItem` children, so nested ordered lists restart at `1.`. Unordered task-list items suppress the bullet marker. Unordered non-task markers cycle by nesting depth through disc, circle, and square glyphs.

File:

- `webview-ui/src/decorations/index.ts`

Implication:

Rendered list marker behavior should stay based on parsed list structure, while edit commands must still keep raw markdown source correct.
