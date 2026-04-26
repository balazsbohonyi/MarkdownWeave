import type { Range } from '@codemirror/state';
import { EditorState, StateEffect } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';
import { CheckboxWidget } from '../widgets/CheckboxWidget';
import { HrWidget } from '../widgets/HrWidget';
import { ImageWidget } from '../widgets/ImageWidget';
import { ListMarkerWidget } from '../widgets/ListMarkerWidget';
import { postOpenLink } from '../bridge';
import { isEditing } from './selectionUtils';

type DecorationHandler = (node: SyntaxNodeRef, context: DecorationContext) => Range<Decoration>[];

type DecorationContext = {
  state: EditorState;
  doc: string;
  hasFocus: boolean;
  listMarkers: Map<number, string>;
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
const SELECTION_DECORATION_DELAY_MS = 140;
const selectionSettled = StateEffect.define<void>();
let pointerSelectionInProgress = false;
let removePointerFinishListeners: (() => void) | undefined;

export const markdownDecorations = ViewPlugin.fromClass(
  class {
    public decorations: DecorationSet;
    private selectionTimer: number | undefined;

    public constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    public update(update: ViewUpdate): void {
      if (update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(selectionSettled)))) {
        this.decorations = buildDecorations(update.view);
        return;
      }

      if (update.docChanged || update.viewportChanged || update.focusChanged) {
        this.clearSelectionTimer();
        this.decorations = buildDecorations(update.view);
        return;
      }

      if (!update.selectionSet) {
        return;
      }

      this.clearSelectionTimer();

      if (update.state.selection.ranges.some((range) => !range.empty)) {
        if (pointerSelectionInProgress) {
          return;
        }

        this.selectionTimer = window.setTimeout(() => {
          this.selectionTimer = undefined;
          update.view.dispatch({ effects: selectionSettled.of() });
        }, SELECTION_DECORATION_DELAY_MS);
        return;
      }

      this.decorations = buildDecorations(update.view);
    }

    public destroy(): void {
      this.clearSelectionTimer();
    }

    private clearSelectionTimer(): void {
      if (this.selectionTimer) {
        clearTimeout(this.selectionTimer);
        this.selectionTimer = undefined;
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      mousedown(event, view) {
        if (event.button !== 0) {
          return;
        }

        startPointerSelection(view);
      },
      drop(_event, view) {
        finishPointerSelection(view);
      },
      dragend(_event, view) {
        finishPointerSelection(view);
      }
    }
  }
);

export const linkClickExtension = EditorView.domEventHandlers({
  mousedown(event, view) {
    return openLinkFromMouseEvent(event, view) || moveCursorOutsideInlineBoundary(event, view);
  }
});

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
    listMarkers: buildListMarkers(view.state)
  };

  for (const visibleRange of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: visibleRange.from,
      to: visibleRange.to,
      enter(node) {
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

  return Decoration.set(ranges, true);
}

function startPointerSelection(view: EditorView): void {
  removePointerFinishListeners?.();
  pointerSelectionInProgress = true;

  const finish = (): void => {
    finishPointerSelection(view);
  };

  window.addEventListener('mouseup', finish, { once: true });
  window.addEventListener('drop', finish, { once: true });
  window.addEventListener('dragend', finish, { once: true });
  window.addEventListener('blur', finish, { once: true });

  removePointerFinishListeners = () => {
    window.removeEventListener('mouseup', finish);
    window.removeEventListener('drop', finish);
    window.removeEventListener('dragend', finish);
    window.removeEventListener('blur', finish);
    removePointerFinishListeners = undefined;
  };
}

function finishPointerSelection(view: EditorView): void {
  if (!pointerSelectionInProgress) {
    return;
  }

  pointerSelectionInProgress = false;
  removePointerFinishListeners?.();

  if (view.state.selection.ranges.some((range) => !range.empty)) {
    view.dispatch({ effects: selectionSettled.of() });
  }
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

function headingDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];
  const atxMatch = headingPattern.exec(node.name);
  const lineText = context.doc.slice(node.from, node.to);
  const level = atxMatch ? Number(atxMatch[1]) : node.name === 'SetextHeading1' ? 1 : 2;
  const editing = isEditing(context.state, node.from, node.to, context.hasFocus);

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
  const ranges: Range<Decoration>[] = [Decoration.mark({ class: 'mw-link' }).range(textFrom, textTo)];

  if (!editing) {
    ranges.unshift(Decoration.replace({}).range(firstMark.from, firstMark.to));
    ranges.push(Decoration.replace({}).range(textEndMark.from, node.to));
  }

  return ranges;
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
    ranges.push(
      Decoration.replace({
        widget: new ListMarkerWidget(markerReplacement),
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
      height: match[4] ? Number(match[4]) : undefined
    });

    if (isEditing(context.state, imageFrom, imageTo, context.hasFocus)) {
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
            height: match[4] ? Number(match[4]) : undefined
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
  if (!url) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  postOpenLink(url);
  return true;
}

function moveCursorOutsideInlineBoundary(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) {
    return false;
  }

  const snapPosition = getInlineBoundarySnapPosition(view.state, pos);
  if (snapPosition === undefined || snapPosition === pos) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  view.focus();
  view.dispatch({ selection: { anchor: snapPosition } });
  return true;
}

function getInlineBoundarySnapPosition(state: EditorState, pos: number): number | undefined {
  const candidates: Array<{ from: number; to: number; snap: number }> = [];

  syntaxTree(state).iterate({
    from: Math.max(0, pos - 1),
    to: Math.min(state.doc.length, pos + 1),
    enter(node) {
      if (
        node.name !== 'StrongEmphasis' &&
        node.name !== 'Emphasis' &&
        node.name !== 'Strikethrough' &&
        node.name !== 'InlineCode'
      ) {
        return;
      }

      const markers = getInlineMarkerNodes(node);
      if (markers.length < 2) {
        return;
      }

      const firstMarker = markers[0];
      const lastMarker = markers[markers.length - 1];
      let snap: number | undefined;

      if (pos === firstMarker.to) {
        snap = node.from;
      } else if (pos === lastMarker.from) {
        snap = node.to;
      }

      if (snap !== undefined) {
        candidates.push({ from: node.from, to: node.to, snap });
      }
    }
  });

  candidates.sort((left, right) => left.to - left.from - (right.to - right.from));
  return candidates[0]?.snap;
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
