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

Completed foundation:

- VS Code custom editor registration for `.md` and `.markdown` files.
- Webview-based editor shell with extension-host/webview messaging.
- CodeMirror 6 editor integration.
- Core inline and block decorations for common Markdown elements.
- Clickable links, image previews, image resizing, checkboxes, and nested list
  editing behavior for the currently implemented core decorations.

Still planned:

- Advanced block widgets such as code blocks, tables, math, Mermaid diagrams,
  frontmatter, and embedded HTML.
- Wiki links and link validation.
- Formatting shortcuts, image paste, drag-and-drop file handling, outline
  navigation, side-by-side mode, theming, settings, performance hardening, and
  publishing automation.

## Usage

1. Open a Markdown file in VS Code.
2. Use the Explorer context menu command **Open with Markdown Weave**.
3. Edit directly in the rendered document.

When the cursor enters a decorated Markdown element, Markdown Weave reveals the
raw syntax needed for editing. When the cursor leaves, the rendered decoration
is restored.

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

Image resize syntax follows the Typora-style suffix:

```markdown
![Alt text](./image.png =300x200)
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
| Image decoration, preview, fallback, and `=WxH` resizing | Implemented |
| Blockquote decoration | Implemented |
| Horizontal rule decoration | Implemented |
| Ordered, unordered, nested, and checkbox list decoration | Implemented |
| Fenced code block widgets | Planned |
| Shiki v3 syntax highlighting on the extension host | Planned |
| Lazy code block highlighting | Planned |
| Read-only rendered Markdown tables | Planned |
| Table raw-source toggle | Planned |
| KaTeX inline and display math rendering | Planned |
| Mermaid diagram rendering | Planned |
| YAML frontmatter collapse/expand widget | Planned |
| Embedded HTML rendering with sanitization | Planned |
| Wiki link rendering for `[[page]]` syntax | Planned |
| Wiki link aliases and heading targets | Planned |
| Wiki link existence checks and broken-link styling | Planned |
| Ctrl+Click navigation for wiki links | Planned |
| Formatting shortcuts for bold, italic, strikethrough, inline code, links, code blocks, and headings | Planned |
| Image paste from clipboard into an assets directory | Planned |
| File drag-and-drop insertion for images, Markdown files, and generic files | Planned |
| Document outline sidebar | Planned |
| Click-to-scroll outline navigation | Planned |
| Active heading synchronization | Planned |
| Breadcrumb navigation | Planned |
| Side-by-side source and preview mode | Planned |
| Bidirectional scroll synchronization | Planned |
| Light, dark, and sepia themes | Planned |
| Custom CSS loading and hot reload | Planned |
| User settings and live configuration forwarding | Planned |
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
