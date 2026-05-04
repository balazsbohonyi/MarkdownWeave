import type { SyntaxNode } from '@lezer/common';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

function isInsideLink(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  const pos = main.empty ? main.from : main.from;
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);

  while (node) {
    if (node.name === 'Link' && pos >= node.from && pos < node.to) {
      return true;
    }
    node = node.parent;
  }

  return false;
}

export function insertLink(view: EditorView): boolean {
  if (isInsideLink(view)) {
    return false;
  }

  const { state } = view;
  const { main } = state.selection;

  if (main.empty) {
    const insert = '[]()';
    view.dispatch({
      changes: { from: main.from, insert },
      selection: EditorSelection.cursor(main.from + 1)
    });
  } else {
    const selectedText = state.sliceDoc(main.from, main.to);
    const insert = `[${selectedText}]()`;
    const cursorPos = main.from + 1 + selectedText.length + 2;
    view.dispatch({
      changes: { from: main.from, to: main.to, insert },
      selection: EditorSelection.cursor(cursorPos)
    });
  }
  return true;
}
