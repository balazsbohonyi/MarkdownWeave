import type { Range } from '@codemirror/state';
import { EditorState, StateEffect } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
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
};

type MarkdownNode = {
  from: number;
  to: number;
  name: string;
  node: SyntaxNodeRef['node'];
};

const handlers = new Map<string, DecorationHandler[]>();
const headingPattern = /^ATXHeading([1-6])$/;
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

      if (update.docChanged || update.viewportChanged) {
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
  click(event, view) {
    if (!event.ctrlKey && !event.metaKey) {
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
    postOpenLink(url);
    return true;
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
    doc: view.state.doc.toString()
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
  if (isEditing(context.state, node.from, node.to)) {
    return [];
  }

  const ranges: Range<Decoration>[] = [];
  const atxMatch = headingPattern.exec(node.name);
  const lineText = context.doc.slice(node.from, node.to);
  const level = atxMatch ? Number(atxMatch[1]) : node.name === 'SetextHeading1' ? 1 : 2;

  if (atxMatch) {
    const prefix = lineText.match(/^#{1,6}[ \t]*/)?.[0] ?? '';
    const suffix = lineText.match(/[ \t]+#{1,6}[ \t]*$/)?.[0] ?? '';
    const contentFrom = node.from + prefix.length;
    const contentTo = Math.max(contentFrom, node.to - suffix.length);

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
    return [];
  }

  const headingEnd = Math.max(node.from, mark.from - 1);
  ranges.push(Decoration.mark({ class: `mw-heading mw-h${level}` }).range(node.from, headingEnd));
  ranges.push(Decoration.replace({}).range(mark.from, mark.to));
  return ranges;
}

function emphasisDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  if (isEditing(context.state, node.from, node.to)) {
    return [];
  }

  const markerName = node.name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark';
  const markers = childNodes(node).filter((child) => child.name === markerName);
  if (markers.length < 2) {
    return [];
  }

  const firstMarker = markers[0];
  const lastMarker = markers[markers.length - 1];
  const className =
    node.name === 'StrongEmphasis' ? 'mw-strong' : node.name === 'Strikethrough' ? 'mw-strike' : 'mw-emphasis';

  return [
    ...markers.map((marker) => Decoration.replace({}).range(marker.from, marker.to)),
    Decoration.mark({ class: className }).range(firstMarker.to, lastMarker.from)
  ];
}

function inlineCodeDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  if (isEditing(context.state, node.from, node.to)) {
    return [];
  }

  const marks = childNodes(node).filter((child) => child.name === 'CodeMark');
  if (marks.length < 2) {
    return [];
  }

  const firstMark = marks[0];
  const lastMark = marks[marks.length - 1];
  return [
    ...marks.map((mark) => Decoration.replace({}).range(mark.from, mark.to)),
    Decoration.mark({ class: 'mw-inline-code' }).range(firstMark.to, lastMark.from)
  ];
}

function linkDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  if (isEditing(context.state, node.from, node.to)) {
    return [];
  }

  const children = childNodes(node);
  const linkMarks = children.filter((child) => child.name === 'LinkMark');

  if (node.name === 'Autolink') {
    const url = children.find((child) => child.name === 'URL');
    if (!url || linkMarks.length < 2) {
      return [];
    }

    return [
      Decoration.replace({}).range(linkMarks[0].from, linkMarks[0].to),
      Decoration.mark({ class: 'mw-link' }).range(url.from, url.to),
      Decoration.replace({}).range(linkMarks[1].from, linkMarks[1].to)
    ];
  }

  if (linkMarks.length < 2) {
    return [];
  }

  const firstMark = linkMarks[0];
  const textEndMark = linkMarks[1];
  const textFrom = firstMark.to;
  const textTo = textEndMark.from;

  return [
    Decoration.replace({}).range(firstMark.from, firstMark.to),
    Decoration.mark({ class: 'mw-link' }).range(textFrom, textTo),
    Decoration.replace({}).range(textEndMark.from, node.to)
  ];
}

function blockquoteDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  if (isEditing(context.state, node.from, node.to)) {
    return [];
  }

  const ranges: Range<Decoration>[] = [];
  const marks = childNodes(node).filter((child) => child.name === 'QuoteMark');

  for (const mark of marks) {
    const hideTo = context.doc.charAt(mark.to) === ' ' ? mark.to + 1 : mark.to;
    ranges.push(Decoration.replace({}).range(mark.from, hideTo));
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
  if (isEditing(context.state, node.from, node.to)) {
    return [];
  }

  return [Decoration.replace({ block: true, widget: new HrWidget() }).range(node.from, node.to)];
}

function listItemDecoration(node: SyntaxNodeRef, context: DecorationContext): Range<Decoration>[] {
  if (isEditing(context.state, node.from, node.to)) {
    return [];
  }

  const children = childNodes(node);
  const marker = children.find((child) => child.name === 'ListMark');
  if (!marker) {
    return [];
  }

  const ranges: Range<Decoration>[] = [];
  const markerText = context.doc.slice(marker.from, marker.to);
  const markerReplacement = /^\d/.test(markerText) ? markerText.replace(/[.)]$/, '.') : '\u2022';
  const markerTo = context.doc.charAt(marker.to) === ' ' ? marker.to + 1 : marker.to;
  const line = context.state.doc.lineAt(node.from);
  const indent = Math.min(8, Math.floor((line.text.match(/^\s*/)?.[0].length ?? 0) / 2));

  ranges.push(
    Decoration.line({ class: `mw-list-line mw-list-indent-${indent}` }).range(line.from),
    Decoration.replace({
      widget: new ListMarkerWidget(markerReplacement),
      inclusive: false
    }).range(marker.from, markerTo)
  );

  const task = children.find((child) => child.name === 'Task');
  const taskMarker = task ? childNodes(task).find((child) => child.name === 'TaskMarker') : undefined;
  if (taskMarker) {
    const checked = /\[[xX]\]/.test(context.doc.slice(taskMarker.from, taskMarker.to));
    ranges.push(
      Decoration.replace({
        widget: new CheckboxWidget(checked, taskMarker.from, taskMarker.to),
        inclusive: false
      }).range(taskMarker.from, taskMarker.to)
    );
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

    if (isEditing(context.state, imageFrom, imageTo)) {
      continue;
    }

    const src = match[2].trim();
    if (src.length === 0) {
      continue;
    }

    ranges.push(
      Decoration.replace({
        widget: new ImageWidget({
          alt: match[1],
          src,
          raw: match[0],
          from: imageFrom,
          to: imageTo,
          width: match[3] ? Number(match[3]) : undefined,
          height: match[4] ? Number(match[4]) : undefined
        })
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

function findLinkTargetAt(state: EditorState, pos: number): string | undefined {
  const doc = state.doc.toString();
  let target: string | undefined;

  syntaxTree(state).iterate({
    from: Math.max(0, pos - 1),
    to: Math.min(state.doc.length, pos + 1),
    enter(node) {
      if (target || (node.name !== 'Link' && node.name !== 'Autolink')) {
        return;
      }

      if (pos < node.from || pos > node.to) {
        return;
      }

      target = getLinkTarget(node, doc);
    }
  });

  return target;
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
