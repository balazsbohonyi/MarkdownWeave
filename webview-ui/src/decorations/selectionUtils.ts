import { StateEffect, StateField, type EditorState } from '@codemirror/state';

export type SelectionRevealState = 'none' | 'pending' | 'committed';

export const setSelectionRevealState = StateEffect.define<SelectionRevealState>();

export const selectionRevealField = StateField.define<SelectionRevealState>({
  create: () => 'none',
  update(value, transaction) {
    let next = value;

    for (const effect of transaction.effects) {
      if (effect.is(setSelectionRevealState)) {
        next = effect.value;
      }
    }

    if (transaction.selection && next !== 'pending' && transaction.state.selection.ranges.every((range) => range.empty)) {
      return 'none';
    }

    return next;
  }
});

export function isEditing(
  state: EditorState,
  from: number,
  to: number,
  hasVisibleSelection = true,
  revealPendingSelection = false
): boolean {
  if (!hasVisibleSelection) {
    return false;
  }

  let editing = false;
  const revealState = getSelectionRevealState(state);

  state.selection.ranges.some((range) => {
    if (range.empty) {
      editing = range.from >= from && range.from < to;
      return editing;
    }

    editing = (revealPendingSelection || revealState === 'committed') && range.from < to && range.to > from;
    return editing;
  });

  return editing;
}

export function getSelectionRevealState(state: EditorState): SelectionRevealState {
  return state.field(selectionRevealField, false) ?? 'none';
}
