# Phase Overview & Task Breakdown

<!--
  AI Agent Quick Reference:
  - Task IDs: P{phase}-T{task} (e.g. P1-T1 = Phase 1 Task 1)
  - Implementation details: each phase section links to a phase doc (e.g. ./phases/1-phase-01.md)
    with goal, steps, files, and "Done when" criteria per task.
  - Mark complete: change [ ] to [x] on the task line below.
  - Full workflow: see CLAUDE.md in the project root.
-->

## Phase 1: Extension Scaffolding & Custom Editor Provider

[Task Details](./phases/1-phase-01.md)

- [x] P1-T1: Initialize project with `yo code` and configure TypeScript + ESLint
- [x] P1-T2: Configure dual esbuild build script
- [x] P1-T3: Set up F5 debug launch config
- [x] P1-T4: Implement `CustomTextEditorProvider` skeleton
- [x] P1-T5: Register custom editor in `package.json` for `.md` / `.markdown`
- [x] P1-T6: Add `markdownWeave.openEditor` command + context menu
- [x] P1-T7: Create webview HTML shell with CSP and asset loading
- [x] P1-T8: Implement ready-handshake between extension host and webview
- [x] P1-T9: Implement webview → extension edit pipeline (`postMessage` → `WorkspaceEdit`)
- [x] P1-T10: Implement extension → webview document sync (external change detection)
- [x] P1-T11: Add echo-loop prevention and debouncing
- [x] P1-T12: Implement webview state persistence (`getState`/`setState`)

## Phase 2: CodeMirror 6 Integration & Core Inline Decorations

[Task Details](./phases/2-phase-02.md)

- [x] P2-T1: Install CM6 packages and instantiate `EditorView` in webview
- [x] P2-T2: Bridge CM6 transactions to the extension host edit pipeline
- [x] P2-T3: Bridge extension host document changes to CM6 state updates
- [x] P2-T4: Apply VS Code theme CSS variables to CM6 base theme
- [x] P2-T5: Build decoration infrastructure: `ViewPlugin` + selection-aware show/hide
- [x] P2-T6: Heading decoration (h1–h6, ATX + setext)
- [x] P2-T7: Bold / italic / strikethrough inline decoration (sub-block granularity)
- [x] P2-T8: Inline code decoration
- [x] P2-T9: Link decoration + Ctrl+Click to follow
- [x] P2-T10: Image decoration (inline preview + `=WxH` resize)
- [x] P2-T11: Blockquote decoration
- [x] P2-T12: Horizontal rule decoration
- [x] P2-T13: List + checkbox decoration (clickable checkboxes)

## Phase 3: Block Widgets & Advanced Rendering

[Task Details](./phases/3-phase-03.md)

- [ ] P3-T1: Fenced code block widget shell (styled container, raw source on focus)
- [ ] P3-T2: Shiki v3 setup on extension host (JS regex engine, on-demand lang loading)
- [ ] P3-T3: Shiki highlighting pipeline (extension host renders HTML → `postMessage` → webview)
- [ ] P3-T4: Shiki dual-theme output (light + dark tokens, auto-switch)
- [ ] P3-T5: Lazy code block highlighting (IntersectionObserver for off-screen blocks)
- [ ] P3-T6: Table rendering as HTML table widget (read-only)
- [ ] P3-T7: Table raw-source toggle button
- [ ] P3-T8: KaTeX setup (on-demand loading)
- [ ] P3-T9: Inline math (`$...$`) decoration
- [ ] P3-T10: Display math (`$$...$$`) block widget
- [ ] P3-T11: Mermaid diagram block widget (on-demand, debounced re-render)
- [ ] P3-T12: Frontmatter collapse/expand pill widget
- [ ] P3-T13: Embedded HTML rendering (with sanitization)

## Phase 4: Wiki Links & Link Validation

[Task Details](./phases/4-phase-04.md)

- [ ] P4-T1: Wiki link parser extension for CM6 Lezer grammar
- [ ] P4-T2: `[[page]]` basic rendering + decoration hide/show
- [ ] P4-T3: Alias syntax `[[page|display text]]` rendering
- [ ] P4-T5: File existence check (extension host filesystem scan → webview)
- [ ] P4-T6: Broken link styling (red/dimmed for missing targets)
- [ ] P4-T7: Ctrl+Click on wiki link opens target file

## Phase 5: Editing UX & Keyboard Shortcuts

[Task Details](./phases/5-phase-05.md)

- [ ] P5-T1: Bold toggle shortcut (`Ctrl+B`)
- [ ] P5-T2: Italic toggle shortcut (`Ctrl+I`)
- [ ] P5-T3: Strikethrough toggle shortcut (`Ctrl+Shift+X`)
- [ ] P5-T4: Inline code toggle shortcut (`` Ctrl+` ``)
- [ ] P5-T5: Link insert/edit shortcut (`Ctrl+K`)
- [ ] P5-T6: Fenced code block toggle shortcut (`Ctrl+Shift+C`)
- [ ] P5-T7: Heading level increase/decrease (`Ctrl+Shift+]` / `[`)
- [ ] P5-T8: Register all shortcuts as VS Code commands with `when` clause
- [ ] P5-T9: Image paste from clipboard (save to assets dir + insert markdown)
- [ ] P5-T10: Create assets directory if missing + configurable path
- [ ] P5-T11: Image file drag-and-drop (insert `![](relative/path)`)
- [ ] P5-T12: Markdown file drag-and-drop (insert `[name](relative/path)`)
- [ ] P5-T13: Generic file drag-and-drop (insert `[name](relative/path)`)

## Phase 6: Document Outline & Navigation

[Task Details](./phases/6-phase-06.md)

- [ ] P6-T1: remark/unified setup for AST analysis on extension host
- [ ] P6-T2: Heading extraction from document AST
- [ ] P6-T3: TreeView provider for outline sidebar
- [ ] P6-T4: Click-to-scroll: outline item → scroll webview to heading
- [ ] P6-T5: Active heading highlight in outline (sync with cursor position)
- [ ] P6-T6: Outline auto-refresh on document change (debounced 300ms)
- [ ] P6-T7: Breadcrumb bar in webview (current heading path)
- [ ] P6-T8: Breadcrumb click-to-scroll + sibling dropdown

## Phase 7: Side-by-Side Mode

[Task Details](./phases/7-phase-07.md)

- [ ] P7-T1: `markdownWeave.openSideBySide` command implementation
- [ ] P7-T2: Open split layout: left = VS Code native text editor, right = MarkdownWeave preview
- [ ] P7-T3: Source-map based scroll sync (Lezer tree heading/block positions)
- [ ] P7-T4: Bidirectional scroll sync (editor → preview and preview → editor)
- [ ] P7-T5: Editor toolbar button + command palette entry

## Phase 8: Theming & Customization

[Task Details](./phases/8-phase-08.md)

- [ ] P8-T1: Base theme CSS (CSS variables layered on VS Code vars)
- [ ] P8-T2: Light theme variant
- [ ] P8-T3: Dark theme variant
- [ ] P8-T4: Sepia theme variant
- [ ] P8-T5: `markdownWeave.theme` setting + auto-detection of `vscode-light`/`vscode-dark`
- [ ] P8-T6: Custom CSS file loading (`markdownWeave.customCssPath`)
- [ ] P8-T7: File watcher for custom CSS hot-reload

## Phase 9: Settings & Configuration

[Task Details](./phases/9-phase-09.md)

- [ ] P9-T1: Register all settings in `contributes.configuration`
- [ ] P9-T2: Settings listener (`onDidChangeConfiguration`) with live update
- [ ] P9-T3: Settings forwarding to webview on change

## Phase 10: Performance & Large File Optimization

[Task Details](./phases/10-phase-10.md)

- [ ] P10-T1: Verify CM6 viewport rendering is active (no full-document decoration)
- [ ] P10-T2: Scope decoration plugin to visible viewport range only
- [ ] P10-T3: Lazy Shiki highlighting with IntersectionObserver
- [ ] P10-T4: Lazy KaTeX/Mermaid rendering with IntersectionObserver
- [ ] P10-T5: Scroll position + cursor state persistence via `vscode.setState()`
- [ ] P10-T6: Scroll restoration after webview reload (wait for measurement pass)
- [ ] P10-T7: Performance benchmark: 3000-line file load time < 1s, scroll at 60fps

## Phase 11: Publishing & CI

[Task Details](./phases/11-phase-11.md)

- [ ] P11-T1: Marketplace metadata in `package.json` (icon, categories, license, repo)
- [ ] P11-T2: README.md with feature screenshots and GIF demos
- [ ] P11-T3: CHANGELOG.md with semver entries
- [ ] P11-T4: GitHub Actions workflow: build + test + lint on PR
- [ ] P11-T5: GitHub Actions workflow: publish to VS Marketplace on tag push
- [ ] P11-T6: GitHub Actions workflow: publish to Open VSX Registry on tag push
- [ ] P11-T7: `.vsix` artifact upload to GitHub Release
