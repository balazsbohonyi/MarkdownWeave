import { syntaxTree } from '@codemirror/language';
import {
  countColumn,
  EditorSelection,
  EditorState,
  findColumn,
  Prec,
  StateEffect,
  StateField,
  type Extension,
  type Range
} from '@codemirror/state';
import { Decoration, EditorView, keymap, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { requestCodeHighlight, type HighlightedCodeBlock, type HighlightedCodeToken } from '../bridge';
import { CodeBlockPreviewWidget } from '../widgets/CodeBlockWidget';
import { FrontmatterPillWidget } from '../widgets/FrontmatterPillWidget';
import { HtmlBlockWidget, HtmlImageWidget, isHtmlImageMarkup, sanitizeHtml } from '../widgets/HtmlBlockWidget';
import { DisplayMathWidget, InlineMathWidget } from '../widgets/MathWidget';
import { MermaidWidget } from '../widgets/MermaidWidget';
import { TableRawToggleWidget, TableWidget, type ParsedTable, type TableAlignment } from '../widgets/TableWidget';
import { applyShikiCss } from '../widgets/shikiCss';
import {
  findFrontmatterRange,
  type HiddenBoundary,
  mapRange,
  rangeOverlaps,
  rangesEqual,
  selectionChanged,
  selectionIntersects,
  type RawRange
} from './ranges';
import { isEditing, setSelectionRevealState } from './selectionUtils';

type CodeBlock = {
  code: string;
  lang: string;
  id: string;
  codeFrom: number;
  codeTo: number;
  openingLineFrom: number;
  openingLineTo: number;
  closingLineFrom: number;
  closingLineTo: number;
};

type CachedCodeHighlight = {
  highlight: HighlightedCodeBlock;
  code: string;
  lang: string;
  blockFrom: number;
  sequence: number;
};

type CodeHighlightCache = {
  byId: Map<string, CachedCodeHighlight>;
  byBlockFrom: Map<number, CachedCodeHighlight>;
};

type MathRange = RawRange & {
  raw: string;
  tex: string;
};

type CollapsedBlockRange = RawRange & {
  kind: 'block' | 'fenced-code';
  enterFromAbove?: number;
  enterFromBelow?: number;
};

type InlineHtmlRange = RawRange & {
  tag: string;
  openFrom: number;
  openTo: number;
  closeFrom: number;
  closeTo: number;
  contentFrom: number;
  contentTo: number;
  allowed: boolean;
};

const htmlClassByTag = new Map<string, string>([
  ['mark', 'mw-html-mark'],
  ['sup', 'mw-html-sup'],
  ['sub', 'mw-html-sub'],
  ['kbd', 'mw-html-kbd'],
  ['abbr', 'mw-html-abbr'],
  ['span', 'mw-html-span']
]);

export const toggleTableRaw = StateEffect.define<RawRange>();
export const toggleFrontmatterExpanded = StateEffect.define<boolean>();

const setBlockWidgetFocus = StateEffect.define<boolean>();
const collapseFrontmatter = StateEffect.define<void>();
const setCodeHighlight = StateEffect.define<CachedCodeHighlight>();
const pendingCodeHighlightIds = new Set<string>();
let codeHighlightRequestSequence = 0;

const blockWidgetFocusField = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setBlockWidgetFocus)) {
        return effect.value;
      }
    }

    return value;
  }
});

const tableRawRangesField = StateField.define<RawRange[]>({
  create: () => [],
  update(value, transaction) {
    let next = transaction.docChanged
      ? value
          .map((range) => mapRange(range, transaction))
          .filter((range): range is RawRange => Boolean(range))
      : value;

    for (const effect of transaction.effects) {
      if (!effect.is(toggleTableRaw)) {
        continue;
      }

      const existing = next.findIndex((range) => rangesEqual(range, effect.value));
      if (existing >= 0) {
        next = next.filter((_range, index) => index !== existing);
      } else {
        next = [...next, effect.value];
      }
    }

    return next;
  }
});

const frontmatterExpandedField = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    let next = value;

    for (const effect of transaction.effects) {
      if (effect.is(toggleFrontmatterExpanded)) {
        next = effect.value;
      }

      if (effect.is(collapseFrontmatter)) {
        next = false;
      }
    }

    const range = findFrontmatterRange(transaction.state);
    if (!range) {
      return false;
    }

    if (next && selectionChanged(transaction) && !selectionIntersects(transaction.state.selection, range.from, range.to)) {
      return false;
    }

    return next;
  }
});

const mermaidSourceRangeField = StateField.define<RawRange | undefined>({
  create: () => undefined,
  update(value, transaction) {
    let next = transaction.docChanged && value ? mapRange(value, transaction) : value;

    if (!transaction.selection) {
      return next;
    }

    const selection = transaction.state.selection;
    if (selection.ranges.some((range) => !range.empty)) {
      return next && selectionIntersects(selection, next.from, next.to) ? next : undefined;
    }

    const mermaidRange = findMermaidCodeRangeAt(transaction.state, selection.main.head);
    if (mermaidRange) {
      return mermaidRange;
    }

    if (next && selectionIntersects(selection, next.from, next.to)) {
      return next;
    }

    return undefined;
  }
});

const codeHighlightField = StateField.define<CodeHighlightCache>({
  create: () => ({
    byId: new Map<string, CachedCodeHighlight>(),
    byBlockFrom: new Map<number, CachedCodeHighlight>()
  }),
  update(value, transaction) {
    let next = value;

    for (const effect of transaction.effects) {
      if (!effect.is(setCodeHighlight)) {
        continue;
      }

      if (next === value) {
        next = {
          byId: new Map(value.byId),
          byBlockFrom: new Map(value.byBlockFrom)
        };
      }

      next.byId.set(effect.value.highlight.id, effect.value);
      const existing = next.byBlockFrom.get(effect.value.blockFrom);
      if (!existing || existing.sequence <= effect.value.sequence) {
        next.byBlockFrom.set(effect.value.blockFrom, effect.value);
      }
    }

    return next;
  }
});

const blockWidgetDecorationField = StateField.define<DecorationSet>({
  create: (state) => buildBlockDecorations(state),
  update(value, transaction) {
    if (
      !transaction.docChanged &&
      !selectionChanged(transaction) &&
      !transaction.effects.some(isBlockWidgetEffect)
    ) {
      return value;
    }

    return buildBlockDecorations(transaction.state);
  },
  provide: (field) => EditorView.decorations.from(field)
});

const codeHighlightRequester = ViewPlugin.fromClass(
  class {
    public constructor(view: EditorView) {
      requestVisibleCodeHighlights(view);
    }

    public update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        requestVisibleCodeHighlights(update.view);
      }
    }
  }
);

export const markdownBlockWidgets: Extension = [
  blockWidgetFocusField,
  tableRawRangesField,
  frontmatterExpandedField,
  mermaidSourceRangeField,
  codeHighlightField,
  blockWidgetDecorationField,
  codeHighlightRequester,
  EditorView.atomicRanges.of((view) => buildCollapsedBlockAtomicRanges(view.state)),
  EditorView.domEventHandlers({
    focus(_event, view) {
      view.dispatch({ effects: setBlockWidgetFocus.of(true) });
      return false;
    },
    blur(_event, view) {
      view.dispatch({ effects: setBlockWidgetFocus.of(false) });
      return false;
    }
  }),
  Prec.highest(keymap.of([
    {
      key: 'ArrowDown',
      run(view) {
        return moveAcrossCollapsedBlock(view, 'down', false);
      },
      shift(view) {
        return moveAcrossCollapsedBlock(view, 'down', true);
      }
    },
    {
      key: 'ArrowUp',
      run(view) {
        return moveAcrossCollapsedBlock(view, 'up', false);
      },
      shift(view) {
        return moveAcrossCollapsedBlock(view, 'up', true);
      }
    },
    {
      key: 'Escape',
      run(view) {
        if (collapseActiveFencedCode(view)) {
          return true;
        }

        if (!view.state.field(frontmatterExpandedField)) {
          return false;
        }

        view.dispatch({ effects: collapseFrontmatter.of() });
        return true;
      }
    }
  ]))
];

function buildBlockDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const doc = state.doc.toString();
  const hasFocus = state.field(blockWidgetFocusField);
  const forcedRawTables = state.field(tableRawRangesField);
  const codeHighlights = state.field(codeHighlightField);
  const frontmatterRange = findFrontmatterRange(state);
  const frontmatterExpanded = state.field(frontmatterExpandedField);
  const excludedRanges = collectExcludedRanges(state, doc);

  if (frontmatterRange) {
    excludedRanges.push(frontmatterRange);
    if (!frontmatterExpanded && !isEditing(state, frontmatterRange.from, frontmatterRange.to, hasFocus)) {
      ranges.push(
        Decoration.replace({
          block: true,
          widget: new FrontmatterPillWidget(frontmatterRange.from, frontmatterRange.to)
        }).range(frontmatterRange.from, frontmatterRange.to)
      );
    }
  }

  syntaxTree(state).iterate({
    enter(node) {
      if (frontmatterRange && node.from >= frontmatterRange.from && node.to <= frontmatterRange.to) {
        return false;
      }

      if (node.name === 'FencedCode') {
        addCodeBlockDecoration(ranges, state, doc, node, hasFocus, codeHighlights);
        return false;
      }

      if (node.name === 'Table') {
        addTableDecoration(ranges, state, doc, node, forcedRawTables);
        return false;
      }

      if (node.name === 'HTMLBlock') {
        addHtmlBlockDecoration(ranges, state, doc, node, hasFocus);
        return false;
      }

      return true;
    }
  });

  const displayMathRanges = findDisplayMathRanges(state, doc, excludedRanges);
  excludedRanges.push(...displayMathRanges);
  for (const range of displayMathRanges) {
    if (!shouldRevealBlockRaw(state, range.from, range.to, hasFocus)) {
      ranges.push(
        Decoration.replace({
          block: true,
          widget: new DisplayMathWidget(range.tex, range.raw, range.from)
        }).range(range.from, range.to)
      );
    }
  }

  for (const range of findInlineMathRanges(state, doc, excludedRanges)) {
    if (!isEditing(state, range.from, range.to, hasFocus)) {
      ranges.push(
        Decoration.replace({
          widget: new InlineMathWidget(range.tex, range.raw, range.from)
        }).range(range.from, range.to)
      );
    }
  }

  ranges.push(...buildInlineHtmlDecorations(state, hasFocus, excludedRanges));

  return Decoration.set(ranges, true);
}

function requestVisibleCodeHighlights(view: EditorView): void {
  const doc = view.state.doc.toString();
  const highlights = view.state.field(codeHighlightField);

  for (const visibleRange of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: visibleRange.from,
      to: visibleRange.to,
      enter(node) {
        if (node.name !== 'FencedCode') {
          return;
        }

        const parsed = parseCodeBlock(view.state, node, doc);
        if (parsed.lang === 'mermaid' || highlights.byId.has(parsed.id) || pendingCodeHighlightIds.has(parsed.id)) {
          return false;
        }

        pendingCodeHighlightIds.add(parsed.id);
        const sequence = ++codeHighlightRequestSequence;
        requestCodeHighlight(
          {
            id: parsed.id,
            code: parsed.code,
            lang: parsed.lang
          },
          (result) => {
            pendingCodeHighlightIds.delete(parsed.id);
            applyShikiCss(result.css);
            view.dispatch({
              effects: setCodeHighlight.of({
                highlight: result,
                code: parsed.code,
                lang: parsed.lang,
                blockFrom: parsed.openingLineFrom,
                sequence
              })
            });
          }
        );
        return false;
      }
    });
  }
}

function moveAcrossCollapsedBlock(view: EditorView, direction: 'up' | 'down', extend: boolean): boolean {
  const selection = view.state.selection.main;
  if (!extend && !selection.empty) {
    return false;
  }

  const collapsedRanges = findCollapsedBlockRanges(view.state);
  if (collapsedRanges.length === 0) {
    return false;
  }

  const target = getCollapsedAwareVerticalTarget(view.state, selection.head, selection.goalColumn, direction, collapsedRanges);
  if (!target || target.position === selection.head) {
    // Custom handler defers to CM. But CM uses coordsAtPos for line selection, which returns null
    // for positions inside any Decoration.replace widget (e.g. list markers, HR widgets). When the
    // immediate neighbour line's .from position has null coords, CM skips entire lines. Detect this
    // and navigate by line number instead.
    const directionStep = direction === 'down' ? 1 : -1;
    const curLine = view.state.doc.lineAt(selection.head);
    const neighborLineNumber = curLine.number + directionStep;
    if (neighborLineNumber >= 1 && neighborLineNumber <= view.state.doc.lines) {
      const neighborLine = view.state.doc.line(neighborLineNumber);
      if (view.coordsAtPos(neighborLine.from) === null) {
        const resolvedGoalColumn = selection.goalColumn ??
          countColumn(curLine.text, view.state.tabSize,
            Math.max(0, Math.min(curLine.length, selection.head - curLine.from)));
        const pos = neighborLine.from + findColumn(neighborLine.text, resolvedGoalColumn, view.state.tabSize);
        view.focus();
        const range = extend
          ? EditorSelection.range(selection.anchor, pos, resolvedGoalColumn)
          : EditorSelection.cursor(pos, direction === 'down' ? -1 : 1, undefined, resolvedGoalColumn);
        view.dispatch({
          selection: EditorSelection.create([range]),
          effects: [EditorView.scrollIntoView(range, { y: 'nearest', yMargin: 32 })],
          scrollIntoView: true
        });
        return true;
      }
    }
    return false;
  }

  view.focus();
  const range = extend
    ? EditorSelection.range(selection.anchor, target.position, target.goalColumn)
    : EditorSelection.cursor(target.position, direction === 'down' ? -1 : 1, undefined, target.goalColumn);
  const effects: StateEffect<unknown>[] = [EditorView.scrollIntoView(range, { y: 'nearest', yMargin: 32 })];

  if (extend) {
    effects.push(setSelectionRevealState.of('pending'));
  }

  view.dispatch({
    selection: EditorSelection.create([range]),
    effects,
    scrollIntoView: true
  });
  return true;
}

export function collectBlockHiddenBoundaries(state: EditorState): HiddenBoundary[] {
  const doc = state.doc.toString();
  const excludedRanges = collectExcludedRanges(state, doc);
  const boundaries: HiddenBoundary[] = [];

  for (const mathRange of findDisplayMathRanges(state, doc, excludedRanges)) {
    addHiddenBoundary(boundaries, {
      from: mathRange.from,
      to: mathRange.to,
      contentFrom: getDisplayMathContentFrom(state, mathRange),
      contentTo: getDisplayMathContentTo(state, mathRange)
    });
  }

  excludedRanges.push(...boundaries.map(({ from, to }) => ({ from, to })));

  const inlineMathRanges = findInlineMathRanges(state, doc, excludedRanges);
  for (const mathRange of inlineMathRanges) {
    addHiddenBoundary(boundaries, {
      from: mathRange.from,
      to: mathRange.to,
      contentFrom: mathRange.from + 1,
      contentTo: mathRange.to - 1
    });
  }
  excludedRanges.push(...inlineMathRanges.map(({ from, to }) => ({ from, to })));

  for (const htmlRange of findInlineHtmlRanges(state, excludedRanges)) {
    if (!htmlRange.allowed || htmlRange.tag === 'img' || htmlRange.contentFrom >= htmlRange.contentTo) {
      continue;
    }

    addHiddenBoundary(boundaries, {
      from: htmlRange.from,
      to: htmlRange.to,
      contentFrom: htmlRange.contentFrom,
      contentTo: htmlRange.contentTo
    });
  }

  return boundaries.sort((left, right) => left.from - right.from || left.to - right.to);
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

function getDisplayMathContentFrom(state: EditorState, range: MathRange): number {
  const startLine = state.doc.lineAt(range.from);
  return startLine.text.trim() === '$$' ? startLine.to + 1 : range.from + 2;
}

function getDisplayMathContentTo(state: EditorState, range: MathRange): number {
  const endLine = state.doc.lineAt(Math.max(range.from, range.to - 1));
  return endLine.text.trim() === '$$' ? endLine.from - 1 : range.to - 2;
}

function getCollapsedAwareVerticalTarget(
  state: EditorState,
  head: number,
  goalColumn: number | undefined,
  direction: 'up' | 'down',
  collapsedRanges: CollapsedBlockRange[]
): { position: number; goalColumn: number } | undefined {
  const directionStep = direction === 'down' ? 1 : -1;
  const currentLine = state.doc.lineAt(head);
  const currentCollapsed = findCollapsedRangeForLine(collapsedRanges, currentLine.from, currentLine.to);
  const resolvedGoalColumn =
    goalColumn ?? countColumn(currentLine.text, state.tabSize, Math.max(0, Math.min(currentLine.length, head - currentLine.from)));
  let targetLineNumber = currentCollapsed
    ? direction === 'down'
      ? (() => { const l = state.doc.lineAt(currentCollapsed.to); return l.from === currentCollapsed.to ? l.number : l.number + 1; })()
      : state.doc.lineAt(currentCollapsed.from).number - 1
    : currentLine.number + directionStep;
  let crossedCollapsedRange = Boolean(currentCollapsed);

  while (targetLineNumber >= 1 && targetLineNumber <= state.doc.lines) {
    const targetLine = state.doc.line(targetLineNumber);
    const targetCollapsed = findCollapsedRangeForLine(collapsedRanges, targetLine.from, targetLine.to);

    if (!targetCollapsed) {
      if (!crossedCollapsedRange) {
        return undefined;
      }

      return {
        position: state.doc.line(targetLineNumber).from + findColumn(targetLine.text, resolvedGoalColumn, state.tabSize),
        goalColumn: resolvedGoalColumn
      };
    }

    if (targetCollapsed.kind === 'fenced-code') {
      return {
        position: direction === 'down'
          ? targetCollapsed.enterFromAbove ?? targetCollapsed.from
          : targetCollapsed.enterFromBelow ?? Math.max(targetCollapsed.from, targetCollapsed.to - 1),
        goalColumn: resolvedGoalColumn
      };
    }

    crossedCollapsedRange = true;
    targetLineNumber =
      direction === 'down'
        ? (() => { const l = state.doc.lineAt(targetCollapsed.to); return l.from === targetCollapsed.to ? l.number : l.number + 1; })()
        : state.doc.lineAt(targetCollapsed.from).number - 1;
  }

  if (!crossedCollapsedRange) {
    return undefined;
  }

  return {
    position: direction === 'down' ? state.doc.length : 0,
    goalColumn: resolvedGoalColumn
  };
}

function findCollapsedRangeForLine(
  ranges: CollapsedBlockRange[],
  lineFrom: number,
  lineTo: number
): CollapsedBlockRange | undefined {
  return ranges.find((range) => lineFrom < range.to && lineTo > range.from);
}

function buildCollapsedBlockAtomicRanges(state: EditorState): DecorationSet {
  const marker = Decoration.mark({});
  return Decoration.set(
    findCollapsedBlockRanges(state)
      .filter((range) => range.kind !== 'fenced-code')
      .map((range) => marker.range(range.from, range.to)),
    true
  );
}

function findCollapsedBlockRanges(state: EditorState): CollapsedBlockRange[] {
  const doc = state.doc.toString();
  const hasFocus = state.field(blockWidgetFocusField);
  const forcedRawTables = state.field(tableRawRangesField);
  const frontmatterRange = findFrontmatterRange(state);
  const ranges: CollapsedBlockRange[] = [];

  if (frontmatterRange && !state.field(frontmatterExpandedField) && !isEditing(state, frontmatterRange.from, frontmatterRange.to, hasFocus)) {
    ranges.push({ ...frontmatterRange, kind: 'block' });
  }

  syntaxTree(state).iterate({
    enter(node) {
      if (frontmatterRange && node.from >= frontmatterRange.from && node.to <= frontmatterRange.to) {
        return false;
      }

      if (node.name === 'FencedCode') {
        const parsed = parseCodeBlock(state, node, doc);
        const sourceActive = parsed.lang === 'mermaid'
          ? isMermaidSourceActive(state, node.from, node.to, hasFocus)
          : shouldRevealCodeBlockRaw(state, node.from, node.to, hasFocus);
        if (!sourceActive) {
          ranges.push({
            from: node.from,
            to: node.to,
            kind: 'fenced-code',
            enterFromAbove: parsed.openingLineFrom,
            enterFromBelow: parsed.closingLineFrom
          });
        }
        return false;
      }

      if (node.name === 'Table') {
        if (!forcedRawTables.some((range) => rangesEqual(range, node))) {
          ranges.push({ from: node.from, to: node.to, kind: 'block' });
        }
        return false;
      }

      if (node.name === 'HTMLBlock') {
        const htmlRevealPending = isHtmlImageMarkup(doc.slice(node.from, node.to));
        if (!isEditing(state, node.from, node.to, hasFocus, htmlRevealPending)) {
          ranges.push({ from: node.from, to: node.to, kind: 'block' });
        }
        return false;
      }

      return true;
    }
  });

  const excludedRanges = collectExcludedRanges(state, doc);
  if (frontmatterRange) {
    excludedRanges.push(frontmatterRange);
  }

  for (const range of findDisplayMathRanges(state, doc, excludedRanges)) {
    if (!shouldRevealBlockRaw(state, range.from, range.to, hasFocus)) {
      ranges.push({ from: range.from, to: range.to, kind: 'block' });
    }
  }

  return ranges.sort((left, right) => left.from - right.from);
}

function addCodeBlockDecoration(
  ranges: Range<Decoration>[],
  state: EditorState,
  doc: string,
  node: SyntaxNodeRef,
  hasFocus: boolean,
  codeHighlights: CodeHighlightCache
): void {
  const parsed = parseCodeBlock(state, node, doc);
  const editing = shouldRevealCodeBlockRaw(state, node.from, node.to, hasFocus);

  if (parsed.lang === 'mermaid') {
    if (isMermaidSourceActive(state, node.from, node.to, hasFocus)) {
      addCodeLineDecorations(ranges, state, parsed, true);
      return;
    }

    ranges.push(
      Decoration.replace({
        block: true,
        widget: new MermaidWidget({
          id: parsed.id,
          code: parsed.code,
          from: node.from,
          to: node.to,
          selected: selectionOverlapsRange(state, node.from, node.to)
        })
      }).range(node.from, node.to)
    );
    return;
  }

  if (editing) {
    addCodeLineDecorations(ranges, state, parsed, true);
    addCodeTokenDecorations(ranges, parsed, getActiveCodeHighlight(parsed, codeHighlights));
    return;
  }

  ranges.push(
    Decoration.replace({
      block: true,
      widget: new CodeBlockPreviewWidget({
        code: parsed.code,
        lang: parsed.lang,
        from: node.from,
        highlight: codeHighlights.byId.get(parsed.id)?.highlight
      })
    }).range(node.from, node.to)
  );
}

function shouldRevealCodeBlockRaw(state: EditorState, from: number, to: number, hasFocus: boolean): boolean {
  return isEditing(state, from, to, hasFocus, true) || isSelectionTouchingRange(state, from, to, hasFocus);
}

function isSelectionTouchingRange(state: EditorState, from: number, to: number, hasFocus: boolean): boolean {
  if (!hasFocus) {
    return false;
  }

  return state.selection.ranges.some((range) => !range.empty && range.from <= to && range.to >= from);
}

function getActiveCodeHighlight(parsed: CodeBlock, cache: CodeHighlightCache): HighlightedCodeBlock | undefined {
  const exact = cache.byId.get(parsed.id);
  if (exact) {
    return exact.highlight;
  }

  const cached = cache.byBlockFrom.get(parsed.openingLineFrom);
  if (!cached || cached.lang !== parsed.lang) {
    return undefined;
  }

  return mapCachedHighlightToCode(cached, parsed);
}

function mapCachedHighlightToCode(cached: CachedCodeHighlight, parsed: CodeBlock): HighlightedCodeBlock | undefined {
  if (cached.code === parsed.code) {
    return cached.highlight;
  }

  const tokens = mapHighlightTokens(cached.highlight.tokens, cached.code, parsed.code);
  if (tokens.length === 0) {
    return undefined;
  }

  return {
    ...cached.highlight,
    id: parsed.id,
    tokens
  };
}

function mapHighlightTokens(
  tokens: readonly HighlightedCodeToken[],
  previousCode: string,
  currentCode: string
): HighlightedCodeToken[] {
  const prefixLength = getCommonPrefixLength(previousCode, currentCode);
  let previousSuffixStart = previousCode.length;
  let currentSuffixStart = currentCode.length;

  while (
    previousSuffixStart > prefixLength &&
    currentSuffixStart > prefixLength &&
    previousCode.charCodeAt(previousSuffixStart - 1) === currentCode.charCodeAt(currentSuffixStart - 1)
  ) {
    previousSuffixStart -= 1;
    currentSuffixStart -= 1;
  }

  const delta = currentCode.length - previousCode.length;
  const mapped: HighlightedCodeToken[] = [];

  for (const token of tokens) {
    if (token.to <= prefixLength) {
      mapped.push(token);
      continue;
    }

    if (token.from >= previousSuffixStart) {
      const from = token.from + delta;
      const to = token.to + delta;
      if (from >= 0 && to > from && to <= currentCode.length) {
        mapped.push({ ...token, from, to });
      }
      continue;
    }

    if (token.from < prefixLength) {
      mapped.push({ ...token, to: prefixLength });
    }
  }

  return mapped;
}

function getCommonPrefixLength(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let index = 0;

  while (index < length && left.charCodeAt(index) === right.charCodeAt(index)) {
    index += 1;
  }

  return index;
}

function addTableDecoration(
  ranges: Range<Decoration>[],
  state: EditorState,
  doc: string,
  node: SyntaxNodeRef,
  forcedRawTables: RawRange[]
): void {
  const forcedRaw = forcedRawTables.some((range) => rangesEqual(range, node));
  if (forcedRaw) {
    const firstLine = state.doc.lineAt(node.from);
    ranges.push(
      Decoration.widget({
        side: 1,
        widget: new TableRawToggleWidget(node.from, node.to)
      }).range(firstLine.to)
    );
    return;
  }

  const table = parseTable(doc.slice(node.from, node.to));
  if (!table) {
    return;
  }

  ranges.push(
    Decoration.replace({
      block: true,
      widget: new TableWidget(table, node.from, node.to, selectionOverlapsRange(state, node.from, node.to))
    }).range(node.from, node.to)
  );
}

function selectionOverlapsRange(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => !range.empty && range.from < to && range.to > from);
}

function isCursorEditingRange(state: EditorState, from: number, to: number, hasVisibleSelection: boolean): boolean {
  return hasVisibleSelection && state.selection.ranges.some((range) => range.empty && range.from >= from && range.from <= to);
}

function isMermaidSourceActive(state: EditorState, from: number, to: number, hasVisibleSelection: boolean): boolean {
  if (!hasVisibleSelection) {
    return false;
  }

  const activeRange = state.field(mermaidSourceRangeField);
  return rangesEqual(activeRange ?? { from: -1, to: -1 }, { from, to }) || isCursorEditingRange(state, from, to, true);
}

function addHtmlBlockDecoration(
  ranges: Range<Decoration>[],
  state: EditorState,
  doc: string,
  node: SyntaxNodeRef,
  hasFocus: boolean
): void {
  const raw = doc.slice(node.from, node.to);
  if (isHtmlImageMarkup(raw)) {
    const widget = new HtmlImageWidget(raw, node.from, node.to, true);
    if (isEditing(state, node.from, node.to, hasFocus, true)) {
      ranges.push(
        Decoration.widget({
          block: true,
          side: 1,
          widget
        }).range(node.to)
      );
      return;
    }

    ranges.push(
      Decoration.replace({
        block: true,
        widget
      }).range(node.from, node.to)
    );
    return;
  }

  if (isEditing(state, node.from, node.to, hasFocus)) {
    return;
  }

  ranges.push(
    Decoration.replace({
      block: true,
      widget: new HtmlBlockWidget(raw, node.from)
    }).range(node.from, node.to)
  );
}

function shouldRevealBlockRaw(state: EditorState, from: number, to: number, hasFocus: boolean): boolean {
  if (isEditing(state, from, to, hasFocus)) {
    return true;
  }

  if (!hasFocus || !state.selection.main.empty) {
    return false;
  }

  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  const startLine = state.doc.lineAt(from).number;
  const endLine = state.doc.lineAt(to).number;
  return cursorLine >= startLine - 1 && cursorLine <= endLine + 1;
}

function parseCodeBlock(state: EditorState, node: SyntaxNodeRef, doc: string): CodeBlock {
  const children = childNodes(node);
  const info = children.find((child) => child.name === 'CodeInfo');
  const codeText = children.find((child) => child.name === 'CodeText');
  const openingLine = state.doc.lineAt(node.from);
  const closingLine = state.doc.lineAt(Math.max(node.from, node.to));
  const lang = info ? doc.slice(info.from, info.to).trim().split(/\s+/, 1)[0].toLowerCase() : '';
  const code = codeText ? doc.slice(codeText.from, codeText.to) : '';
  const normalizedLang = lang || 'text';

  return {
    code,
    lang: normalizedLang,
    id: hashString(`${normalizedLang}\0${code}`),
    codeFrom: codeText ? codeText.from : openingLine.to,
    codeTo: codeText ? codeText.to : openingLine.to,
    openingLineFrom: openingLine.from,
    openingLineTo: openingLine.to,
    closingLineFrom: closingLine.from,
    closingLineTo: closingLine.to
  };
}

function collapseActiveFencedCode(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const range = findFencedCodeAt(view.state, selection.head);
  if (!range) {
    return false;
  }

  const position = range.to < view.state.doc.length
    ? Math.min(view.state.doc.length, range.to + 1)
    : Math.max(0, range.from - 1);

  if (position >= range.from && position <= range.to) {
    return false;
  }

  const cursor = EditorSelection.cursor(position);
  view.dispatch({
    selection: EditorSelection.create([cursor]),
    effects: EditorView.scrollIntoView(cursor, { y: 'nearest', yMargin: 32 }),
    scrollIntoView: true
  });
  return true;
}

function findFencedCodeAt(state: EditorState, position: number): RawRange | undefined {
  let result: RawRange | undefined;

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'FencedCode' && position >= node.from && position <= node.to) {
        result = { from: node.from, to: node.to };
        return false;
      }

      return result === undefined;
    }
  });

  return result;
}

function findMermaidCodeRangeAt(state: EditorState, position: number): RawRange | undefined {
  const doc = state.doc.toString();
  let result: RawRange | undefined;

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'FencedCode' && position >= node.from && position <= node.to) {
        const parsed = parseCodeBlock(state, node, doc);
        if (parsed.lang === 'mermaid') {
          result = { from: node.from, to: node.to };
        }
        return false;
      }

      return result === undefined;
    }
  });

  return result;
}

function addCodeLineDecorations(
  ranges: Range<Decoration>[],
  state: EditorState,
  parsed: CodeBlock,
  editing: boolean
): void {
  if (!editing) {
    const startLine = state.doc.lineAt(parsed.codeFrom);
    const endLine = state.doc.lineAt(Math.max(parsed.codeFrom, parsed.codeTo - 1));

    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
      ranges.push(Decoration.line({ class: 'mw-code-line' }).range(state.doc.line(lineNumber).from));
    }
    return;
  }

  const startLine = state.doc.lineAt(parsed.openingLineFrom);
  const endLine = state.doc.lineAt(Math.max(parsed.openingLineFrom, parsed.closingLineTo));
  const bodyStartLine = state.doc.lineAt(parsed.codeFrom);
  const bodyEndLine = state.doc.lineAt(Math.max(parsed.codeFrom, parsed.codeTo - 1));

  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const classes = ['mw-code-line', 'mw-code-line-active'];

    if (line.from === parsed.openingLineFrom) {
      classes.push('mw-code-fence-line', 'mw-code-block-start');
    }

    if (line.from === parsed.closingLineFrom) {
      classes.push('mw-code-fence-line', 'mw-code-block-end');
    }

    const isBodyLine =
      line.number >= bodyStartLine.number &&
      line.number <= bodyEndLine.number &&
      line.from !== parsed.openingLineFrom &&
      line.from !== parsed.closingLineFrom;

    if (isBodyLine) {
      classes.push('mw-code-body-line');

      if (line.number === bodyStartLine.number) {
        classes.push('mw-code-body-start');
      }

      if (line.number === bodyEndLine.number) {
        classes.push('mw-code-body-end');
      }
    }

    ranges.push(Decoration.line({ class: classes.join(' ') }).range(line.from));
  }

  ranges.push(Decoration.mark({ class: 'mw-code-fence-marker' }).range(parsed.openingLineFrom, parsed.openingLineTo));
  ranges.push(Decoration.mark({ class: 'mw-code-fence-marker' }).range(parsed.closingLineFrom, parsed.closingLineTo));
}

function addCodeTokenDecorations(
  ranges: Range<Decoration>[],
  parsed: CodeBlock,
  highlight: HighlightedCodeBlock | undefined
): void {
  if (!highlight) {
    return;
  }

  for (const token of highlight.tokens) {
    const from = parsed.codeFrom + token.from;
    const to = Math.min(parsed.codeTo, parsed.codeFrom + token.to);
    if (to <= from) {
      continue;
    }

    ranges.push(
      Decoration.mark({
        class: `mw-shiki-token ${token.className}`
      }).range(from, to)
    );
  }
}

function parseTable(raw: string): ParsedTable | undefined {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return undefined;
  }

  const headers = splitTableRow(lines[0]);
  const delimiterCells = splitTableRow(lines[1]);
  if (headers.length === 0 || delimiterCells.length === 0) {
    return undefined;
  }

  return {
    headers,
    alignments: delimiterCells.map(parseAlignment),
    rows: lines.slice(2).map(splitTableRow)
  };
}

function splitTableRow(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  let escaped = false;

  for (const character of trimmed) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function parseAlignment(cell: string): TableAlignment {
  const normalized = cell.trim();
  const left = normalized.startsWith(':');
  const right = normalized.endsWith(':');

  if (left && right) {
    return 'center';
  }

  if (left) {
    return 'left';
  }

  if (right) {
    return 'right';
  }

  return undefined;
}

function collectExcludedRanges(state: EditorState, doc: string): RawRange[] {
  const ranges: RawRange[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (
        node.name === 'FencedCode' ||
        node.name === 'InlineCode' ||
        node.name === 'Link' ||
        node.name === 'Autolink' ||
        node.name === 'HTMLBlock'
      ) {
        ranges.push({ from: node.from, to: node.to });
        return false;
      }

      return true;
    }
  });

  const imagePattern = /!\[[^\]\n]*\]\([^\)\n]*\)/g;
  let match: RegExpExecArray | null;
  while ((match = imagePattern.exec(doc)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length });
  }

  return ranges;
}

function findDisplayMathRanges(state: EditorState, doc: string, excludedRanges: RawRange[]): MathRange[] {
  const ranges: MathRange[] = [];
  let lineNumber = 1;

  while (lineNumber <= state.doc.lines) {
    const line = state.doc.line(lineNumber);
    const trimmed = line.text.trim();

    if (isSingleLineDisplayMath(trimmed) && !rangeOverlaps(line.from, line.to, excludedRanges)) {
      const start = line.text.indexOf('$$');
      const end = line.text.lastIndexOf('$$');
      ranges.push({
        from: line.from + start,
        to: line.from + end + 2,
        raw: doc.slice(line.from + start, line.from + end + 2),
        tex: line.text.slice(start + 2, end).trim()
      });
      lineNumber += 1;
      continue;
    }

    if (trimmed !== '$$' || rangeOverlaps(line.from, line.to, excludedRanges)) {
      lineNumber += 1;
      continue;
    }

    for (let closingLineNumber = lineNumber + 1; closingLineNumber <= state.doc.lines; closingLineNumber += 1) {
      const closingLine = state.doc.line(closingLineNumber);
      if (closingLine.text.trim() !== '$$') {
        continue;
      }

      const from = line.from;
      const to = closingLine.to;
      if (!rangeOverlaps(from, to, excludedRanges)) {
        ranges.push({
          from,
          to,
          raw: doc.slice(from, to),
          tex: doc.slice(line.to + 1, closingLine.from).trim()
        });
      }
      lineNumber = closingLineNumber;
      break;
    }

    lineNumber += 1;
  }

  return ranges;
}

function isSingleLineDisplayMath(trimmedLine: string): boolean {
  return trimmedLine.startsWith('$$') && trimmedLine.endsWith('$$') && trimmedLine.length > 4;
}

function findInlineMathRanges(state: EditorState, doc: string, excludedRanges: RawRange[]): MathRange[] {
  const ranges: MathRange[] = [];

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    let offset = 0;

    while (offset < line.text.length) {
      const open = line.text.indexOf('$', offset);
      if (open < 0) {
        break;
      }

      const from = line.from + open;
      if (!isInlineMathOpening(line.text, open) || rangeOverlaps(from, from + 1, excludedRanges)) {
        offset = open + 1;
        continue;
      }

      const close = findClosingDollar(line.text, open + 1);
      if (close < 0) {
        break;
      }

      const to = line.from + close + 1;
      if (!rangeOverlaps(from, to, excludedRanges)) {
        ranges.push({
          from,
          to,
          raw: doc.slice(from, to),
          tex: line.text.slice(open + 1, close)
        });
      }

      offset = close + 1;
    }
  }

  return ranges;
}

function isInlineMathOpening(line: string, index: number): boolean {
  const next = line[index + 1] ?? '';
  if (line[index + 1] === '$' || isEscaped(line, index) || next.trim() === '' || /\d/.test(next)) {
    return false;
  }

  return true;
}

function findClosingDollar(line: string, from: number): number {
  for (let index = from; index < line.length; index += 1) {
    if (line[index] !== '$' || line[index + 1] === '$' || isEscaped(line, index)) {
      continue;
    }

    const previous = line[index - 1] ?? '';
    if (previous.trim() === '') {
      continue;
    }

    return index;
  }

  return -1;
}

function buildInlineHtmlDecorations(
  state: EditorState,
  hasFocus: boolean,
  excludedRanges: RawRange[]
): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];

  for (const htmlRange of findInlineHtmlRanges(state, excludedRanges)) {
    if (htmlRange.tag === 'img' && htmlRange.allowed) {
      const widget = new HtmlImageWidget(state.sliceDoc(htmlRange.from, htmlRange.to), htmlRange.from, htmlRange.to);
      if (isEditing(state, htmlRange.from, htmlRange.to, hasFocus, true)) {
        ranges.push(
          Decoration.widget({
            side: 1,
            widget: new HtmlImageWidget(state.sliceDoc(htmlRange.from, htmlRange.to), htmlRange.from, htmlRange.to, true)
          }).range(htmlRange.to)
        );
        continue;
      }

      ranges.push(
        Decoration.replace({
          widget
        }).range(htmlRange.from, htmlRange.to)
      );
      continue;
    }

    if (isEditing(state, htmlRange.from, htmlRange.to, hasFocus)) {
      continue;
    }

    if (!htmlRange.allowed) {
      ranges.push(Decoration.replace({}).range(htmlRange.from, htmlRange.to));
      continue;
    }

    ranges.push(Decoration.replace({}).range(htmlRange.openFrom, htmlRange.openTo));
    ranges.push(Decoration.replace({}).range(htmlRange.closeFrom, htmlRange.closeTo));
    ranges.push(
      Decoration.mark({
        class: htmlClassByTag.get(htmlRange.tag) ?? 'mw-html-inline'
      }).range(htmlRange.contentFrom, htmlRange.contentTo)
    );
  }

  return ranges;
}

function findInlineHtmlRanges(state: EditorState, excludedRanges: RawRange[]): InlineHtmlRange[] {
  const ranges: InlineHtmlRange[] = [];
  const pattern = /<([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?>([^<>]*)<\/\1>/g;
  const standaloneImagePattern = /<img(?:\s[^<>]*)?\/?>/gi;

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    standaloneImagePattern.lastIndex = 0;

    while ((match = pattern.exec(line.text)) !== null) {
      const tag = match[1].toLowerCase();
      const from = line.from + match.index;
      const to = from + match[0].length;
      if (rangeOverlaps(from, to, excludedRanges)) {
        continue;
      }

      const openLength = match[0].indexOf('>') + 1;
      const closeLength = tag.length + 3;
      const closeFrom = to - closeLength;
      const sanitized = sanitizeHtml(match[0]).trim();
      ranges.push({
        tag,
        from,
        to,
        openFrom: from,
        openTo: from + openLength,
        closeFrom,
        closeTo: to,
        contentFrom: from + openLength,
        contentTo: closeFrom,
        allowed: sanitized.length > 0 && (htmlClassByTag.has(tag) || tag === 'img')
      });
    }

    while ((match = standaloneImagePattern.exec(line.text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      if (rangeOverlaps(from, to, excludedRanges) || rangeOverlaps(from, to, ranges)) {
        continue;
      }

      ranges.push({
        tag: 'img',
        from,
        to,
        openFrom: from,
        openTo: to,
        closeFrom: to,
        closeTo: to,
        contentFrom: to,
        contentTo: to,
        allowed: sanitizeHtml(match[0]).trim().length > 0
      });
    }
  }

  return ranges;
}

function isEscaped(value: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function isBlockWidgetEffect(effect: StateEffect<unknown>): boolean {
  return (
    effect.is(setBlockWidgetFocus) ||
    effect.is(toggleTableRaw) ||
    effect.is(toggleFrontmatterExpanded) ||
    effect.is(collapseFrontmatter) ||
    effect.is(setSelectionRevealState) ||
    effect.is(setCodeHighlight)
  );
}

function childNodes(node: SyntaxNodeRef): Array<{ from: number; to: number; name: string }> {
  const children: Array<{ from: number; to: number; name: string }> = [];
  const cursor = node.node.cursor();

  if (!cursor.firstChild()) {
    return children;
  }

  do {
    children.push({
      from: cursor.from,
      to: cursor.to,
      name: cursor.name
    });
  } while (cursor.nextSibling());

  return children;
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}
