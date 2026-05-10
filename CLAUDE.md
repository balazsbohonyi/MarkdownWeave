# MarkdownWeave — AI Agent Instructions

## Task Workflow

### Document Structure

All planning documents live in `ai-docs/`:

| File | Purpose |
|---|---|
| `ai-docs/project.md` | Project overview, goals, functional requirements, architecture, and success metrics. Read this first to understand the project. |
| `ai-docs/tasks.md` | Task breakdown per phase with status checkboxes (`[ ]` / `[x]`). This is the single source of truth for what's done and what's remaining. |
| `ai-docs/phases/phase-<NN>/plan.md` | Implementation details for every task in a phase. Each task has a heading with its ID, goal, step-by-step instructions, and a "Done when" criterion. |
| `ai-docs/phases/phase-<NN>/decisions.md` | Optional phase-specific deviations and decisions. This file exists only when implementation diverges from the plan or durable decisions are made. |

### Task IDs

Tasks use the format `P{phase}-T{task}`. Examples:

- `P1-T1` — Phase 1, Task 1
- `P3-T7` — Phase 3, Task 7
- `P10-T5` — Phase 10, Task 5

### How to Work on a Task

When asked to work on a specific task (e.g. "work on P2-T5"):

1. **Read project context** — Open `ai-docs/project.md` and `ai-docs/tasks.md`.
2. **Read prior decisions** — Before working on Phase N, scan every existing `ai-docs/phases/phase-<MM>/decisions.md` for phases `< N`. Earlier deviations may affect the current phase.
3. **Read current phase decisions if present** — Open `ai-docs/phases/phase-<NN>/decisions.md` if it exists.
4. **Read the phase plan** — Open `ai-docs/phases/phase-<NN>/plan.md` and find the heading for the task ID (e.g. `## P2-T5: Build decoration infrastructure...`).
5. **Read the implementation details** — The phase plan contains the goal, step-by-step instructions, files to create/modify, and a "Done when" acceptance criterion.
6. **Implement** — Follow the steps. Refer to `ai-docs/project.md` for architectural context (project structure in Appendix B, dependencies in Appendix A, extension registration skeleton in Appendix C).
7. **Document deviations and decisions** — If implementation diverges from the phase plan, or if a durable decision is made, create/update `ai-docs/phases/phase-<NN>/decisions.md`. Use two sections: `## Deviations From Plan` and `## Decisions`. When a phase `decisions.md` is created, also update that phase section in `ai-docs/tasks.md` to add a `Decisions` link next to `Task Details`. Do not create empty `decisions.md` files just to add links.
8. **Mark complete** — In `ai-docs/tasks.md`, change `- [ ] P{N}-T{M}: ...` to `- [x] P{N}-T{M}: ...`. Only mark `[x]` when the "Done when" criterion from the phase plan is satisfied.
9. **Verify** — Check the "Done when" criterion from the phase plan.

### Working on Multiple Tasks

- **"Work on P2 tasks"** — Complete all tasks in `ai-docs/phases/phase-02/plan.md` sequentially (P2-T1 through P2-T13). Mark each `[x]` in tasks.md as you finish.
- **"Work on P1-T1 to P1-T8"** — Complete the sequential range from P1-T1 through P1-T8 in order. Each task builds on the previous one.
- **"Work on the next task"** — Find the first `[ ]` checkbox in `ai-docs/tasks.md` (scanning top to bottom) and work on that task.

### Phase Ordering

Phases must be completed in numerical order. Each phase depends on the previous one:

1. **Phase 1** — Extension scaffolding, webview, document sync. Foundation for everything.
2. **Phase 2** — CodeMirror 6 integration and core decorations.
3. **Phase 3** — Block widgets and advanced rendering (code blocks, tables, math, Mermaid).
4. **Phase 4** — Wiki links (self-contained feature).
5. **Phase 5** — Keyboard shortcuts and image/file handling.
6. **Phase 6** — Document outline sidebar and breadcrumbs.
7. **Phase 7** — Side-by-side mode.
8. **Phase 8** — Theming and customization.
9. **Phase 9** — Settings and configuration.
10. **Phase 10** — Performance optimization.
11. **Phase 11** — Publishing and CI.

Within a phase, tasks should generally be done in order (T1, T2, T3...) as later tasks often depend on earlier ones. The phase plan will note if reordering is safe.

## Architecture

### Dual Build Target

This extension has two separate bundles built by `esbuild.mjs`:

| Directory | Target | Runs in | Access to |
|---|---|---|---|
| `src/` | Node (CJS) | Extension host process | `vscode` API, filesystem, child processes |
| `webview-ui/src/` | Browser (IIFE, ES2022) | Webview panel (browser context) | DOM, `acquireVsCodeApi()`, `postMessage` |

Communication between them goes exclusively through `postMessage`. The webview cannot import `vscode` directly. The extension host cannot access the DOM.

### Core Principle

**The markdown source file is the canonical document.** Never reformat, normalize, or round-trip through an intermediate representation. The WYSIWYG effect is achieved purely through CodeMirror 6 decorations on the source text.

### Key Design Decisions

| Decision | Resolution | Why |
|---|---|---|
| Image resize syntax | Legacy `=WxH` suffixes are supported; new Markdown image resizes persist as safe HTML `<img width height>` tags | VS Code's built-in Markdown preview renders HTML image dimensions but not Typora-style size suffixes |
| MDX support | **Dropped** — `.md` and `.markdown` only | Scope reduction for v1 |
| Math rendering library | **KaTeX** (not MathJax) | Faster, smaller bundle |
| Table editing in v1 | Raw-source-toggle only | Cell-level editing deferred to v1.1 |
| Source preservation | Byte-exact, never reformat | Core principle — the file on disk is canonical |

### Non-Goals (Do Not Implement)

- Export to HTML or PDF
- Multi-cursor / multi-selection in live preview mode
- Collaborative editing or real-time sync
- Spell checking (use existing VS Code extensions)
- Markdown linting (use `markdownlint`)
- Drag-to-reorder blocks/sections
- MDX file support
- Mobile / VS Code for Web support
- AI-powered features
- Table cell-level editing (v1.1)

## Implementation Rules

### Hidden Syntax Boundary Reveal

When hidden syntax is revealed, the cursor must snap to the outside boundary of the source marker or tag, not inside it. For example, revealing `<mark>text</mark>` from the left should place the cursor before `<mark>`, revealing it from the right should place the cursor after `</mark>`, and entering an ATX heading from visual column zero should place the cursor before the leading `#` markers. Keep this behavior consistent for headings, markdown emphasis/code markers, and sanitized inline HTML tags.

### Block Widget Rules

Block widget root elements must not use vertical CSS margins. CodeMirror does not include external margins in block-widget height measurement, so use padding or internal layout and call `view.requestMeasure()` after asynchronous render or size changes. Preview widgets that represent source ranges, such as tables and Mermaid diagrams, should select/copy the canonical markdown source rather than rendered DOM text.

### Line Decoration Spacing Rule

Never use `margin-top` or `margin-bottom` on `.cm-line` elements — i.e., classes applied via `Decoration.line()`. CodeMirror's height measurement only sees the content box (border + padding + content); external margins are invisible to it. This causes coordinate-based vertical arrow-key navigation to skip lines, with the error accumulating across consecutive decorated lines. Use `padding-top` / `padding-bottom` instead — visually identical, but correctly measured. **If a proposed CSS change adds a vertical margin to a line decoration class, reject it** and explain: "CodeMirror cannot measure `margin-*` on `.cm-line` — use `padding-*` instead, or navigation will break."

## Git Conventions

### Staged Change Handling

When the worktree already has staged changes, do not stage newly made changes unless the user explicitly asks for staging in that turn. Leave recent edits unstaged so the user can compare new work against the existing staged set.

### Commit Conventions

All commits follow this format:

```
[P{N}-T{M}] Short imperative description of what was done
```

For a range of tasks in one commit:

```
[P{N}-T{M}..P{N}-T{K}] Short imperative description of what was done

- Detail about first task
- Detail about second task
- Any other notable changes
```

**Rules:**

- Always start the subject line with the task ID prefix (`[P1-T3]` or `[P1-T1..P1-T4]`) so `git log --oneline` shows progress at a glance.
- Use imperative mood ("Add", "Implement", "Fix") — describe what the commit does, not what was done to you.
- Keep the subject line under 72 characters.
- Use the body (bullet list) when the commit covers multiple tasks or has notable details worth recording.
- Non-task commits (e.g., housekeeping, config) use plain subjects without a prefix.
- **No Claude Code attribution footer.** Do not append `🤖 Generated with Claude Code` or `Co-Authored-By:`. Users can add attribution manually if they want it.

**Examples:**

```
[P1-T1..P1-T4] Scaffold extension and webview
- Set up package.json with custom editor registration
- Created esbuild dual-target config
- Implemented CustomTextEditorProvider
- Added webview entry point with VS Code API handshake
```

```
[P2-T5] Build decoration infrastructure
```

```
Add .gitignore
```
