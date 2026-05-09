import type { Extension, Range, Transaction, TransactionSpec } from '@codemirror/state';
import { EditorSelection, EditorState, StateEffect } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';
import { CheckboxWidget } from '../widgets/CheckboxWidget';
import { HrWidget } from '../widgets/HrWidget';
import { ImageWidget } from '../widgets/ImageWidget';
import { ListMarkerWidget } from '../widgets/ListMarkerWidget';
import { WikiLinkWidget } from '../widgets/WikiLinkWidget';
import { postOpenLink, postOpenWikiLink, requestWikiLinkStatus, setImageUriClearCallback } from '../bridge';
import { wikiLinkStatusField } from './wikiLinks';
import { collectBlockHiddenBoundaries } from './blockWidgets';
import {
  expandSelectionToHiddenBoundaries,
  findFrontmatterRange,
  getHiddenBoundarySnapPosition,
  rangeOverlaps,
  type HiddenBoundary,
  type RawRange
} from './ranges';
import { getSelectionRevealState, isEditing, selectionRevealField, setSelectionRevealState } from './selectionUtils';

type DecorationHandler = (node: SyntaxNodeRef, context: DecorationContext) => Range<Decoration>[];

type DecorationContext = {
  state: EditorState;
  doc: string;
  hasFocus: boolean;
  listMarkers: Map<number, string>;
  frontmatterRange: RawRange | undefined;
};

type MarkdownNode = {
  from: number;
  to: number;
  name: string;
  node: SyntaxNodeRef['node'];
};

const handlers = new Map<string, DecorationHandler[]>();
const headingPattern = /^ATXHeading([1-6])$/;
const unorderedListMarkers = ['\u2022', '\u25E6', '\u25AA'];
const selectionSettled = StateEffect.define<void>();
const POINTER_SELECTION_DRAG_SLOP = 2;
let pointerSelectionInProgress = false;
let keyboardSelectionInProgress = false;
let imageCacheVersion = 0;

export function bumpImageCacheVersion(view: EditorView): void {
  imageCacheVersion++;
  view.dispatch({});
}
let pendingPointerId: number | undefined;
let pendingPointerStart: { x: number; y: number } | undefined;
let removePointerArmListeners: (() => void) | undefined;
let removePointerFinishListeners: (() => void) | undefined;
let removeKeyboardFinishListeners: (() => void) | undefined;

export const markdownDecorations = ViewPlugin.fromClass(
  class {
    public decorations: DecorationSet;

    public constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
      setImageUriClearCallback(() => bumpImageCacheVersion(view));
    }

    public destroy(): void {
      setImageUriClearCallback(undefined);
    }

    public update(update: ViewUpdate): void {
      if (update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(selectionSettled)))) {
        this.decorations = buildDecorations(update.view);
        return;
      }

      if (update.docChanged || update.viewportChanged || update.focusChanged) {
        this.decorations = buildDecorations(update.view);
        return;
      }

      if (!update.selectionSet) {
        return;
      }

      if (update.state.selection.ranges.some((range) => !range.empty)) {
        if (!pointerSelectionInProgress && pendingPointerId === undefined && getSelectionRevealState(update.state) !== 'committed') {
          ensureKeyboardSelectionReleaseCommit(update.view);
        }
        this.decorations = buildDecorations(update.view);
        return;
      }

      this.decorations = buildDecorations(update.view);
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      pointerdown(event, view) {
        if (event.button === 0) {
          armPointerSelection(view, event);
        }
      },
      mousedown(event, view) {
        if (event.button !== 0) {
          return;
        }

        if (!('PointerEvent' in window)) {
          startPointerSelection(view);
        }
      },
      keydown(event, view) {
        if (isSelectionExtendingKey(event)) {
          startKeyboardSelection(view);
        }
      },
      keyup(event, view) {
        if (keyboardSelectionInProgress && shouldCommitKeyboardSelection(event)) {
          finishKeyboardSelection(view);
        }
      },
      drop(_event, view) {
        finishPointerSelection(view);
      },
      dragend(_event, view) {
        finishPointerSelection(view);
      },
      pointerup(_event, view) {
        clearPointerSelectionArm(view);
        schedulePointerSelectionFinish(view);
      },
      pointercancel(_event, view) {
        clearPointerSelectionArm(view);
        schedulePointerSelectionFinish(view);
      },
      blur(_event, view) {
        finishKeyboardSelection(view);
      }
    }
  }
);

export const linkClickExtension = EditorView.domEventHandlers({
  mousedown(event, view) {
    return openLinkFromMouseEvent(event, view);
  },
  click(event, view) {
    return moveCursorOutsideHiddenBoundary(event, view);
  }
});

export const markdownBoundarySnapping: Extension = [
  selectionRevealField,
  EditorState.transactionFilter.of(adjustHiddenBoundaryTransaction)
];

export function commitMarkdownSelection(view: EditorView): boolean {
  const selection = view.state.selection;
  if (selection.ranges.every((range) => range.empty)) {
    if (getSelectionRevealState(view.state) !== 'none') {
      view.dispatch({ effects: setSelectionRevealState.of('none') });
    }
    return false;
  }

  const expandedSelection = expandSelectionToHiddenBoundaries(
    selection,
    collectAllHiddenBoundaries(view.state)
  );
  const effects = [setSelectionRevealState.of('committed'), selectionSettled.of()];

  view.dispatch(
    expandedSelection
      ? { selection: expandedSelection, effects }
      : { effects }
  );
  return true;
}

function registerDecoration(nodeName: string, handler: DecorationHandler): void {
  const existing = handlers.get(nodeName) ?? [];
  existing.push(handler);
  handlers.set(nodeName, existing);
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const context: DecorationContext = {
    state: view.state,
    doc: view.state.doc.toString(),
    hasFocus: view.hasFocus,
    listMarkers: buildListMarkers(view.state),
    frontmatterRange: findFrontmatterRange(view.state)
  };

  for (const visibleRange of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: visibleRange.from,
      to: visibleRange.to,
      enter(node) {
        if (context.frontmatterRange && node.from >= context.frontmatterRange.from && node.to <= context.frontmatterRange.to) {
          return false;
        }

        const nodeHandlers = handlers.get(node.name);
        if (!nodeHandlers) {
          return;
        }

        for (const handler of nodeHandlers) {
          ranges.push(...handler(node, context));
        }
      }
    });

    ranges.push(...buildImageDecorations(visibleRange.from, visibleRange.to, context));
  }

  ranges.push(...buildOptimisticHeadingDecorations(context));

  return Decoration.set(ranges, true);
}

function armPointerSelection(view: EditorView, event: PointerEvent): void {
  clearPointerSelectionArm(view);
  pendingPointerId = event.pointerId;
  pendingPointerStart = { x: event.clientX, y: event.clientY };

  const maybeStart = (moveEvent: PointerEvent): void => {
    if (moveEvent.pointerId !== event.pointerId) {
      return;
    }

    if ((moveEvent.buttons & 1) === 0) {
      clearPointerSelectionArm(view);
      return;
    }

    if (!hasMovedPastDragSlop(moveEvent)) {
      return;
    }

    removePointerArmListeners?.();
    startPointerSelection(view);
  };
  const cancel = (): void => {
    clearPointerSelectionArm(view);
  };

  view.dom.addEventListener('pointermove', maybeStart);
  window.addEventListener('pointermove', maybeStart);
  view.dom.addEventListener('pointerup', cancel, { once: true });
  view.dom.addEventListener('pointercancel', cancel, { once: true });
  window.addEventListener('pointerup', cancel, { once: true });
  window.addEventListener('pointercancel', cancel, { once: true });

  removePointerArmListeners = () => {
    view.dom.removeEventListener('pointermove', maybeStart);
    window.removeEventListener('pointermove', maybeStart);
    view.dom.removeEventListener('pointerup', cancel);
    view.dom.removeEventListener('pointercancel', cancel);
    window.removeEventListener('pointerup', cancel);
    window.removeEventListener('pointercancel', cancel);
    removePointerArmListeners = undefined;
  };
}

function hasMovedPastDragSlop(event: PointerEvent): boolean {
  if (!pendingPointerStart) {
    return false;
  }

  return (
    Math.abs(event.clientX - pendingPointerStart.x) > POINTER_SELECTION_DRAG_SLOP ||
    Math.abs(event.clientY - pendingPointerStart.y) > POINTER_SELECTION_DRAG_SLOP
  );
}

function clearPointerSelectionArm(_view: EditorView): void {
  removePointerArmListeners?.();
  pendingPointerId = undefined;
  pendingPointerStart = undefined;
}

function startPointerSelection(view: EditorView): void {
  if (pointerSelectionInProgress) {
    return;
  }

  removePointerArmListeners?.();
  removePointerFinishListeners?.();
  pointerSelectionInProgress = true;
  view.dispatch({ effects: setSelectionRevealState.of('pending') });

  const finish = (): void => {
    schedulePointerSelectionFinish(view);
  };
  const pointerId = pendingPointerId;
  pendingPointerId = undefined;
  pendingPointerStart = undefined;

  if (pointerId !== undefined) {
    try {
      view.dom.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is best effort; window listeners below are the fallback.
    }

    view.dom.addEventListener('pointerup', finish, { once: true });
    view.dom.addEventListener('pointercancel', finish, { once: true });
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
  }

  window.addEventListener('mouseup', finish, { once: true });
  window.addEventListener('drop', finish, { once: true });
  window.addEventListener('dragend', finish, { once: true });
  window.addEventListener('blur', finish, { once: true });

  removePointerFinishListeners = () => {
    window.removeEventListener('mouseup', finish);
    window.removeEventListener('drop', finish);
    window.removeEventListener('dragend', finish);
    window.removeEventListener('blur', finish);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    view.dom.removeEventListener('pointerup', finish);
    view.dom.removeEventListener('pointercancel', finish);
    if (pointerId !== undefined) {
      try {
        if (view.dom.hasPointerCapture(pointerId)) {
          view.dom.releasePointerCapture(pointerId);
        }
      } catch {
        // The pointer may already be released by the browser.
      }
    }
    removePointerFinishListeners = undefined;
  };
}

function schedulePointerSelectionFinish(view: EditorView): void {
  window.setTimeout(() => finishPointerSelection(view), 0);
}

function finishPointerSelection(view: EditorView): void {
  if (!pointerSelectionInProgress) {
    return;
  }

  pointerSelectionInProgress = false;
  removePointerFinishListeners?.();

  if (view.state.selection.ranges.some((range) => !range.empty)) {
    commitMarkdownSelection(view);
    return;
  }

  if (getSelectionRevealState(view.state) !== 'none') {
    view.dispatch({ effects: setSelectionRevealState.of('none') });
  }
}

function startKeyboardSelection(view: EditorView): void {
  if (keyboardSelectionInProgress) {
    return;
  }

  beginKeyboardSelectionReleaseCommit(view, true);
}

function finishKeyboardSelection(view: EditorView): void {
  if (!keyboardSelectionInProgress) {
    return;
  }

  keyboardSelectionInProgress = false;
  removeKeyboardFinishListeners?.();
  if (view.state.selection.ranges.some((range) => !range.empty)) {
    commitMarkdownSelection(view);
    return;
  }

  view.dispatch({ effects: setSelectionRevealState.of('none') });
}

function ensureKeyboardSelectionReleaseCommit(view: EditorView): void {
  if (!keyboardSelectionInProgress) {
    beginKeyboardSelectionReleaseCommit(view, false);
  }
}

function beginKeyboardSelectionReleaseCommit(view: EditorView, dispatchPending: boolean): void {
  removeKeyboardFinishListeners?.();
  keyboardSelectionInProgress = true;
  if (dispatchPending) {
    view.dispatch({ effects: setSelectionRevealState.of('pending') });
  }

  const finishFromKey = (event: KeyboardEvent): void => {
    if (shouldCommitKeyboardSelection(event)) {
      finishKeyboardSelection(view);
    }
  };
  const finish = (): void => {
    finishKeyboardSelection(view);
  };

  window.addEventListener('keyup', finishFromKey, true);
  document.addEventListener('keyup', finishFromKey, true);
  view.contentDOM.addEventListener('keyup', finishFromKey, true);
  window.addEventListener('blur', finish, true);

  removeKeyboardFinishListeners = () => {
    window.removeEventListener('keyup', finishFromKey, true);
    document.removeEventListener('keyup', finishFromKey, true);
    view.contentDOM.removeEventListener('keyup', finishFromKey, true);
    window.removeEventListener('blur', finish, true);
    removeKeyboardFinishListeners = undefined;
  };
}

function isSelectionExtendingKey(event: KeyboardEvent): boolean {
  if (!event.shiftKey || event.altKey) {
    return false;
  }

  return (
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown' ||
    event.key === 'Home' ||
    event.key === 'End' ||
    event.key === 'PageUp' ||
    event.key === 'PageDown'
  );
}

function shouldCommitKeyboardSelection(event: KeyboardEvent): boolean {
  return event.key === 'Shift' || !event.shiftKey;
}

for (let level = 1; level <= 6; level += 1) {
  registerDecoration(`ATXHeading${level}`, headingDecoration);
}

registerDecoration('SetextHeading1', headingDecoration);
registerDecoration('SetextHeading2', headingDecoration);
registerDecoration('StrongEmphasis', emphasisDecoration);
registerDecoration('Emphasis', emphasisDecoration);
registerDecoration('Strikethrough', emphasisDecoration);
registerDecoration('InlineCode', inlineCodeDecoration);
registerDecoration('Link', linkDecoration);
registerDecoration('Autolink', linkDecoration);
registerDecoration('Blockquote', blockquoteDecoration);
registerDecoration('HorizontalRule', horizontalRuleDecoration);
registerDecoration('ListItem', listItemDecoration);
registerDecoration('WikiLink', wikiLinkDecoration);

function headingDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];
  const atxMatch = headingPattern.exec(node.name);
  const lineText = context.doc.slice(node.from, node.to);
  const level = atxMatch ? Number(atxMatch[1]) : node.name === 'SetextHeading1' ? 1 : 2;
  const editing = isEditing(context.state, node.from, node.to, context.hasFocus);

  if (!atxMatch && isEditingPartialSetextMarker(context, node)) {
    return [];
  }

  addHeadingLineDecoration(ranges, context, node.from, level);

  if (atxMatch) {
    const prefix = lineText.match(/^#{1,6}[ \t]*/)?.[0] ?? '';
    const suffix = lineText.match(/[ \t]+#{1,6}[ \t]*$/)?.[0] ?? '';
    const contentFrom = node.from + prefix.length;
    const contentTo = Math.max(contentFrom, node.to - suffix.length);

    if (editing) {
      ranges.push(Decoration.mark({ class: `mw-heading mw-h${level}` }).range(node.from, node.to));
      return ranges;
    }

    if (prefix.length > 0) {
      ranges.push(Decoration.replace({}).range(node.from, contentFrom));
    }

    if (suffix.length > 0) {
      ranges.push(Decoration.replace({}).range(contentTo, node.to));
    }

    if (contentFrom < contentTo) {
      ranges.push(Decoration.mark({ class: `mw-heading mw-h${level}` }).range(contentFrom, contentTo));
    }

    return ranges;
  }

  const mark = childNodes(node).find((child) => child.name === 'HeaderMark');
  if (!mark) {
    return ranges;
  }

  const headingEnd = Math.max(node.from, mark.from - 1);

  if (editing) {
    ranges.push(Decoration.mark({ class: `mw-heading mw-h${level}` }).range(node.from, headingEnd));
    return ranges;
  }

  ranges.push(Decoration.mark({ class: `mw-heading mw-h${level}` }).range(node.from, headingEnd));
  ranges.push(Decoration.replace({}).range(mark.from, mark.to));
  return ranges;
}

function emphasisDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  const markerName = node.name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark';
  const markers = childNodes(node).filter((child) => child.name === markerName);
  if (markers.length < 2) {
    return [];
  }

  const firstMarker = markers[0];
  const lastMarker = markers[markers.length - 1];
  const className =
    node.name === 'StrongEmphasis' ? 'mw-strong' : node.name === 'Strikethrough' ? 'mw-strike' : 'mw-emphasis';
  const ranges: Range<Decoration>[] = [Decoration.mark({ class: className }).range(firstMarker.to, lastMarker.from)];

  if (!isEditing(context.state, node.from, node.to, context.hasFocus)) {
    ranges.unshift(...markers.map((marker) => Decoration.replace({}).range(marker.from, marker.to)));
  }

  return ranges;
}

function inlineCodeDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  const marks = childNodes(node).filter((child) => child.name === 'CodeMark');
  if (marks.length < 2) {
    return [];
  }

  const firstMark = marks[0];
  const lastMark = marks[marks.length - 1];
  const ranges: Range<Decoration>[] = [Decoration.mark({ class: 'mw-inline-code' }).range(firstMark.to, lastMark.from)];

  if (!isEditing(context.state, node.from, node.to, context.hasFocus)) {
    ranges.unshift(...marks.map((mark) => Decoration.replace({}).range(mark.from, mark.to)));
  }

  return ranges;
}

function linkDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  const children = childNodes(node);
  const linkMarks = children.filter((child) => child.name === 'LinkMark');
  const editing = isEditing(context.state, node.from, node.to, context.hasFocus);

  if (node.name === 'Autolink') {
    const url = children.find((child) => child.name === 'URL');
    if (!url || linkMarks.length < 2) {
      return [];
    }

    const ranges: Range<Decoration>[] = [Decoration.mark({ class: 'mw-link' }).range(url.from, url.to)];

    if (!editing) {
      ranges.unshift(Decoration.replace({}).range(linkMarks[0].from, linkMarks[0].to));
      ranges.push(Decoration.replace({}).range(linkMarks[1].from, linkMarks[1].to));
    }

    return ranges;
  }

  if (linkMarks.length < 2) {
    return [];
  }

  const firstMark = linkMarks[0];
  const textEndMark = linkMarks[1];
  const textFrom = firstMark.to;
  const textTo = textEndMark.from;
  const ranges: Range<Decoration>[] = [];

  if (textFrom < textTo) {
    ranges.push(Decoration.mark({ class: 'mw-link' }).range(textFrom, textTo));
  }

  if (!editing) {
    ranges.unshift(Decoration.replace({}).range(firstMark.from, firstMark.to));
    ranges.push(Decoration.replace({}).range(textEndMark.from, node.to));
  }

  return ranges;
}

function wikiLinkDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  if (isEditing(context.state, node.from, node.to, context.hasFocus)) {
    return [];
  }

  const targetNode = node.node.getChild('WikiLinkTarget');
  const headingNode = node.node.getChild('WikiLinkHeading');
  const aliasNode = node.node.getChild('WikiLinkAlias');

  if (!targetNode) {
    return [];
  }

  const target = context.doc.slice(targetNode.from, targetNode.to);
  let displayText: string;

  if (aliasNode) {
    displayText = context.doc.slice(aliasNode.from, aliasNode.to);
  } else if (headingNode) {
    const heading = context.doc.slice(headingNode.from, headingNode.to);
    displayText = `${target} > ${heading}`;
  } else {
    displayText = target;
  }

  if (!displayText) {
    return [];
  }

  const statuses = context.state.field(wikiLinkStatusField);
  const status = statuses.get(target);

  return [
    Decoration.replace({
      widget: new WikiLinkWidget(displayText, status?.exists),
      inclusive: false
    }).range(node.from, node.to)
  ];
}

function blockquoteDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];
  const marks = childNodes(node).filter((child) => child.name === 'QuoteMark');
  const editing = isEditing(context.state, node.from, node.to, context.hasFocus);

  if (!editing) {
    for (const mark of marks) {
      const hideTo = context.doc.charAt(mark.to) === ' ' ? mark.to + 1 : mark.to;
      ranges.push(Decoration.replace({}).range(mark.from, hideTo));
    }
  }

  const startLine = context.state.doc.lineAt(node.from);
  const endLine = context.state.doc.lineAt(node.to);
  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = context.state.doc.line(lineNumber);
    const text = line.text;
    const depth = Math.min(6, Math.max(1, text.match(/^\s*(?:>\s*)+/)?.[0].split('>').length ?? 1) - 1);
    ranges.push(Decoration.line({ class: `mw-blockquote mw-blockquote-depth-${depth}` }).range(line.from));
  }

  return ranges;
}

function horizontalRuleDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  if (isEditing(context.state, node.from, node.to, context.hasFocus)) {
    return [];
  }

  return [Decoration.replace({ widget: new HrWidget() }).range(node.from, node.to)];
}

function listItemDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  const children = childNodes(node);
  const marker = children.find((child) => child.name === 'ListMark');
  if (!marker) {
    return [];
  }

  const ranges: Range<Decoration>[] = [];
  const markerTo = context.doc.charAt(marker.to) === ' ' ? marker.to + 1 : marker.to;
  const line = context.state.doc.lineAt(node.from);
  if (isEditingSingleListMarkerLine(context, line.from, line.to)) {
    return [];
  }

  const indent = Math.min(8, Math.floor((line.text.match(/^\s*/)?.[0].length ?? 0) / 2));
  const task = children.find((child) => child.name === 'Task');
  const taskMarker = task ? childNodes(task).find((child) => child.name === 'TaskMarker') : undefined;
  const prefixTo = taskMarker ? taskMarker.to : markerTo;
  const editingPrefix = isEditing(context.state, marker.from, prefixTo, context.hasFocus);

  ranges.push(
    Decoration.line({ class: `mw-list-line mw-list-indent-${indent}` }).range(line.from)
  );

  if (editingPrefix) {
    ranges.push(Decoration.mark({ class: 'mw-list-marker-raw' }).range(marker.from, markerTo));
  } else {
    const renderedMarker = context.listMarkers.get(node.from) ?? '\u2022';
    const markerReplacement = taskMarker && !/^\d+\.$/.test(renderedMarker) ? '' : renderedMarker;
    const markerKind: 'bullet' | 'ordered' | 'task' =
      markerReplacement === '' ? 'task' : /^\d+\.$/.test(markerReplacement) ? 'ordered' : 'bullet';
    ranges.push(
      Decoration.replace({
        widget: new ListMarkerWidget(markerReplacement, markerKind),
        inclusive: false
      }).range(marker.from, markerTo)
    );
  }

  if (taskMarker) {
    const checked = /\[[xX]\]/.test(context.doc.slice(taskMarker.from, taskMarker.to));

    if (editingPrefix) {
      ranges.push(Decoration.mark({ class: 'mw-task-marker-raw' }).range(taskMarker.from, taskMarker.to));
    } else {
      ranges.push(
        Decoration.replace({
          widget: new CheckboxWidget(checked, taskMarker.from, taskMarker.to),
          inclusive: false
        }).range(taskMarker.from, taskMarker.to)
      );
    }
  }

  return ranges;
}

function buildImageDecorations(from: number, to: number, context: DecorationContext): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];
  const visibleText = context.doc.slice(from, to);
  const imagePattern = /!\[([^\]\n]*)\]\(([^)\n]*?)(?:\s+=(\d+)x(\d+))?\)/g;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(visibleText)) !== null) {
    const imageFrom = from + match.index;
    const imageTo = imageFrom + match[0].length;
    if (context.frontmatterRange && rangeOverlaps(imageFrom, imageTo, [context.frontmatterRange])) {
      continue;
    }

    const src = match[2].trim();
    if (src.length === 0) {
      continue;
    }

    const widget = new ImageWidget({
      alt: match[1],
      src,
      raw: match[0],
      from: imageFrom,
      to: imageTo,
      width: match[3] ? Number(match[3]) : undefined,
      height: match[4] ? Number(match[4]) : undefined,
      cacheVersion: imageCacheVersion
    });

    if (isEditing(context.state, imageFrom, imageTo, context.hasFocus, true)) {
      ranges.push(
        Decoration.widget({
          side: 1,
          widget: new ImageWidget({
            alt: match[1],
            src,
            raw: match[0],
            from: imageFrom,
            to: imageTo,
            block: true,
            width: match[3] ? Number(match[3]) : undefined,
            height: match[4] ? Number(match[4]) : undefined,
            cacheVersion: imageCacheVersion
          })
        }).range(imageTo)
      );
      continue;
    }

    ranges.push(
      Decoration.replace({
        widget
      }).range(imageFrom, imageTo)
    );
  }

  return ranges;
}

function buildOptimisticHeadingDecorations(context: DecorationContext): Range<Decoration>[] {
  if (!context.hasFocus || !context.state.selection.main.empty) {
    return [];
  }

  const line = context.state.doc.lineAt(context.state.selection.main.head);
  if (context.frontmatterRange && rangeOverlaps(line.from, line.to, [context.frontmatterRange])) {
    return [];
  }

  const match = /^(#{1,6})(?=[^\s#]|$)/.exec(line.text);
  if (!match) {
    return [];
  }

  const level = match[1].length;
  return [Decoration.line({ class: `mw-heading-line mw-h${level}-line` }).range(line.from)];
}

function isEditingSingleListMarkerLine(context: DecorationContext, from: number, to: number): boolean {
  if (!context.hasFocus || !context.state.selection.main.empty) {
    return false;
  }

  const selection = context.state.selection.main.head;
  if (selection < from || selection > to) {
    return false;
  }

  return /^[ \t]*[-+*][ \t]*$/.test(context.state.doc.sliceString(from, to));
}

function isEditingPartialSetextMarker(context: DecorationContext, node: SyntaxNodeRef): boolean {
  if (!context.hasFocus || !context.state.selection.main.empty) {
    return false;
  }

  const marker = childNodes(node).find((child) => child.name === 'HeaderMark');
  if (!marker) {
    return false;
  }

  const selection = context.state.selection.main.head;
  if (selection < marker.from || selection > marker.to) {
    return false;
  }

  const markerText = context.doc.slice(marker.from, marker.to).trim();
  return /^-{1,2}$/.test(markerText);
}

function adjustHiddenBoundaryTransaction(transaction: Transaction): TransactionSpec | readonly TransactionSpec[] {
  if (!transaction.selection || transaction.docChanged) {
    return transaction;
  }

  const boundaries = collectAllHiddenBoundaries(transaction.state);
  if (transaction.newSelection.ranges.some((range) => !range.empty)) {
    return transaction;
  }

  if (transaction.newSelection.main.goalColumn === undefined) {
    return transaction;
  }

  const selection = transaction.newSelection.main;
  const snapPosition = getHiddenBoundarySnapPosition(boundaries, selection.head);
  if (snapPosition === undefined || snapPosition === selection.head) {
    return transaction;
  }

  // Guard: only snap within the same line. A stale Lezer tree (e.g. after typing a
  // new heading) can report boundary positions that land on the wrong line and
  // cause the cursor to jump there.
  const cursorLine = transaction.state.doc.lineAt(selection.head);
  const snapLine = transaction.state.doc.lineAt(snapPosition);
  if (cursorLine.number !== snapLine.number) {
    return transaction;
  }

  return [
    transaction,
    {
      selection: EditorSelection.cursor(snapPosition, selection.assoc, undefined, selection.goalColumn),
      scrollIntoView: transaction.scrollIntoView
    }
  ];
}

function collectAllHiddenBoundaries(state: EditorState): HiddenBoundary[] {
  return [
    ...collectMarkdownHiddenBoundaries(state),
    ...collectBlockHiddenBoundaries(state)
  ].sort((left, right) => left.from - right.from || left.to - right.to);
}

function collectMarkdownHiddenBoundaries(state: EditorState): HiddenBoundary[] {
  const boundaries: HiddenBoundary[] = [];
  const doc = state.doc.toString();
  const frontmatterRange = findFrontmatterRange(state);

  syntaxTree(state).iterate({
    enter(node) {
      if (frontmatterRange && node.from >= frontmatterRange.from && node.to <= frontmatterRange.to) {
        return false;
      }

      if (headingPattern.test(node.name)) {
        addAtxHeadingBoundary(boundaries, state, node);
        return true;
      }

      if (node.name === 'SetextHeading1' || node.name === 'SetextHeading2') {
        addSetextHeadingBoundary(boundaries, node);
        return true;
      }

      if (
        node.name === 'StrongEmphasis' ||
        node.name === 'Emphasis' ||
        node.name === 'Strikethrough' ||
        node.name === 'InlineCode'
      ) {
        addInlineMarkerBoundary(boundaries, node);
        return true;
      }

      if (node.name === 'Link' || node.name === 'Autolink') {
        addLinkBoundary(boundaries, node);
        return true;
      }

      return true;
    }
  });

  addMarkdownImageBoundaries(boundaries, doc, frontmatterRange);
  return boundaries.sort((left, right) => left.from - right.from || left.to - right.to);
}

function addAtxHeadingBoundary(boundaries: HiddenBoundary[], state: EditorState, node: SyntaxNodeRef): void {
  const lineText = state.sliceDoc(node.from, node.to);
  const prefix = lineText.match(/^#{1,6}[ \t]*/)?.[0] ?? '';
  if (!prefix) {
    return;
  }

  const suffix = lineText.match(/[ \t]+#{1,}[ \t]*$/)?.[0] ?? '';
  addHiddenBoundary(boundaries, {
    from: node.from,
    to: node.to,
    contentFrom: node.from + prefix.length,
    contentTo: Math.max(node.from + prefix.length, node.to - suffix.length)
  });
}

function addSetextHeadingBoundary(boundaries: HiddenBoundary[], node: SyntaxNodeRef): void {
  const mark = childNodes(node).find((child) => child.name === 'HeaderMark');
  if (!mark) {
    return;
  }

  addHiddenBoundary(boundaries, {
    from: node.from,
    to: mark.to,
    contentFrom: node.from,
    contentTo: Math.max(node.from, mark.from - 1)
  });
}

function addInlineMarkerBoundary(boundaries: HiddenBoundary[], node: SyntaxNodeRef): void {
  const markers = getInlineMarkerNodes(node);
  if (markers.length < 2) {
    return;
  }

  const firstMarker = markers[0];
  const lastMarker = markers[markers.length - 1];
  addHiddenBoundary(boundaries, {
    from: node.from,
    to: node.to,
    contentFrom: firstMarker.to,
    contentTo: lastMarker.from
  });
}

function addLinkBoundary(boundaries: HiddenBoundary[], node: SyntaxNodeRef): void {
  const children = childNodes(node);
  const linkMarks = children.filter((child) => child.name === 'LinkMark');

  if (node.name === 'Autolink') {
    const url = children.find((child) => child.name === 'URL');
    if (!url || linkMarks.length < 2) {
      return;
    }

    addHiddenBoundary(boundaries, {
      from: node.from,
      to: node.to,
      contentFrom: url.from,
      contentTo: url.to
    });
    return;
  }

  if (linkMarks.length < 2) {
    return;
  }

  addHiddenBoundary(boundaries, {
    from: node.from,
    to: node.to,
    contentFrom: linkMarks[0].to,
    contentTo: linkMarks[1].from
  });
}

function addMarkdownImageBoundaries(
  boundaries: HiddenBoundary[],
  doc: string,
  frontmatterRange: RawRange | undefined
): void {
  const imagePattern = /!\[([^\]\n]*)\]\(([^)\n]*?)(?:\s+=(\d+)x(\d+))?\)/g;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (frontmatterRange && rangeOverlaps(from, to, [frontmatterRange])) {
      continue;
    }

    addHiddenBoundary(boundaries, {
      from,
      to,
      contentFrom: from,
      contentTo: to
    });
  }
}

function addHiddenBoundary(boundaries: HiddenBoundary[], boundary: HiddenBoundary): void {
  const contentFrom = Math.max(boundary.from, Math.min(boundary.to, boundary.contentFrom));
  const contentTo = Math.max(boundary.from, Math.min(boundary.to, boundary.contentTo));
  if (boundary.to <= boundary.from || contentTo < contentFrom || (boundary.from === contentFrom && contentTo === boundary.to)) {
    return;
  }

  boundaries.push({
    from: boundary.from,
    to: boundary.to,
    contentFrom,
    contentTo
  });
}

function childNodes(node: SyntaxNodeRef | MarkdownNode): MarkdownNode[] {
  const children: MarkdownNode[] = [];
  const cursor = node.node.cursor();

  if (!cursor.firstChild()) {
    return children;
  }

  do {
    children.push({
      from: cursor.from,
      to: cursor.to,
      name: cursor.name,
      node: cursor.node
    });
  } while (cursor.nextSibling());

  return children;
}

function buildListMarkers(state: EditorState): Map<number, string> {
  const markers = new Map<number, string>();
  const tree = syntaxTree(state);

  tree.iterate({
    enter(node) {
      if (node.name !== 'OrderedList' && node.name !== 'BulletList') {
        return;
      }

      const items = childNodes(node).filter((child) => child.name === 'ListItem');
      if (node.name === 'OrderedList') {
        items.forEach((item, index) => {
          markers.set(item.from, `${index + 1}.`);
        });
        return;
      }

      const depth = getListDepth(node.node);
      const marker = unorderedListMarkers[Math.min(unorderedListMarkers.length - 1, depth)];
      items.forEach((item) => markers.set(item.from, marker));
    }
  });

  return markers;
}

function getListDepth(node: SyntaxNode): number {
  let depth = 0;
  let current = node.parent;

  while (current) {
    if (current.name === 'OrderedList' || current.name === 'BulletList') {
      depth += 1;
    }

    current = current.parent;
  }

  return depth;
}

function addHeadingLineDecoration(
  ranges: Range<Decoration>[],
  context: DecorationContext,
  position: number,
  level: number
): void {
  const line = context.state.doc.lineAt(position);
  ranges.push(Decoration.line({ class: `mw-heading-line mw-h${level}-line` }).range(line.from));
}

function openLinkFromMouseEvent(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) {
    return false;
  }

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) {
    return false;
  }

  const url = findLinkTargetAt(view.state, pos);
  if (url) {
    event.preventDefault();
    event.stopPropagation();
    postOpenLink(url);
    return true;
  }

  const wikiLink = findWikiLinkAt(view.state, pos);
  if (wikiLink) {
    event.preventDefault();
    event.stopPropagation();
    const status = requestWikiLinkStatus(wikiLink.target);
    if (status?.exists && status.uri) {
      postOpenWikiLink(status.uri, wikiLink.heading);
    }
    return true;
  }

  return false;
}

function findWikiLinkAt(state: EditorState, pos: number): { target: string; heading?: string } | undefined {
  // posAtCoords returns node.from for replace-widget decorations (no interior positions).
  // bias 1 at node.from finds the WikiLink's first child; bias -1 covers interior positions.
  for (const bias of [1, -1] as const) {
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, bias);
    while (node) {
      if (node.name === 'WikiLink') {
        const targetNode = node.getChild('WikiLinkTarget');
        if (!targetNode) return undefined;
        const target = state.doc.sliceString(targetNode.from, targetNode.to);
        const headingNode = node.getChild('WikiLinkHeading');
        const heading = headingNode ? state.doc.sliceString(headingNode.from, headingNode.to) : undefined;
        return { target, heading };
      }
      node = node.parent;
    }
  }

  return undefined;
}

function moveCursorOutsideHiddenBoundary(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }

  if (!view.state.selection.main.empty) {
    return false;
  }

  // Use the cursor position placed by mousedown rather than posAtCoords, because by
  // the time 'click' fires CM6 may have re-rendered decorations (revealing markers),
  // causing posAtCoords to return a position inside the now-visible marker text instead
  // of at the boundary edge.
  const pos = view.state.selection.main.head;

  const snapPosition = getHiddenBoundarySnapPosition(collectAllHiddenBoundaries(view.state), pos);
  if (snapPosition === undefined || snapPosition === pos) {
    return false;
  }

  view.dispatch({ selection: { anchor: snapPosition } });
  return true;
}

function getInlineMarkerNodes(node: SyntaxNodeRef): MarkdownNode[] {
  const markerName = node.name === 'InlineCode' ? 'CodeMark' : node.name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark';
  return childNodes(node).filter((child) => child.name === markerName);
}

function findLinkTargetAt(state: EditorState, pos: number): string | undefined {
  const doc = state.doc.toString();
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);

  while (node) {
    if ((node.name === 'Link' || node.name === 'Autolink') && pos >= node.from && pos <= node.to) {
      return getLinkTarget(node, doc);
    }

    node = node.parent;
  }

  return undefined;
}

function getLinkTarget(node: SyntaxNodeRef, doc: string): string | undefined {
  const children = childNodes(node);
  const url = children.find((child) => child.name === 'URL');

  if (url) {
    return doc.slice(url.from, url.to);
  }

  const label = children.find((child) => child.name === 'LinkLabel');
  if (!label) {
    return undefined;
  }

  return resolveReferenceLink(doc, doc.slice(label.from + 1, label.to - 1));
}

function resolveReferenceLink(doc: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const referencePattern = new RegExp(`^\\[${escaped}\\]:\\s+(\\S+)`, 'im');
  return referencePattern.exec(doc)?.[1];
}
