# Phase 07 Decisions

## Deviations From Plan

### Side-by-side sync is command-scoped

Side-by-side scroll sync is active only for pairs created by `markdownWeave.openSideBySide`. Manually opened same-file native/custom editor pairs do not automatically sync.

Reason:

This avoids coupling unrelated tabs and matches the approved implementation plan for predictable session lifecycle.

Implication:

Future side-by-side behavior should register or replace a session through the command instead of adding global same-file sync.

### Scroll sync uses passive line-based messages

The phase plan described source-map based scroll sync using Lezer heading/block positions. The implementation syncs the top visible source line in both directions and uses passive messages that do not move the preview cursor or steal focus.

Reason:

Phase 06 already introduced Lezer-derived line infrastructure and a cursor-moving `scrollToLine` message for outline navigation. Side-by-side scroll sync needs different semantics: scroll only, without changing selection.

Implication:

Keep `scrollToLine` for explicit navigation and `syncScrollToLine` for passive paired scrolling. If later work adds block-anchor mapping, it should preserve the passive/no-focus behavior.

## Decisions

### Side-by-side command label follows VS Code toolbar wording

The command id remains `markdownWeave.openSideBySide`, but its user-facing title is `Open to the Side`.

Reason:

The `Markdown Weave` command category already identifies the target editor in the Command Palette, producing `Markdown Weave: Open to the Side`. This avoids repeating the product name while staying close to VS Code's built-in markdown preview wording.

Implication:

Do not rename the command id unless compatibility is deliberately broken. Future menu and documentation references should use the title `Open to the Side`.

### Direct-open command uses concise palette label and explicit menu alias

The command id `markdownWeave.openEditor` has the user-facing title `Open`, so the Command Palette shows `Markdown Weave: Open`. Explorer context menus and native toolbar Alt behavior use the hidden alias command `markdownWeave.openEditorContext`, titled `Open with Markdown Weave`, registered to the same handler.

Reason:

The Command Palette already prefixes commands with `Markdown Weave:`, while Explorer context menus and toolbar tooltips need the target editor name to avoid ambiguity.

### Toolbar side-by-side alias has a longer title

The native markdown toolbar primary action uses a hidden alias command, `markdownWeave.openSideBySideToolbar`, with the title `Open with Markdown Weave to the Side`.

Reason:

The Command Palette should stay concise as `Markdown Weave: Open to the Side`, while the Alt toolbar tooltip needs to be explicit when shown next to VS Code's built-in preview actions.

Implication:

`markdownWeave.openSideBySideToolbar` must stay registered to the same handler as `markdownWeave.openSideBySide` and hidden from the Command Palette.

### Toolbar icons reuse native VS Code markdown shapes with accent colors

The side-by-side command uses local SVG icons at `media/preview-to-side-light.svg` and `media/preview-to-side-dark.svg`. The direct-open Alt command uses local SVG icons at `media/preview-light.svg` and `media/preview-dark.svg`. These SVGs reuse the same shapes as VS Code's built-in markdown toolbar icons: `open-preview` for side-by-side and the built-in markdown preview icon for direct opening. The local copies exist so MarkdownWeave can color the icons independently from the editor toolbar foreground. The light theme variants use `#009FE3`; the dark theme variants use `#00CFFF`.

Reason:

VS Code command toolbar contributions do not expose reliable per-command icon coloring for codicons, so local SVG copies are required to keep the native shapes while applying a MarkdownWeave accent color.

### Native markdown editor toolbar exposes MarkdownWeave open modes

Markdown files opened in VS Code's native text editor show a MarkdownWeave toolbar button using the same `editorLangId == 'markdown'` context as VS Code's built-in markdown preview toolbar action. The contribution uses `group: "navigation@1"` so it appears immediately after VS Code's built-in markdown preview-to-side button, which contributes to `group: "navigation"`.

Reason:

Users should be able to open MarkdownWeave from the same place VS Code exposes its built-in markdown preview actions.

### Native toolbar primary action opens directly with MarkdownWeave

The native markdown editor toolbar contribution shows `markdownWeave.openEditorContext` by default and sets `alt` to `markdownWeave.openSideBySideToolbar`, so holding Alt switches `Open with Markdown Weave` to `Open with Markdown Weave to the Side`.

Reason:

This makes the first-click MarkdownWeave action open directly with MarkdownWeave, while still keeping the side-by-side action available through the same toolbar button's Alt state.

Implication:

The Alt action is native-toolbar-only. Both MarkdownWeave native-editor toolbar commands have icon metadata so VS Code can keep separate built-in and MarkdownWeave toolbar buttons in both normal and Alt states. The default MarkdownWeave toolbar icon uses local preview SVGs with the native markdown preview shape; the Alt side-by-side state uses local preview-to-side SVGs with the native `open-preview` shape.

### Explorer context menu includes side-by-side mode

The Explorer context menu for `.md` and `.markdown` files includes both `Open with Markdown Weave` and `Open with Markdown Weave to the Side`. The context menu uses a hidden alias command, `markdownWeave.openSideBySideContext`, registered to the same handler as `markdownWeave.openSideBySide`.

Reason:

Users should be able to choose either direct MarkdownWeave opening or side-by-side opening from file context, and the Explorer menu needs an explicit target label because VS Code's native markdown extension can also contribute an `Open to the Side` item.

### Standalone MarkdownWeave editors expose Show Source

MarkdownWeave custom editors opened directly show a toolbar-only `markdownWeave.showSource` command titled `Show Source`. The button is hidden from the Command Palette and hidden for MarkdownWeave panels created by `Open with Markdown Weave to the Side`. The extension tracks this with the `markdownWeave.activeStandaloneEditor` context key.

Reason:

This mirrors VS Code's native Markdown preview `Show Source` affordance while avoiding redundant source and side-by-side buttons in command-created side-by-side sessions, where the native source pane and MarkdownWeave side pane are already present.

Implication:

`Show Source` should reveal an existing native source editor for the same URI when one is available outside the side-by-side session. Otherwise it opens the same URI as a native text editor in the current editor group. The standalone MarkdownWeave side-by-side toolbar button uses the same `markdownWeave.activeStandaloneEditor` context key and is also hidden in command-created side-by-side panes. The `Show Source` button uses local `show-source-light.svg` and `show-source-dark.svg` copies of VS Code's `go-to-file` icon with the MarkdownWeave accent colors because command toolbar codicons cannot be independently colorized.

### Right pane remains editable MarkdownWeave

The right pane reuses the existing editable MarkdownWeave custom editor. Edits in either pane sync through the shared VS Code `TextDocument` pipeline.

### Fixed layout uses source left and preview right

The side-by-side command opens the native text editor in `ViewColumn.One` and MarkdownWeave in `ViewColumn.Two`.
