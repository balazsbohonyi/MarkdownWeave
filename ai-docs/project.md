# Markdown Weave

Inline WYSIWYG Markdown Editor for VS Code

## Introduction

MarkdownWeave is a VS Code extension that provides an Obsidian-style live preview editing experience for Markdown files. Unlike VS Code's built-in split-pane approach (raw source in one tab, rendered preview in another), MarkdownWeave renders the markdown document in a single view where the user edits inline — only the block or inline element under the caret reveals its raw markdown syntax. The rendered view is the default; editing happens *within* the rendered view.

The extension targets developers editing documentation, READMEs, and wikis, as well as PKM/knowledge-management users who want a Typora/Obsidian-like experience without leaving VS Code.

### Core Principle

**The markdown source file is the canonical document.** The file on disk is never reformatted, normalized, or round-tripped through an intermediate representation. Every byte the user typed is preserved exactly. The "WYSIWYG" effect is achieved purely through decorative overlays on the source text (CodeMirror 6 decorations), not through a rich-text document model.

### Resolved Design Decisions

| Decision | Resolution |
|---|---|
| Image resize syntax | Non-standard `=WxH` suffix: `![alt](src =300x200)` |
| MDX support | Dropped — extension handles `.md` and `.markdown` only |
| Math rendering library | KaTeX (faster, smaller bundle) |
| Table editing in v1 | Raw-source-toggle only; cell-level editing deferred to v1.1 |


## Goals

- Provide a single-pane live preview where rendered markdown and inline editing coexist, eliminating the need to switch between editor and preview tabs.
- Preserve the user's markdown source byte-for-byte — no normalization, no reformatting on save.
- Support caret-proximity block/inline reveal: as the cursor moves through the document, only the element under the cursor shows raw markdown syntax.
- Support sub-block granularity for inline elements (bold, italic, links, inline code, strikethrough, images).
- Render all markdown elements with full fidelity: headings, emphasis, links, images, code blocks (syntax-highlighted), tables, checkboxes, math, Mermaid diagrams, frontmatter, embedded HTML.
- Ship with light/dark/sepia themes that respect VS Code's active color theme, plus support for user-provided custom CSS.
- Handle large files (1000+ lines) performantly from v1 via virtualized rendering.

## Functional Requirements

- **FR-1:** The extension SHALL register a `CustomTextEditorProvider` for `.md` and `.markdown` files with `priority: "option"`.
- **FR-2:** The webview SHALL use CodeMirror 6 as the editable surface, with the markdown source as the canonical document state.
- **FR-3:** The editor SHALL render all markdown elements (headings, emphasis, links, images, code blocks, tables, lists, blockquotes, horizontal rules, checkboxes, math, Mermaid, frontmatter, embedded HTML) with full fidelity in the preview state.
- **FR-4:** The editor SHALL reveal raw markdown syntax at block-level when the caret enters a block element.
- **FR-5:** The editor SHALL reveal raw markdown syntax at sub-block (inline) level for bold, italic, strikethrough, links, inline code, and images when the caret enters the specific inline element.
- **FR-6:** Only the block/inline element under the current caret SHALL be in source mode at any given time. Moving the caret away SHALL re-render the element.
- **FR-7:** The editor SHALL NOT modify, normalize, or reformat the markdown source on save or at any other time.
- **FR-8:** All edits SHALL flow through `workspace.applyEdit()` to integrate with VS Code's undo/redo stack.
- **FR-9:** Fenced code blocks SHALL be syntax-highlighted using Shiki v4 with the JS regex engine, running on the extension host.
- **FR-10:** Rendered links SHALL be followable via Ctrl+Click and editable via regular click.
- **FR-11:** Rendered checkboxes SHALL be clickable to toggle state.
- **FR-12:** Tables SHALL render as read-only HTML tables with a toggle for raw source view. Cell-level editing deferred to v1.1.
- **FR-13:** Wiki links (`[[page]]`, `[[page|alias]]`, `[[page#heading]]`) SHALL render with broken-link detection (red/dimmed styling).
- **FR-14:** Images SHALL render as inline previews with drag-to-resize using `=WxH` suffix syntax and path resolution relative to the current file.
- **FR-15:** Pasting images from clipboard SHALL auto-save to the configured assets directory and insert markdown at cursor.
- **FR-16:** Drag-and-drop of files SHALL insert appropriate markdown links/embeds.
- **FR-17:** YAML frontmatter SHALL collapse by default into a clickable pill widget.
- **FR-18:** The extension SHALL ship with light, dark, and sepia themes, default to following VS Code's active theme, and support user-provided custom CSS.
- **FR-19:** The extension SHALL provide formatting keyboard shortcuts (bold, italic, link, code, strikethrough, heading level).
- **FR-20:** The extension SHALL provide a document outline sidebar (heading-based tree view).
- **FR-21:** The editor SHALL support side-by-side mode (raw source + rendered preview) with bidirectional scroll sync.
- **FR-22:** The editor SHALL handle files of 1000+ lines with virtualized rendering via CM6's viewport system.

---

## Non-Goals (Out of Scope for v1)

- Export to HTML or PDF
- Multi-cursor / multi-selection support in live preview mode
- Collaborative editing or real-time sync
- Spell checking (rely on existing VS Code extensions)
- Markdown linting (rely on `markdownlint`)
- Drag-to-reorder blocks/sections
- MDX file support (dropped entirely)
- Mobile / VS Code for Web support
- AI-powered features
- Table cell-level editing (deferred to v1.1 — v1 ships with raw-source-toggle only)

---

## Success Metrics

- Extension loads and renders a 1000-line markdown file in under 1 second
- Scrolling maintains 60fps on files up to 3000 lines
- Zero markdown source modifications on file save (byte-exact round-trip)
- Cursor block/inline reveal transition completes in under 16ms (single frame)
- Marketplace rating of 4.0+ within first 3 months
- Less than 5 open bug reports about source reformatting

---

## Appendix A: Key Dependencies

| Package | Purpose | Target |
|---|---|---|
| `@codemirror/view`, `@codemirror/state` | Editor core | Webview |
| `@codemirror/lang-markdown` | Lezer markdown parser | Webview |
| `@codemirror/commands`, `@codemirror/history` | Keybindings, undo/redo | Webview |
| `shiki` (v4+) | Syntax highlighting (JS regex engine) | Extension host |
| `remark`, `remark-parse`, `remark-gfm`, `remark-frontmatter`, `unified` | AST analysis | Extension host |
| `katex` | Math rendering | Webview (lazy) |
| `mermaid` | Diagram rendering | Webview (lazy) |
| `esbuild` | Bundler (dual target) | Dev dependency |
| `@vscode/test-cli`, `@vscode/test-electron` | Testing | Dev dependency |
| `@vscode/vsce` | Packaging & publishing | Dev dependency |

## Appendix B: Project Structure

```
markdownweave/
├── .github/workflows/
│   ├── ci.yml
│   └── publish.yml
├── .vscode/
│   ├── launch.json
│   └── tasks.json
├── src/
│   ├── extension.ts               # Activation, command + provider registration
│   ├── markdownWeaveEditor.ts      # CustomTextEditorProvider
│   ├── outlineProvider.ts          # TreeView for doc outline sidebar
│   ├── shikiHighlighter.ts         # Shiki v4 setup (Node side)
│   ├── remarkAnalyzer.ts           # remark/unified AST analysis
│   └── wikiLinkResolver.ts         # File existence checks for [[links]]
├── webview-ui/
│   └── src/
│       ├── main.ts                 # Webview entry point + VS Code API handshake
│       ├── editor.ts               # CM6 EditorView setup and configuration
│       ├── bridge.ts               # Message passing (webview ↔ extension host)
│       ├── decorations/
│       │   ├── index.ts            # Decoration orchestrator (ViewPlugin)
│       │   ├── selectionUtils.ts   # isEditing() helper, viewport scoping
│       │   ├── headings.ts
│       │   ├── emphasis.ts         # Bold, italic, strikethrough
│       │   ├── inlineCode.ts
│       │   ├── links.ts            # Regular links + auto-links
│       │   ├── wikiLinks.ts        # [[page]] support
│       │   ├── images.ts
│       │   ├── blockquotes.ts
│       │   ├── horizontalRules.ts
│       │   ├── lists.ts            # Ordered, unordered, checkboxes
│       │   ├── frontmatter.ts
│       │   └── htmlBlocks.ts
│       ├── widgets/
│       │   ├── CodeBlockWidget.ts
│       │   ├── TableWidget.ts
│       │   ├── ImageWidget.ts
│       │   ├── MathWidget.ts       # KaTeX inline + display
│       │   ├── MermaidWidget.ts
│       │   ├── FrontmatterPillWidget.ts
│       │   └── HtmlBlockWidget.ts
│       ├── commands/
│       │   ├── toggleBold.ts
│       │   ├── toggleItalic.ts
│       │   ├── toggleStrikethrough.ts
│       │   ├── toggleInlineCode.ts
│       │   ├── toggleCodeBlock.ts
│       │   ├── insertLink.ts
│       │   └── changeHeadingLevel.ts
│       ├── themes/
│       │   ├── base.css
│       │   ├── light.css
│       │   ├── dark.css
│       │   └── sepia.css
│       └── breadcrumb.ts           # Breadcrumb bar component
├── media/
│   └── icon.png
├── dist/                            # Build output (gitignored)
├── esbuild.mjs
├── package.json
├── tsconfig.json
├── .vscodeignore
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## Appendix C: Extension Registration Skeleton

```jsonc
// package.json (key sections only)
{
  "name": "markdownweave",
  "displayName": "MarkdownWeave",
  "description": "Obsidian-style inline WYSIWYG editing for Markdown files",
  "version": "0.1.0",
  "engines": { "vscode": "^1.90.0" },
  "activationEvents": [],
  "main": "./dist/extension.js",
  "contributes": {
    "customEditors": [{
      "viewType": "markdownWeave.editor",
      "displayName": "MarkdownWeave",
      "selector": [
        { "filenamePattern": "*.md" },
        { "filenamePattern": "*.markdown" }
      ],
      "priority": "option"
    }],
    "commands": [
      { "command": "markdownWeave.openEditor", "title": "Open with MarkdownWeave", "category": "MarkdownWeave" },
      { "command": "markdownWeave.openSideBySide", "title": "Open Side by Side Preview", "category": "MarkdownWeave" }
    ],
    "menus": {
      "explorer/context": [{
        "command": "markdownWeave.openEditor",
        "when": "resourceExtname =~ /\\.(md|markdown)$/",
        "group": "navigation"
      }],
      "editor/title": [{
        "command": "markdownWeave.openSideBySide",
        "when": "activeCustomEditorId == 'markdownWeave.editor'",
        "group": "navigation"
      }]
    },
    "keybindings": [
      { "command": "markdownWeave.toggleBold", "key": "ctrl+b", "when": "activeCustomEditorId == 'markdownWeave.editor'" },
      { "command": "markdownWeave.toggleItalic", "key": "ctrl+i", "when": "activeCustomEditorId == 'markdownWeave.editor'" },
      { "command": "markdownWeave.toggleStrikethrough", "key": "ctrl+shift+x", "when": "activeCustomEditorId == 'markdownWeave.editor'" },
      { "command": "markdownWeave.toggleInlineCode", "key": "ctrl+`", "when": "activeCustomEditorId == 'markdownWeave.editor'" },
      { "command": "markdownWeave.toggleCodeBlock", "key": "ctrl+shift+c", "when": "activeCustomEditorId == 'markdownWeave.editor'" },
      { "command": "markdownWeave.insertLink", "key": "ctrl+k", "when": "activeCustomEditorId == 'markdownWeave.editor'" },
      { "command": "markdownWeave.increaseHeading", "key": "ctrl+shift+]", "when": "activeCustomEditorId == 'markdownWeave.editor'" },
      { "command": "markdownWeave.decreaseHeading", "key": "ctrl+shift+[", "when": "activeCustomEditorId == 'markdownWeave.editor'" }
    ],
    "configuration": {
      "title": "MarkdownWeave",
      "properties": {
        "markdownWeave.theme": { "type": "string", "enum": ["auto","light","dark","sepia"], "default": "auto" },
        "markdownWeave.customCssPath": { "type": "string", "default": "" },
        "markdownWeave.imageAssetsPath": { "type": "string", "default": "assets" },
        "markdownWeave.fontSize": { "type": "number", "default": 0 },
        "markdownWeave.lineHeight": { "type": "number", "default": 1.6 },
        "markdownWeave.enableWikiLinks": { "type": "boolean", "default": true },
        "markdownWeave.enableMath": { "type": "boolean", "default": true },
        "markdownWeave.enableMermaid": { "type": "boolean", "default": true }
      }
    }
  }
}
```

## Appendix D: Recommended Development Order

1. **Phase 1** (P1-T1 → P1-T12) — Extension skeleton, webview, document sync. This is the foundation. Do not proceed until edits round-trip correctly and echo loops are eliminated.
2. **Phase 2** (P2-T1 → P2-T13) — CM6 integration and all core decorations. Start with P2-T5 (infrastructure), then headings (simplest), then emphasis, then links. Each decoration follows the identical pattern: scan Lezer tree → emit decorations → check selection range.
3. **Phase 3** (P3-T1 → P3-T13) — Block widgets and advanced rendering. Code blocks + Shiki first (highest user impact), then tables (read-only + toggle), then math, then Mermaid, then frontmatter.
4. **Phase 4** (P4-T1 → P4-T7) — Wiki links. Self-contained feature with clear boundaries.
5. **Phase 5** (P5-T1 → P5-T13) — Keyboard shortcuts and image handling.
6. **Phase 6** (P6-T1 → P6-T8) — Outline sidebar and breadcrumbs.
7. **Phase 7** (P7-T1 → P7-T5) — Side-by-side mode.
8. **Phase 8** (P8-T1 → P8-T7) — Theming.
9. **Phase 9** (P9-T1 → P9-T3) — Settings plumbing.
10. **Phase 10** (P10-T1 → P10-T7) — Performance verification and optimization.
11. **Phase 11** (P11-T1 → P11-T7) — Publishing pipeline.
