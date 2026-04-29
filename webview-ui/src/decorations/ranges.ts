import type { EditorSelection, EditorState, Transaction } from '@codemirror/state';

export type RawRange = {
  from: number;
  to: number;
};

export function findFrontmatterRange(state: EditorState): RawRange | undefined {
  if (state.doc.lines < 3) {
    return undefined;
  }

  const firstLine = state.doc.line(1);
  if (firstLine.text.trim() !== '---') {
    return undefined;
  }

  for (let lineNumber = 2; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (line.text.trim() === '---') {
      return {
        from: firstLine.from,
        to: line.to
      };
    }
  }

  return undefined;
}

export function rangeOverlaps(from: number, to: number, ranges: RawRange[]): boolean {
  return ranges.some((range) => from < range.to && to > range.from);
}

export function selectionIntersects(selection: EditorSelection, from: number, to: number): boolean {
  return selection.ranges.some((range) => (range.empty ? range.from >= from && range.from <= to : range.from < to && range.to > from));
}

export function selectionChanged(transaction: Transaction): boolean {
  return !transaction.startState.selection.eq(transaction.state.selection);
}

export function mapRange(range: RawRange, transaction: Transaction): RawRange | undefined {
  const from = transaction.changes.mapPos(range.from, 1);
  const to = transaction.changes.mapPos(range.to, -1);

  if (to <= from) {
    return undefined;
  }

  return { from, to };
}

export function rangesEqual(left: RawRange, right: RawRange): boolean {
  return left.from === right.from && left.to === right.to;
}
