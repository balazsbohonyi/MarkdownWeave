# Phase 07 Manual Verification Checklist

Use a markdown file with enough content to scroll, including headings, paragraphs, lists, images or tables, and fenced code blocks.

## Setup

- [x] Run `npm.cmd run compile`.
- [x] Launch the extension host with the VS Code debug configuration.
- [x] Open a `.md` or `.markdown` file in the extension host window.

## P7-T1: Command Registration

- [x] Open the Command Palette.
- [x] Confirm `Markdown Weave: Open` appears.
- [x] Confirm `Markdown Weave: Open to the Side` appears.
- [x] Run the command while a native markdown text editor is active.
- [x] Confirm no warning is shown when a markdown document is active.
- [x] Run the command with no markdown/custom editor active.
- [x] Confirm a warning appears instead of an error.

## P7-T2: Split Layout And Shared Document Sync

- [x] Run `Markdown Weave: Open to the Side` from a native markdown text editor.
- [x] Confirm the native VS Code text editor opens in the left editor group.
- [x] Confirm the MarkdownWeave editor opens in the right editor group.
- [x] Type in the left native editor.
- [x] Confirm the right MarkdownWeave editor updates to the same document text.
- [x] Type in the right MarkdownWeave editor.
- [x] Confirm the left native editor updates to the same document text.
- [x] Save the file.
- [x] Confirm saving does not reformat or normalize the markdown source.
- [x] Run the command again for the same file.
- [x] Confirm it reuses/replaces the side-by-side session without creating extra visible panes beyond the left source and right MarkdownWeave pair.

## P7-T3: Source To Preview Scroll Sync

- [x] Scroll the left native editor down slowly.
- [x] Confirm the right MarkdownWeave editor scrolls to the corresponding source line/section.
- [x] Scroll the left native editor upward.
- [x] Confirm the right MarkdownWeave editor follows upward.
- [x] Scroll across headings and collapsed/rendered widgets.
- [x] Confirm the right pane lands near the matching source line, not a random unrelated section.
- [x] Confirm the right pane scroll movement does not move its cursor or steal focus from the left pane.
- [x] Confirm continuous scrolling does not visibly bounce between panes.

## P7-T4: Preview To Source Scroll Sync

- [x] Treat this section as a required retest after the preview-to-source scroll sync fix.
- [x] Scroll the right MarkdownWeave editor down slowly.
- [x] Confirm the left native editor scrolls to the corresponding source line/section.
- [x] Scroll the right MarkdownWeave editor upward.
- [x] Confirm the left native editor follows upward.
- [x] Scroll across rendered block widgets such as code blocks, tables, Mermaid, math, or frontmatter if present.
- [x] Confirm the left pane lands near the matching canonical markdown source.
- [x] Confirm the left pane scroll movement does not move its cursor or steal focus from the right pane.
- [x] Confirm bidirectional sync does not enter a feedback loop or jitter indefinitely.

## P7-T5: Toolbar Button

- [x] Open a `.md` or `.markdown` file in VS Code's native markdown text editor.
- [x] Confirm VS Code's built-in `Open Preview to the Side` toolbar button is visible.
- [x] Confirm a MarkdownWeave toolbar button appears immediately after VS Code's built-in `Open Preview to the Side` button, with no unrelated toolbar button between them.
- [x] Confirm the default MarkdownWeave native-editor toolbar button uses the same preview icon shape as VS Code's built-in `Open Preview` button.
- [x] Confirm the default MarkdownWeave native-editor toolbar button uses the MarkdownWeave accent color (`#009FE3` light theme, `#00CFFF` dark theme), not the native toolbar foreground color.
- [x] Hover the MarkdownWeave native-editor toolbar button.
- [x] Confirm the tooltip/action is `Open with Markdown Weave`.
- [x] Click the MarkdownWeave native-editor toolbar button.
- [x] Confirm the current file opens directly with MarkdownWeave in the current editor group.
- [x] Hold Alt while hovering the MarkdownWeave native-editor toolbar button.
- [x] Confirm the MarkdownWeave button switches to `Open with Markdown Weave to the Side`.
- [x] Confirm the Alt-state MarkdownWeave icon switches to the same preview-to-side icon shape as VS Code's built-in `Open Preview to the Side` button.
- [x] Confirm the Alt-state MarkdownWeave icon keeps the MarkdownWeave accent color.
- [x] Confirm VS Code's built-in toolbar button remains visible separately and switches between `Open Preview to the Side` and `Open Preview`.
- [x] Alt-click the MarkdownWeave native-editor toolbar button.
- [x] Confirm it opens the fixed side-by-side layout: source left, MarkdownWeave right.
- [x] Open a `.md` or `.markdown` file directly with MarkdownWeave, not through `Open with Markdown Weave to the Side`.
- [x] Confirm the standalone MarkdownWeave editor title toolbar shows `Show Source`.
- [x] Confirm `Show Source` appears before the MarkdownWeave side-by-side toolbar button.
- [x] Confirm `Show Source` uses the native VS Code `go-to-file` / `Show Source` icon shape.
- [x] Confirm the `Show Source` icon uses the MarkdownWeave accent color (`#009FE3` light theme, `#00CFFF` dark theme).
- [x] Confirm the standalone MarkdownWeave side-by-side toolbar button uses the same preview-to-side icon shape as VS Code's built-in `Open Preview to the Side` button.
- [x] Confirm the standalone MarkdownWeave side-by-side toolbar button uses the MarkdownWeave accent color.
- [x] Click `Show Source` when no native source tab for the file is already open.
- [x] Confirm the same file opens as a native markdown text editor in the current editor group.
- [x] Open the same file in a native markdown text editor tab, then open it directly with MarkdownWeave.
- [x] Click `Show Source`.
- [x] Confirm VS Code switches/reveals the existing native source tab instead of opening a duplicate source tab.
- [x] Open a standalone MarkdownWeave editor again.
- [x] Click the standalone MarkdownWeave side-by-side toolbar button.
- [x] Confirm it opens the fixed side-by-side layout: source left, MarkdownWeave right.
- [x] Open the file with `Open with Markdown Weave to the Side`.
- [x] Confirm the right MarkdownWeave side-by-side pane does not show `Show Source`.
- [x] Confirm the right MarkdownWeave side-by-side pane does not show the MarkdownWeave side-by-side toolbar button.
- [x] Confirm `Markdown Weave: Show Source` does not appear in the Command Palette.

## Explorer Context Menu

- [x] Right-click a `.md` file in VS Code Explorer.
- [x] Confirm `Open with Markdown Weave` appears.
- [x] Confirm `Open with Markdown Weave to the Side` appears.
- [x] Click `Open with Markdown Weave to the Side`.
- [x] Confirm it opens the fixed side-by-side layout: source left, MarkdownWeave right.
- [x] Right-click a `.markdown` file in VS Code Explorer.
- [x] Confirm both MarkdownWeave open commands appear there too.

## Session Scope And Lifecycle

- [x] Manually open a native editor and a MarkdownWeave editor for the same file without using `Open to the Side`.
- [x] Confirm those manually opened panes do not auto-enable scroll sync.
- [x] Use `Open to the Side` for the file.
- [x] Confirm scroll sync is now active for that command-created pair.
- [x] Close the right MarkdownWeave pane.
- [x] Confirm scrolling the left pane no longer tries to sync or causes errors.
- [x] Reopen side-by-side mode.
- [x] Close the left native editor pane.
- [x] Confirm scrolling the right pane no longer causes visible errors.

## Regression Checks

- [x] Outline click-to-scroll still moves the MarkdownWeave cursor to the selected heading.
- [x] Breadcrumb click-to-scroll still moves the MarkdownWeave cursor to the selected heading.
- [x] Formatting shortcuts still work in MarkdownWeave after opening side-by-side mode.
- [x] Image paste still inserts markdown in MarkdownWeave after opening side-by-side mode.
- [x] Wiki-link navigation still opens target files and scrolls to headings when applicable.

## Pass Criteria

- [x] P7-T1 through P7-T5 are considered manually verified only if every applicable checklist item above passes.
- [x] Any failed item should be recorded with the file used, the direction of scroll or command path tested, and whether focus/cursor moved unexpectedly.
