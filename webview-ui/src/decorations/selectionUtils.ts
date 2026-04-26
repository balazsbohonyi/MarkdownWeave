import type { EditorState } from '@codemirror/state';

export function isEditing(state: EditorState, from: number, to: number, hasVisibleSelection = true): boolean {
  if (!hasVisibleSelection) {
    return false;
  }

  let editing = false;

  state.selection.ranges.some((range) => {
    if (range.empty) {
      editing = range.from >= from && range.from <= to;
      return editing;
    }

    editing = range.from <= to && range.to >= from;
    return editing;
  });

  return editing;
}
