import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

export function toggleCodeBlock(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;

  // Find enclosing FencedCode node
  let node = syntaxTree(state).resolveInner(main.from, -1);
  let fencedNode: typeof node | null = null;
  while (node) {
    if (node.name === 'FencedCode') {
      fencedNode = node;
      break;
    }
    node = node.parent!;
  }

  if (fencedNode) {
    const openLine = state.doc.lineAt(fencedNode.from);
    const closeLine = state.doc.lineAt(fencedNode.to - 1);
    const changes: { from: number; to: number }[] = [];

    if (closeLine.number !== openLine.number) {
      const closeEnd = closeLine.to < state.doc.length ? closeLine.to + 1 : closeLine.to;
      changes.push({ from: closeLine.from, to: closeEnd });
    }
    const openEnd = openLine.to < state.doc.length ? openLine.to + 1 : openLine.to;
    changes.push({ from: openLine.from, to: openEnd });

    view.dispatch({ changes });
    return true;
  }

  if (main.empty) {
    const insert = '```\n\n```\n';
    view.dispatch({
      changes: { from: main.from, insert },
      selection: { anchor: main.from + 4 }
    });
    return true;
  }

  const fromLine = state.doc.lineAt(main.from);
  const toLine = state.doc.lineAt(main.to);
  view.dispatch({
    changes: [
      { from: fromLine.from, insert: '```\n' },
      { from: toLine.to, insert: '\n```' }
    ]
  });
  return true;
}
