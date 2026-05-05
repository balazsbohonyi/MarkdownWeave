import type { EditorView } from '@codemirror/view';

const MAX_HEADING = 6;
const HEADING_RE = /^(#{1,6})(\s)/;

export function increaseHeadingLevel(view: EditorView): boolean {
  return adjustHeadingLevel(view, 1);
}

export function decreaseHeadingLevel(view: EditorView): boolean {
  return adjustHeadingLevel(view, -1);
}

function adjustHeadingLevel(view: EditorView, delta: 1 | -1): boolean {
  const { state } = view;
  const { main } = state.selection;
  const fromLine = state.doc.lineAt(main.from);
  const toLine = state.doc.lineAt(main.to);
  const changes: { from: number; to?: number; insert?: string }[] = [];

  for (let lineNum = fromLine.number; lineNum <= toLine.number; lineNum++) {
    const line = state.doc.line(lineNum);
    const match = HEADING_RE.exec(line.text);

    if (delta === 1) {
      if (match) {
        const level = match[1].length;
        if (level < MAX_HEADING) {
          changes.push({ from: line.from, to: line.from + level, insert: '#'.repeat(level + 1) });
        }
      } else {
        changes.push({ from: line.from, insert: '# ' });
      }
    } else {
      if (match) {
        const level = match[1].length;
        if (level === 1) {
          changes.push({ from: line.from, to: line.from + level + match[2].length });
        } else {
          changes.push({ from: line.from, to: line.from + level, insert: '#'.repeat(level - 1) });
        }
      }
    }
  }

  if (changes.length === 0) {
    return false;
  }

  view.dispatch({ changes });
  return true;
}
