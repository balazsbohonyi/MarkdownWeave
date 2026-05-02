# Phase 03 Decisions

This document records Phase 3 implementation deviations from `plan.md` and durable decisions from `revised-plan.md`.

## Deviations From Plan

### Shiki uses v4, class-based CSS, and curated language loading

The original Phase 3 plan described Shiki v3 output with inline token styles. Phase 3 uses Shiki v4 with the JavaScript regex engine, `light-plus` / `dark-plus`, a curated static language map, and class-based token CSS.

Reason:

The revised plan requires Shiki v4 and class-based CSS so the webview CSP does not need `unsafe-inline` for highlighted code token colors.

Implication:

Code highlighting requests return sanitized Shiki HTML plus generated CSS. Unknown languages fall back to plaintext instead of dynamic arbitrary grammar imports.

### Block widgets preserve focus-gated reveal semantics

Block widgets use shared focus-gated reveal rules from Phase 2, with Phase 3's two-phase selection model layered on top. Empty cursor positions reveal editable source when the cursor enters a source range. Hidden inline markers and height-sensitive previews stay stable while selection is pending and reveal raw source only after the selection is committed. Source-editable ranges can reveal raw while a non-empty source selection intersects them, so selection can operate on canonical source instead of opaque widgets.

Reason:

Phase 2 established focus-gated reveal semantics to avoid accidental raw reveal while the webview is blurred. Manual testing showed live non-empty selection reveal caused visible selection jumps when hidden markdown markers appeared during selection. Later source-selection testing showed that fenced code and image source regions need a narrower exception so selection can operate on their canonical source instead of an opaque widget.

Implication:

New block widgets should use the shared reveal helpers and selection reveal state rather than independent cursor checks. Preview mode should remain stable during active mouse or keyboard selection unless the range is intentionally source-editable during selection.

### Math scanning is conservative

Inline and display math are detected with scanner logic instead of extending the Markdown parser. The scanner skips code, links, images, escaped delimiters, and currency-like dollar usage.

Reason:

The revised plan prefers conservative post-parse scanning for Phase 3 to avoid broad grammar changes.

Implication:

Some ambiguous `$...$` sequences intentionally remain raw markdown until math parsing rules are expanded deliberately.

### Embedded HTML uses DOMPurify

Embedded HTML is sanitized with DOMPurify using the Phase 3 allowlist. Dangerous elements, event handlers, unsafe URLs, and arbitrary attributes are stripped before rendering.

Reason:

The original plan required sanitization; the revised plan selects DOMPurify as the implementation.

Implication:

Only simple same-line inline HTML pairs are rendered inline. Complex inline HTML remains raw. Block HTML renders through sanitized widgets.

### Local HTML images resolve through the existing host URI resolver

Sanitized `<img src>` values in HTML widgets are resolved through the extension host's existing local image URI resolver and use the same deterministic missing-image behavior as Markdown image widgets.

Reason:

Webviews cannot load arbitrary workspace file paths directly, and Phase 2 already established a cacheable host resolver.

Implication:

HTML image rendering depends on asynchronous host responses and may update after the widget first mounts.

### Post-testing fixes replace opaque code widgets with editable token decorations

After manual Phase 3 testing, fenced code blocks were changed from opaque replacement widgets to a hybrid model: inactive blocks use Shiki-rendered HTML previews, while active blocks use editable CodeMirror source ranges with Shiki token decorations.

Reason:

Opaque widgets made selection, keyboard navigation, Tab insertion, and paste behavior unreliable inside code blocks.

Implication:

Code block source remains directly editable. Inactive code blocks keep the richer Shiki theme rendering from the original Phase 3 implementation; active code blocks reveal fences and keep syntax highlighting on the editable code text.

### Host/webview document snapshots use normalized line endings

The webview receives LF-normalized content snapshots and indentation metadata from the extension host. Host edits map normalized offsets back to VS Code document positions and reinsert text using the document's native EOL.

Reason:

CodeMirror normalizes document text to LF internally, while user files may use CRLF. Offset-based edits against raw VS Code document text can drift in CRLF files.

Implication:

Future webview edit logic should keep using normalized snapshots and host-side EOL restoration instead of mixing CM6 offsets with raw CRLF host text.

### Async block widgets request CodeMirror remeasurement

Widgets whose height can change after mounting now request a CodeMirror measurement pass after rendering or resolving external data.

Reason:

Manual testing showed cursor and click positions could drift after KaTeX, Mermaid, sanitized HTML fallbacks, HTML images, and table widgets changed their rendered height.

Implication:

Future async widgets should call `view.requestMeasure()` after DOM size changes.

### Block widget roots avoid vertical margins

Block widget root elements do not use vertical CSS margins. Spacing must be implemented with measured height-affecting styles, such as padding or explicit internal layout.

Reason:

CodeMirror does not include external margins in block widget height measurement. Vertical margins on widget roots make mouse hit-testing and keyboard vertical navigation resolve to lines below or above the intended source position.

Implication:

Future block widgets should keep root margins at `0` and request remeasurement after any asynchronous size change.

## Decisions

### Widget raw state is session-only

Table raw toggles and frontmatter expansion are stored only in CM6 state fields for the active editor session. They are not persisted through `vscode.setState()` in Phase 3.

### Mermaid is treated as a special code block language

Fenced code blocks with language `mermaid` bypass Shiki and render through the lazy Mermaid renderer. Invalid diagrams show a deterministic error fallback with raw diagram text.

### Highlighting and heavy renderers are lazy

Code highlighting, KaTeX rendering, Mermaid rendering, and HTML image URI resolution are requested only when relevant syntax exists and, where applicable, when widgets enter the observed viewport overscan.

### Frontmatter is excluded from normal markdown decorations

When a document starts with YAML frontmatter, the opening and closing `---` markers are treated as frontmatter delimiters, not horizontal rules.

### Optimistic heading styling is visual only

While the cursor is on a line starting with `#` through `######`, MarkdownWeave applies heading-size styling before the required space exists. This does not change the markdown source and does not treat invalid heading syntax as a parsed heading.

### Tables use toggle-only raw mode

Tables open pipe-table source only through the table source toggle button and return to preview only through the same toggle. Cell-level rich editing remains out of scope for Phase 3.

Table preview participates in the shared collapsed-block navigation rules instead of using table-specific cursor reveal behavior.

### Collapsed block widgets use source-aware vertical navigation

Collapsed preview ranges share a custom ArrowUp/ArrowDown handler that moves by source lines while treating each collapsed preview range as one visual stop. Most collapsed widgets also expose their source ranges through `EditorView.atomicRanges`; inactive fenced code previews are intentionally excluded from atomic ranges so Shift-selection can enter their source one line at a time.

Reason:

CodeMirror's default vertical movement is coordinate-based. When multiple source lines are replaced by one block widget, default ArrowUp/ArrowDown can skip unrelated visible content and jump to a distant line.

Implication:

Tables, inactive fenced code previews, Mermaid diagrams, display math previews, sanitized HTML blocks, HTML image blocks, and collapsed frontmatter should use the same vertical navigation behavior. Shift+ArrowUp/ArrowDown extends the source selection through the same collapsed-range logic. Custom vertical navigation must explicitly request `EditorView.scrollIntoView` so the viewport follows downward cursor movement just as it does for native CodeMirror movement. The editor also keeps CodeMirror's scroller as a constrained flex child and runs a measured selection-update fallback so the caret remains visible when the webview viewport clips the editor. Editor-level horizontal scrolling is disabled and reset during cursor navigation; individual widgets that truly need horizontal overflow must own it locally.

### Code block previews wrap instead of scrolling horizontally

Fenced code previews keep their Shiki highlighting but wrap long lines within the code block instead of creating horizontal scrollbars or widening the editor scroller.

Reason:

Code block horizontal overflow can shift the whole CodeMirror scroller horizontally, making the editor content appear to lose its left padding in narrow VS Code windows.

Implication:

Code block widgets should stay at `max-width: 100%` of their parent. Long code lines wrap visually in preview mode; the markdown source remains unchanged.

Inactive code block previews reserve vertical room for the closing fence so switching to active source mode does not grow the block height just because the closing fence becomes visible. Mermaid previews are excluded from this height-stability rule because diagrams and source are intentionally different views.

### Code blocks preserve source whitespace and stabilize active highlighting

Inactive Shiki previews preserve source whitespace inside each rendered code line without preserving Shiki's generated formatting newlines between line spans. Active fenced code editing inserts literal tab characters on `Tab`, uses the document tab size for visual alignment, and keeps the most recent compatible Shiki token decorations while a new async highlight is pending.

Reason:

Shiki's formatted HTML contains newline text nodes between rendered line spans; preserving those parent-level newlines displayed empty rows between adjacent source lines. Active editing also changed the exact highlight cache key on every keystroke, causing the block to briefly drop to uncolored text until the next Shiki result arrived.

Implication:

Code blocks should treat source whitespace as canonical content, while renderer-generated whitespace remains layout-only. Active code highlighting may temporarily reuse mapped tokens from the previous highlight across unchanged prefix/suffix regions until Shiki returns fresh tokens for the edited code.

### Fenced code blocks are keyboard-enterable source regions

Inactive fenced code previews remain rendered when the cursor is merely above or below them. ArrowDown from the line above enters the source at the opening fence, ArrowUp from the line below enters the source at the closing fence, and movement inside the active block proceeds line by line through the opening fence, code body, and closing fence. Escape collapses an active fenced block by moving the cursor outside the fenced source.

Reason:

Opaque fenced code previews should behave like source ranges during keyboard navigation and selection, while still presenting Shiki previews when inactive.

Implication:

Non-Mermaid fenced code blocks reveal source when the cursor or a non-empty source selection intersects that specific fenced source range. Global pointer selection enters pending state only after the pointer moves past the drag threshold, so simple document clicks remain normal caret placement. Pending selection state alone must not reveal every code block in the document. Active fenced blocks use one preview-like themed container where the opening fence, language marker, body, and closing fence are visually part of the same code block.

Direct drag-selection inside an inactive code preview is intentionally not supported. A first click reveals the fenced source, and selection inside the code block uses normal source selection after the source is active.

### Hidden source reveal snaps to marker boundaries

Sanitized inline HTML tags and ATX heading markers follow the same raw-reveal boundary behavior as markdown emphasis and inline code markers: entering rendered content at the opening boundary snaps the cursor before the opening marker or tag, and entering at the closing boundary snaps after the closing marker or tag.

Reason:

Without boundary snapping, revealing raw source places the cursor after the opening marker or tag, which makes the cursor appear to move inside hidden syntax.

Implication:

Future inline decorations that hide source delimiters should preserve outer-boundary cursor positions when raw source is revealed.

Non-empty selections use a two-phase model for hidden inline markers and collapsed previews whose rendered height should remain stable. While the user is actively selecting with the mouse or keyboard, MarkdownWeave keeps those previews stable and does not reveal hidden markdown markers. When the selection is committed, raw markdown is revealed and selection endpoints expand outward to hidden source boundaries when an endpoint lands exactly at a visible content boundary.

Source-editable ranges that need real character and line selection can opt into raw visibility while a selection is active. Non-Mermaid fenced code blocks, Markdown image source, and HTML image source use this path when a selection reaches their source range. Display math and generic sanitized HTML blocks stay on the deferred reveal path: they remain preview widgets during active selection and reveal raw markdown only when the selection is committed. Mermaid previews remain the exception: mouse selection across an inactive Mermaid diagram keeps the rendered chart visible and uses the preview selection outline; once Mermaid source mode is active, source selection behaves like any other fenced code block.

Selection commit points are mouse release for pointer selection, relevant key release for keyboard selection, copy, blur, and programmatic select-all. Copy commits before reading selected text so the clipboard receives the expanded raw markdown source.

Selection expansion is direction-aware: it only moves an endpoint outward when the selected range crosses into visible content from that boundary. Selecting hidden source markers from outside the rendered content must not snap the endpoint back to the opposite boundary. Simple mouse clicks still use boundary snapping for cursor placement.

### Display math supports single-line and multiline dollar blocks

Display math detection supports both multiline `$$` blocks and single-line `$$ ... $$` formulas. Inline math remains conservative to avoid escaped dollars and currency-like values.

### Mermaid labels use SVG text under strict sanitization

Mermaid rendering uses SVG text labels instead of HTML labels so plain labels and emoji render without allowing Mermaid-generated HTML label content.

### Mermaid previews use bounded intrinsic sizing and session-only resize

Mermaid diagrams no longer expand to the full available editor width by default. The preview picks a bounded width from the rendered SVG aspect ratio, using narrower defaults for portrait diagrams and wider defaults for landscape diagrams. Users can drag a resize handle to adjust the preview width for the active session.

Reason:

Full-width Mermaid SVG scaling made portrait diagrams excessively large in maximized VS Code windows, while Markdown has no established source syntax equivalent to image `=WxH` sizing for Mermaid fences.

Implication:

Mermaid resize state is preview-only and session-only in Phase 3. It must not modify the fenced Mermaid source or introduce non-standard sizing comments. The desired session width is remembered while the rendered width remains visually clamped by the current parent width.

Mermaid previews must not introduce local horizontal scrollbars or widen the editor. Default and user-resized widths are clamped to the available parent width, and oversized SVG content is scaled down inside the preview.

When Mermaid source is active, it uses the same editable fenced-code treatment as other fenced code blocks: the opening fence, `mermaid` language marker, body, and closing fence remain visible in source form, without rendering a live diagram preview.

Mermaid active source currently remains plain editable source instead of Shiki-highlighted source because the bundled Shiki language set does not include a Mermaid grammar.

Mermaid, Markdown image, and HTML image resize handles appear on hover and during active drag only, so they hide again once the resize completes. Mermaid handles overlap the preview edge like image handles, but remain width-only to preserve diagram aspect ratio.

Mermaid previews must not show raw diagram source as a loading placeholder. Returning from active source mode should either reuse the cached rendered SVG immediately or show an empty preview surface while Mermaid renders.

Mouse selection across Mermaid previews keeps the rendered diagram in preview mode and shows a source-selection outline instead of revealing raw source. This avoids the height changes that occur when a tall rendered chart collapses to shorter fenced source during pointer drag selection. Empty cursor navigation can still enter Mermaid source at the fence boundary, and Mermaid previews expose a hover-only source toggle button that places the cursor at the opening fence.

Once Mermaid source mode is active, clicking and selecting inside the fenced source must behave like any other editable code block. The source remains active while the selection intersects the fenced Mermaid range, and clicking outside the source range returns the block to preview mode.

Mermaid preview borders are hidden by default and shown on hover alongside the source toggle and resize handle.

Mermaid render/cache identity includes the source range in addition to the diagram content hash. Identical Mermaid diagrams can appear multiple times in one document, so widget DOM reuse is allowed only for the same source instance, not merely the same diagram text.

### Partial horizontal-rule markers stay raw while editing

Single list markers such as `-` and partial setext markers such as `--` remain raw when the cursor is on that marker line. Once the syntax becomes an actual horizontal rule, the normal horizontal-rule preview applies.

Reason:

While typing `---`, CodeMirror's Markdown parser temporarily interprets `-` as a list item and can interpret `--` as a setext heading underline. Applying those previews mid-sequence causes indentation and heading styling flicker.

Implication:

Marker decorations should avoid presenting transient parser interpretations while the cursor is actively typing ambiguous horizontal-rule syntax.

### Resized Markdown images are persisted as HTML image tags

Markdown image syntax with Typora-style `=WxH` sizing remains supported for existing documents, but new Markdown image resize operations write a safe `<img src="..." alt="..." width="..." height="...">` tag.

Reason:

VS Code's built-in Markdown preview does not render `![alt](src =WxH)` as a sized image; it treats the size suffix as part of the URL. HTML image attributes preserve size while rendering in VS Code's built-in preview.

Implication:

Resizing a Markdown image can intentionally convert that image from Markdown image syntax to HTML image syntax. The source remains canonical, and MarkdownWeave continues to render both forms.

### HTML image tags use image-style preview and resize

Safe HTML `<img>` tags render through a dedicated image widget instead of generic inline HTML decoration. Clicking reveals the raw `<img>` tag and keeps a preview available while editing. Drag-resizing writes or updates `width` and `height` attributes on the `<img>` tag.

Reason:

HTML images should behave consistently with Markdown image previews while preserving the user's choice to use HTML image syntax.

Implication:

HTML image resizing is an intentional source edit. Unlike Mermaid resizing, it is persisted in the markdown source through standard HTML attributes.

### Table previews show source selection with a rounded outline

When a non-empty source selection intersects a collapsed table preview, the table widget draws a thicker outline using the editor selection color. Table previews use the same `6px` border radius as code blocks.

Reason:

Collapsed table widgets otherwise make it hard to see that the underlying table source is part of the current source selection.

Implication:

Table text remains non-selectable in preview mode; selection is still source selection, represented visually by the table preview outline.

Table raw-mode toggles are inline overlay widgets attached to the end of the first table source line. They must not add a separate block below the raw table source, because that interferes with adding new rows after the table.

### Markdown content uses a centered readable column

MarkdownWeave caps the whole CodeMirror content surface at `1024px` and centers it horizontally inside the webview tab. The cap includes CodeMirror's existing `16px` content padding, while the webview shell keeps its outer `20px 28px` padding (`20px` top/bottom, `28px` left/right). Below `1024px`, the editor fills the available width.

Reason:

This matches Obsidian-style readable document layout without changing markdown source or adding a setting ahead of the planned configuration phases.

Implication:

The CodeMirror scroller remains full-width so the vertical scrollbar stays at the tab edge. Rendered preview blocks and revealed raw source share the same centered column. Blocks must not exceed the column: long text can break, tables use fixed layout with wrapped cells, and oversized images or diagrams are visually clamped without rewriting source dimensions on load.
