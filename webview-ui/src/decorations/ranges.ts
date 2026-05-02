import { EditorSelection, type EditorState, type Transaction } from '@codemirror/state';

export type RawRange = {
  from: number;
  to: number;
};

export type HiddenBoundary = RawRange & {
  contentFrom: number;
  contentTo: number;
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

export function getHiddenBoundarySnapPosition(boundaries: HiddenBoundary[], position: number): number | undefined {
  const candidates: Array<{ from: number; to: number; snap: number }> = [];

  for (const boundary of boundaries) {
    let snap: number | undefined;
    if (position === boundary.contentFrom && boundary.from < boundary.contentFrom) {
      snap = boundary.from;
    } else if (position === boundary.contentTo && boundary.contentTo < boundary.to) {
      snap = boundary.to;
    }

    if (snap !== undefined) {
      candidates.push({ from: boundary.from, to: boundary.to, snap });
    }
  }

  candidates.sort((left, right) => left.to - left.from - (right.to - right.from));
  return candidates[0]?.snap;
}

export function expandSelectionToHiddenBoundaries(
  selection: EditorSelection,
  boundaries: HiddenBoundary[]
): EditorSelection | undefined {
  if (boundaries.length === 0 || selection.ranges.every((range) => range.empty)) {
    return undefined;
  }

  let changed = false;
  const ranges = selection.ranges.map((range) => {
    if (range.empty) {
      return range;
    }

    let anchor = range.anchor;
    let head = range.head;
    for (const boundary of boundaries) {
      const expanded = expandRangeToHiddenBoundary(anchor, head, boundary);
      anchor = expanded.anchor;
      head = expanded.head;
    }

    if (anchor === range.anchor && head === range.head) {
      return range;
    }

    changed = true;
    return EditorSelection.range(anchor, head, range.goalColumn);
  });

  return changed ? EditorSelection.create(ranges, selection.mainIndex) : undefined;
}

function expandRangeToHiddenBoundary(
  anchor: number,
  head: number,
  boundary: HiddenBoundary
): { anchor: number; head: number } {
  let nextAnchor = anchor;
  let nextHead = head;
  let from = Math.min(nextAnchor, nextHead);
  let to = Math.max(nextAnchor, nextHead);

  if (from === boundary.contentFrom && to > boundary.contentFrom && boundary.from < boundary.contentFrom) {
    if (nextAnchor === from) {
      nextAnchor = boundary.from;
    }
    if (nextHead === from) {
      nextHead = boundary.from;
    }
  }

  from = Math.min(nextAnchor, nextHead);
  to = Math.max(nextAnchor, nextHead);

  if (to === boundary.contentTo && from < boundary.contentTo && boundary.contentTo < boundary.to) {
    if (nextAnchor === to) {
      nextAnchor = boundary.to;
    }
    if (nextHead === to) {
      nextHead = boundary.to;
    }
  }

  return {
    anchor: nextAnchor,
    head: nextHead
  };
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
