# Phase 10: Performance & Large File Optimization

---

## P10-T1: Verify CM6 viewport rendering is active

**Steps:**

1. Open a 3000-line markdown file in MarkdownWeave.
2. In webview DevTools, inspect the DOM: only a subset of lines should have DOM nodes (not all 3000).
3. Verify that `view.viewport` reports a range smaller than the full document.
4. If full document is being rendered, investigate and fix — likely a decoration forcing full-document layout.

**Done when:** DOM element count stays constant (~100-200 elements visible) regardless of document length.

---

## P10-T2: Scope decoration plugin to visible viewport range only

**Steps:**

1. In the `ViewPlugin.update()` method, use `view.viewport` (or `view.visibleRanges`) to limit the Lezer tree iteration range.
2. Only emit decorations for nodes whose ranges intersect the visible viewport.
3. Ensure decorations update when the viewport changes (scroll).

**Done when:** Decoration computation time is proportional to visible content, not document size.

---

## P10-T3: Lazy Shiki highlighting with IntersectionObserver

(Verification and tuning of P3-T5 implementation.)

**Steps:**

1. Verify that Shiki highlight requests are only sent for visible code blocks.
2. Profile with a document containing 50 code blocks: only ~5-10 highlight requests should fire on initial load.
3. Verify caching works: scrolling back to an already-highlighted block does not re-request.

**Done when:** Network/message log shows lazy highlighting. No jank on scroll.

---

## P10-T4: Lazy KaTeX/Mermaid rendering

Same approach as P10-T3 for math and Mermaid widgets.

---

## P10-T5: Scroll position + cursor state persistence

(Verification of P1-T12 with large files.)

**Steps:**

1. Open a 3000-line file, scroll to line 2000.
2. Switch to another tab, switch back. Verify scroll position restored.
3. Close the tab, reopen the file. Verify scroll position restored.

**Done when:** Scroll persistence works reliably for large files.

---

## P10-T6: Scroll restoration after webview reload

**Steps:**

1. When restoring scroll from `vscode.getState()`, wait for:
   - CM6 to complete initial layout (measure phase).
   - All visible code block widgets to have rendered (at least placeholders).
2. Then call `view.dispatch({ effects: EditorView.scrollIntoView(pos) })`.
3. Test: if scrolling before measurement completes, the scroll target "jumps" because block widget heights change as they render. The wait prevents this.

**Done when:** No scroll-jump artifacts on tab restore, even with many block widgets.

---

## P10-T7: Performance benchmark

**Steps:**

1. Create test documents: 1000-line, 3000-line, 5000-line with mixed content (headings, code blocks, tables, images, math).
2. Measure: time from `resolveCustomTextEditor` to first paint (target: <1s for 3000 lines).
3. Measure: scroll FPS using Chrome DevTools Performance tab in webview (target: 60fps).
4. Measure: keystroke latency — time from keypress to rendered character (target: <50ms).
5. Document results and optimize bottlenecks.

**Done when:** All performance targets met. Results documented.

---
