import type { EditorView } from '@codemirror/view';

const MARKER = '~~';
const LEN = MARKER.length;

export function toggleStrikethrough(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;

  if (main.empty) {
    view.dispatch({
      changes: { from: main.from, insert: MARKER + MARKER },
      selection: { anchor: main.from + LEN }
    });
    return true;
  }

  const { from, to } = main;
  const hasMarkersOutside =
    from >= LEN &&
    state.sliceDoc(from - LEN, from) === MARKER &&
    to + LEN <= state.doc.length &&
    state.sliceDoc(to, to + LEN) === MARKER;

  if (hasMarkersOutside) {
    view.dispatch({
      changes: [
        { from: from - LEN, to: from },
        { from: to, to: to + LEN }
      ],
      selection: { anchor: from - LEN, head: to - LEN }
    });
    return true;
  }

  view.dispatch({
    changes: [
      { from, insert: MARKER },
      { from: to, insert: MARKER }
    ],
    selection: { anchor: from + LEN, head: to + LEN }
  });
  return true;
}
