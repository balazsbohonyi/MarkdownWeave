import type { EditorView } from '@codemirror/view';

const MARKER = '*';
const LEN = MARKER.length;

export function toggleItalic(view: EditorView): boolean {
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
  const charBefore = from >= LEN ? state.sliceDoc(from - LEN, from) : '';
  const charAfter = to + LEN <= state.doc.length ? state.sliceDoc(to, to + LEN) : '';
  const twoBefore = from >= 2 ? state.sliceDoc(from - 2, from) : '';
  const twoAfter = to + 2 <= state.doc.length ? state.sliceDoc(to, to + 2) : '';

  // Detect italic markers outside selection but not bold markers
  const hasMarkersOutside =
    charBefore === MARKER &&
    charAfter === MARKER &&
    twoBefore !== '**' &&
    twoAfter !== '**';

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
