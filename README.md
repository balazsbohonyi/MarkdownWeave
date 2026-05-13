# Markdown Weave

> [!IMPORTANT]
> Markdown Weave is still a work in progress. The current beta focuses on the
> live-preview editing foundation and core Markdown decorations; later phases
> are still planned and may change as the extension is tested.

Markdown Weave is a VS Code extension that provides an Obsidian-style inline
WYSIWYG editing experience for Markdown files. Instead of splitting raw source
and rendered preview into separate panes, Markdown Weave renders Markdown in a
single editable view and reveals the raw syntax only around the element being
edited.

The project is designed for developers writing documentation, READMEs, and
wikis, as well as knowledge-management users who want a Typora or Obsidian-like
editing experience inside VS Code.

## Core Principle

The Markdown source file is the canonical document.

Markdown Weave does not reformat, normalize, or round-trip Markdown through a
rich-text document model. The file on disk remains the source of truth, and the
WYSIWYG effect is achieved with CodeMirror 6 decorations over the original
source text.

## Current Status

Completed through Phase 9:

- VS Code custom editor registration for `.md` and `.markdown` files.
- Webview-based editor shell with extension-host/webview messaging.
- CodeMirror 6 editor integration.
- Core inline and block decorations for common Markdown elements.
- Clickable links, image previews, image resizing, checkboxes, and nested list
  editing behavior for the currently implemented core decorations.
- Advanced block widgets for fenced code, tables, math, Mermaid diagrams,
  frontmatter, and sanitized embedded HTML.
- Shiki v4 syntax highlighting, KaTeX rendering, Mermaid rendering,
  and DOMPurify-based HTML sanitization.
- Wiki links (`[[page]]`, `[[page|alias]]`, `[[page#heading]]`) with file
  existence checks, broken-link styling, and Ctrl+Click navigation.
- Keyboard shortcuts for bold, italic, strikethrough, inline code, links,
  fenced code blocks, and heading level cycling.
- Image paste from clipboard — saves the image next to the document (or in a
  configurable subfolder) and inserts the Markdown image link.
- Markdown Weave Outline sidebar with heading navigation, auto-refresh, and
  active-heading synchronization as the cursor moves.
- Webview breadcrumb navigation with heading path display, sibling dropdowns,
  click-to-scroll behavior, and automatic hiding when a document has no headings.
- Side-by-side mode that opens the native Markdown source editor on the left
  and Markdown Weave on the right, with bidirectional passive scroll sync.
- Native Markdown editor toolbar access for opening the current file with
  Markdown Weave, with Alt-click support for opening Markdown Weave to the side.
- Explorer context menu actions for opening directly with Markdown Weave or
  opening Markdown Weave to the side.
- Standalone Markdown Weave toolbar actions for showing the native source and
  opening the document in side-by-side mode.
- Light, dark, and sepia reading themes with full-override color palettes,
  bundled editorial fonts (Inter + Merriweather) available as an opt-in setting,
  and auto-detection of the active VS Code theme kind.
- User settings with live forwarding to open Markdown Weave editors, including
  reading theme, typography, renderer toggles, custom CSS, image paste folder,
  and opt-in default Markdown editor association.

Still planned:

- Performance hardening and publishing automation.

## Usage

1. Open a Markdown file in VS Code.
2. Use the Explorer context menu command **Open with Markdown Weave**.
3. Edit directly in the rendered document.

You can also use **Open with Markdown Weave to the Side** from the Explorer
context menu or **Markdown Weave: Open to the Side** from the Command Palette to
open the native Markdown source editor on the left and Markdown Weave on the
right. Markdown files opened in VS Code's native editor also show a Markdown
Weave toolbar button; the default click opens directly with Markdown Weave, and
Alt-click opens Markdown Weave to the side.

Markdown Weave does not take over Markdown files on install. To make it the
default editor for `.md` and `.markdown` files, enable
`markdownWeave.openAsDefaultMarkdownEditor`. The setting updates VS Code's
global `workbench.editorAssociations` entries for Markdown files. Turning it
off removes only associations that point to Markdown Weave.

When the cursor enters a decorated Markdown element, Markdown Weave reveals the
raw syntax needed for editing. When the cursor leaves, the rendered decoration
is restored.

## Settings

Markdown Weave contributes these settings under **Markdown Weave** in VS Code's
Settings UI:

| Setting | Default | Purpose |
|---|---:|---|
| `markdownWeave.theme` | `auto` | Chooses the reading theme: `auto`, `light`, `dark`, or `sepia`. |
| `markdownWeave.openAsDefaultMarkdownEditor` | `false` | Makes Markdown Weave the default editor for `.md` and `.markdown` files by syncing global editor associations. |
| `markdownWeave.useBuiltInFonts` | `false` | Uses bundled Inter headings and Merriweather body text when enabled. |
| `markdownWeave.headingFont` | `""` | CSS `font-family` override for rendered headings. |
| `markdownWeave.bodyFont` | `""` | CSS `font-family` override for rendered body text. |
| `markdownWeave.fontSize` | `16` | Base rendered Markdown font size in pixels. |
| `markdownWeave.lineHeight` | `1.75` | Base rendered Markdown line height. |
| `markdownWeave.customCssPath` | `""` | Workspace-relative or absolute CSS file loaded into Markdown Weave webviews, with hot reload. |
| `markdownWeave.enableWikiLinks` | `true` | Enables `[[wiki link]]` rendering, status checks, and navigation. |
| `markdownWeave.enableMath` | `true` | Enables KaTeX rendering for inline and display math. |
| `markdownWeave.enableMermaid` | `true` | Enables Mermaid diagram rendering for `mermaid` fenced code blocks. |
| `markdownWeave.pasteImageFolder` | `""` | Folder for pasted images, relative to the Markdown document. Empty saves next to the document. |

Custom CSS is injected after Markdown Weave's settings-generated CSS, so normal
CSS precedence lets user styles override theme and typography variables without
requiring `!important`.

### Future Settings Under Consideration

These settings are not implemented yet, but are good candidates for future
configuration work:

- `markdownWeave.editorMaxWidth`: maximum readable content width.
- `markdownWeave.codeBlockMaxHeight`: maximum rendered code block height before scrolling.
- `markdownWeave.syncScroll`: toggle side-by-side scroll synchronization.
- `markdownWeave.frontmatter.defaultCollapsed`: frontmatter initial display mode.
- `markdownWeave.table.defaultMode`: rendered table or raw source by default.
- `markdownWeave.wikiLink.headingSeparator`: separator for rendered wiki-link heading targets.
- `markdownWeave.katexMacros`: user-defined KaTeX macros.
- `markdownWeave.preferredBoldMarker` and `markdownWeave.preferredItalicMarker`: marker style used by formatting commands.

## Implemented Markdown Editing

The beta currently supports live decorations for:

- Headings, including ATX headings and setext headings.
- Bold, italic, and strikethrough text.
- Inline code.
- Regular Markdown links with Ctrl+Click navigation.
- Images with inline previews, missing-image fallback, and `=WxH` resize syntax.
- Blockquotes.
- Horizontal rules.
- Ordered and unordered lists, including nested lists.
- Task-list checkboxes with preview-mode toggling.
- Fenced code blocks with Shiki v4 previews and editable source mode.
- Read-only rendered tables with source toggle and source-range selection.
- Inline and display math rendered with KaTeX.
- Mermaid diagrams with preview rendering, source toggle, resize handle, and
  source-range selection.
- YAML frontmatter collapse/expand pill.
- Sanitized embedded HTML, including safe HTML image preview and resize.
- Wiki links (`[[page]]`, `[[page|alias]]`, `[[page#heading]]`) with broken-link
  styling for missing files and Ctrl+Click to open the linked file.
- Keyboard shortcuts: `Ctrl+B` bold, `Ctrl+I` italic, `Ctrl+Shift+X`
  strikethrough, `Ctrl+Shift+\`` inline code, `Ctrl+K` link, `Ctrl+Shift+C`
  fenced code block, `Ctrl+Shift+]`/`[` heading level up/down.
- Image paste from clipboard with configurable target folder
  (`markdownWeave.pasteImageFolder`) and automatic folder creation.
- Live settings for theme, typography, custom CSS, renderer toggles, and default
  Markdown editor association.
- Markdown Weave Outline panel in the Explorer with heading hierarchy,
  click-to-scroll navigation, active heading highlight, and debounced refresh.
- Breadcrumb bar inside the editor showing the current heading path, with
  click-to-scroll segments and sibling dropdown navigation.
- Side-by-side source/editing mode with the native Markdown source editor on the
  left, Markdown Weave on the right, and bidirectional scroll synchronization.
- Standalone Markdown Weave toolbar **Show Source** action that opens or reveals
  the canonical Markdown source in VS Code's native editor.

Existing Typora-style Markdown image size suffixes are supported:

```markdown
![Alt text](./image.png =300x200)
```

New Markdown image resize operations write safe HTML image tags so VS Code's
built-in Markdown preview can render the resized image:

```markdown
<img src="./image.png" alt="Alt text" width="300" height="200">
```

## Planned Features And Status

| Feature | Status |
|---|---|
| Register a VS Code custom editor for `.md` and `.markdown` files | Implemented |
| Webview editor shell with CSP-safe asset loading | Implemented |
| Extension-host to webview ready handshake | Implemented |
| Webview to extension edit pipeline using `WorkspaceEdit` | Implemented |
| Extension to webview document sync for external file changes | Implemented |
| Echo-loop prevention and debounced document updates | Implemented |
| Webview state persistence | Implemented |
| CodeMirror 6 editor surface | Implemented |
| CodeMirror transaction bridge to extension-host edits | Implemented |
| VS Code theme CSS variable integration for the editor surface | Implemented |
| Selection-aware decoration infrastructure | Implemented |
| Heading decorations for `h1` through `h6` | Implemented |
| Bold, italic, and strikethrough inline decorations | Implemented |
| Inline code decoration | Implemented |
| Link decoration and Ctrl+Click navigation | Implemented |
| Image decoration, preview, fallback, legacy `=WxH` support, and HTML resize persistence | Implemented |
| Blockquote decoration | Implemented |
| Horizontal rule decoration | Implemented |
| Ordered, unordered, nested, and checkbox list decoration | Implemented |
| Fenced code block widgets | Implemented |
| Shiki v4 syntax highlighting on the extension host | Implemented |
| Lazy code block highlighting | Implemented |
| Read-only rendered Markdown tables | Implemented |
| Table raw-source toggle | Implemented |
| KaTeX inline and display math rendering | Implemented |
| Mermaid diagram rendering | Implemented |
| YAML frontmatter collapse/expand widget | Implemented |
| Embedded HTML rendering with sanitization | Implemented |
| Wiki link rendering for `[[page]]` syntax | Implemented |
| Wiki link aliases and heading targets | Implemented |
| Wiki link existence checks and broken-link styling | Implemented |
| Ctrl+Click navigation for wiki links | Implemented |
| Formatting shortcuts for bold, italic, strikethrough, inline code, links, code blocks, and headings | Implemented |
| Image paste from clipboard with configurable target folder | Implemented |
| Document outline sidebar | Implemented |
| Click-to-scroll outline navigation | Implemented |
| Active heading synchronization | Implemented |
| Breadcrumb navigation | Implemented |
| Side-by-side source and Markdown Weave mode | Implemented |
| Bidirectional scroll synchronization | Implemented |
| Native editor toolbar action for opening with Markdown Weave | Implemented |
| Explorer context action for opening Markdown Weave to the side | Implemented |
| Standalone Markdown Weave Show Source toolbar action | Implemented |
| Light, dark, and sepia themes | Implemented |
| Opt-in bundled editorial fonts (Inter + Merriweather) | Implemented |
| Custom CSS loading and hot reload | Implemented |
| User settings and live configuration forwarding | Implemented |
| Opt-in default Markdown editor association | Implemented |
| Large-file performance verification and optimization | Planned |
| Marketplace and Open VSX publishing workflows | Planned |

## Development

Install dependencies:

```sh
npm install
```

Build the extension and webview bundles:

```sh
npm run compile
```

Run the type checker:

```sh
npm run check-types
```

Run ESLint:

```sh
npm run lint
```

For local development, start the watch build:

```sh
npm run watch
```

Then launch the extension from VS Code using the configured debug launch target.

### Testing The Extension Locally

Press **F5** (or run **Debug: Start Debugging**) to open the Extension Development
Host — a second VS Code window with the extension loaded.

Open any `.md` file in that window and use the Explorer context menu or
**Reopen Editor With… → Markdown Weave** to activate the custom editor.

After making a code change during a `watch` build, press **Ctrl+Shift+F5** to
restart the debug session without closing the window.

To inspect the webview, open **Help → Toggle Developer Tools** inside the
Extension Development Host window. The webview renders in its own iframe; select
it in the DevTools frame picker to inspect the CodeMirror DOM and run console
commands against the editor.

## Architecture

Markdown Weave has two build targets:

| Directory | Target | Runtime |
|---|---|---|
| `src/` | Node/CommonJS | VS Code extension host |
| `webview-ui/src/` | Browser/IIFE | VS Code webview |

The extension host owns VS Code APIs, workspace edits, filesystem access, and
document synchronization. The webview owns the CodeMirror editor, DOM rendering,
and live-preview decorations. Communication between the two sides happens
through `postMessage`.

## Non-Goals For v1

- HTML or PDF export.
- Multi-cursor or multi-selection support in live preview mode.
- Collaborative editing or real-time sync.
- Built-in spell checking.
- Built-in Markdown linting.
- Drag-to-reorder blocks or sections.
- MDX support.
- Mobile or VS Code for Web support.
- AI-powered features.
- Table cell-level editing.

## Planning Documents

Project planning lives in `ai-docs/`:

- `ai-docs/project.md` contains the project overview, requirements, and design
  decisions.
- `ai-docs/tasks.md` contains the phase-by-phase task checklist.
- `ai-docs/phases/phase-*/plan.md` contains detailed implementation plans.
- `ai-docs/phases/phase-*/decisions.md`, when present, records deviations and
  durable implementation decisions for a phase.

## License

Markdown Weave is licensed under the MIT License. See [LICENSE](./LICENSE).
