# Phase 6 Test Checklist

## Outline sidebar

### Basic population
- [x] Open a `.md` file with MarkdownWeave → "MarkdownWeave Outline" panel appears in Explorer sidebar
- [x] Outline is empty for a file with no headings
- [x] Outline shows all headings in correct order
- [x] H1 headings are roots; H2s nest under their parent H1; H3s nest under their parent H2
- [x] Documents with no H1 (starting at H2) still show headings as roots (orphan handling)
- [x] Mixed-level documents (H1 → H3, skipping H2) don't hide orphaned headings
- [x] Each item shows the correct icon and `H1`/`H2`… description badge
- [x] Long heading text doesn't break the layout (truncates gracefully)

### Click-to-scroll
- [x] Clicking an outline item scrolls the editor to that heading line
- [x] Cursor is placed at the heading line after scroll
- [x] Scrolling works for headings deep in the document (not just the first few)
- [ ] Setext headings (`===`/`---` underline style) scroll correctly

### Active heading highlight
- [x] Moving the cursor into an H1 section highlights the correct H1 in the outline
- [x] Moving into an H2 section highlights that H2 (not its parent H1)
- [x] Cursor at line 1 before any heading: no item selected in outline
- [x] Cursor after the last heading: last heading is highlighted
- [x] Highlight updates without the user having to click or type (cursor-move alone triggers it)
- [x] Debounce: rapid cursor movement doesn't flood the host with messages (check DevTools/output)

### Auto-refresh
- [x] Type a new `## New Section` → outline adds the item within ~300ms
- [x] Delete an existing heading line → outline removes the item within ~300ms
- [x] Rename a heading → outline updates the text within ~300ms
- [x] Changing heading level (e.g., `##` → `###`) re-nests the item correctly

### Multi-document
- [x] Open two `.md` files with MarkdownWeave → switching between tabs updates the outline to match the focused document
- [x] Outline clears when switching to a non-MarkdownWeave editor (plain text, settings, etc.)
- [x] Switching back to a MarkdownWeave panel restores the correct outline

## Breadcrumb bar

### Basic rendering
- [x] Breadcrumb bar appears at the top of the webview when cursor is inside a heading section
- [x] Breadcrumb is hidden (not just empty) when cursor is before the first heading
- [x] Full ancestor chain is shown: e.g., `H1 Introduction › H2 Installation › H3 Requirements`
- [x] Breadcrumb updates when cursor moves to a different section
- [ ] Setext headings appear correctly in the breadcrumb
- [x] Very long heading text in a segment is truncated (no horizontal overflow)

### Click-to-scroll
- [x] Clicking a breadcrumb segment scrolls the editor to that heading
- [x] Clicking the outermost (H1) segment scrolls to the H1
- [x] Editor receives focus after clicking a breadcrumb segment

### Sibling dropdown
- [x] `▾` chevron button is present on each segment
- [x] Clicking the chevron opens a dropdown listing all sibling headings at that level
- [x] The current active sibling is visually distinct in the dropdown
- [x] Clicking a sibling in the dropdown scrolls to that heading and closes the dropdown
- [x] Clicking outside the dropdown closes it
- [x] Opening a second dropdown closes any previously open one
- [ ] Chevron is disabled (greyed out) when the heading has no siblings

### Dropdown positioning
- [x] Dropdown appears directly below the chevron button
- [ ] Dropdown doesn't overflow off the right edge of the viewport
- [x] Dropdown scrolls internally when there are many siblings (max-height respected)

## Edge cases

- [x] Empty file: no outline items, no breadcrumb
- [x] File with only frontmatter and no headings: no outline items
- [x] File with 100+ headings: outline and breadcrumb both perform without jank
- [x] Heading inside a fenced code block (` ```markdown `) is NOT extracted as a real heading
- [x] Wiki link `scrollToHeading` (ctrl+click `[[page#heading]]`) still works — it uses the old text-based search, not the new line-based scroll
- [x] `scrollToLine` (outline click) and `scrollToHeading` (wiki link) both work independently in the same session
