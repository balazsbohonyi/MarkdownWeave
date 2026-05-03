import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export function insertLink(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;

  if (main.empty) {
    const insert = '[text](url)';
    view.dispatch({
      changes: { from: main.from, insert },
      selection: EditorSelection.range(main.from + 1, main.from + 5)
    });
  } else {
    const selectedText = state.sliceDoc(main.from, main.to);
    const insert = `[${selectedText}](url)`;
    const urlFrom = main.from + 1 + selectedText.length + 2;
    view.dispatch({
      changes: { from: main.from, to: main.to, insert },
      selection: EditorSelection.range(urlFrom, urlFrom + 3)
    });
  }
  return true;
}
