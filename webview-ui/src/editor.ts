import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { Annotation, Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { postEdit, setPersistedState, type PersistedState, type WebviewEditChange } from './bridge';
import { linkClickExtension, markdownDecorations } from './decorations';

const STATE_DEBOUNCE_MS = 200;

const externalUpdate = Annotation.define<boolean>();
const themeCompartment = new Compartment();
const tabSize = 4;

export type MarkdownEditor = {
  view: EditorView;
  setContent(content: string): void;
  restoreState(state: PersistedState | undefined): void;
  saveState(): void;
  selectAll(): void;
  getSelectedText(): string;
  destroy(): void;
};

export function createMarkdownEditor(parent: HTMLElement, initialContent: string): MarkdownEditor {
  let stateTimer: number | undefined;

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initialContent,
      extensions: [
        markdown({ extensions: [GFM] }),
        history(),
        keymap.of([
          { key: 'Tab', run: indentMarkdownListItem },
          { key: 'Shift-Tab', run: outdentMarkdownListItem },
          indentWithTab,
          ...markdownKeymap,
          ...defaultKeymap,
          ...historyKeymap
        ]),
        drawSelection(),
        dropCursor(),
        themeCompartment.of(markdownWeaveTheme(currentThemeKind())),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          forwardDocumentChanges(update);

          if (update.docChanged || update.selectionSet || update.viewportChanged) {
            queueStateSave();
          }
        }),
        markdownDecorations,
        linkClickExtension
      ]
    })
  });

  console.log('Markdown syntax tree:', syntaxTree(view.state).toString());

  const observer = new MutationObserver(() => {
    view.dispatch({
      effects: themeCompartment.reconfigure(markdownWeaveTheme(currentThemeKind()))
    });
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  function forwardDocumentChanges(update: ViewUpdate): void {
    if (!update.docChanged || update.transactions.some((transaction) => transaction.annotation(externalUpdate))) {
      return;
    }

    const before = update.startState.doc.toString();
    const after = update.state.doc.toString();
    const changes: WebviewEditChange[] = [];
    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      changes.push({
        from: fromA,
        to: toA,
        insert: inserted.toString(),
        deleted: before.slice(fromA, toA)
      });
    });

    postEdit(changes, before, after);
  }

  function setContent(content: string): void {
    const current = view.state.doc.toString();
    if (content === current) {
      return;
    }

    const replacement = getReplacement(current, content);
    const changes = view.state.changes({
      from: replacement.from,
      to: replacement.to,
      insert: replacement.insert
    });

    view.dispatch({
      changes,
      selection: view.state.selection.map(changes),
      annotations: externalUpdate.of(true)
    });
  }

  function restoreState(state: PersistedState | undefined): void {
    if (!state) {
      return;
    }

    requestAnimationFrame(() => {
      const cursorOffset = Math.min(state.cursorOffset, view.state.doc.length);
      view.focus();
      view.dispatch({
        selection: EditorSelection.cursor(cursorOffset),
        scrollIntoView: true,
        annotations: externalUpdate.of(true)
      });
      view.scrollDOM.scrollTop = state.scrollTop;
    });
  }

  function queueStateSave(): void {
    if (stateTimer) {
      clearTimeout(stateTimer);
    }

    stateTimer = window.setTimeout(() => {
      stateTimer = undefined;
      saveState();
    }, STATE_DEBOUNCE_MS);
  }

  function saveState(): void {
    setPersistedState({
      scrollTop: view.scrollDOM.scrollTop,
      cursorOffset: view.state.selection.main.head
    });
  }

  return {
    view,
    setContent,
    restoreState,
    saveState,
    selectAll(): void {
      view.focus();
      view.dispatch({
        selection: EditorSelection.single(0, view.state.doc.length),
        scrollIntoView: true
      });
    },
    getSelectedText(): string {
      return view.state.selection.ranges
        .filter((range) => !range.empty)
        .map((range) => view.state.sliceDoc(range.from, range.to))
        .join('\n');
    },
    destroy() {
      if (stateTimer) {
        clearTimeout(stateTimer);
      }

      observer.disconnect();
      view.destroy();
    }
  };
}

type ParsedListLine = {
  lineFrom: number;
  lineNumber: number;
  indent: string;
  indentColumn: number;
  marker: string;
  markerFrom: number;
  markerTo: number;
  ordered: boolean;
  orderedDelimiter: string;
  orderedNumber: number;
};

function indentMarkdownListItem(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  const current = parseListLine(line.text, line.from, line.number);
  if (!current) {
    return false;
  }

  const previous = findPreviousListLine(view.state, line.number - 1);
  if (!previous) {
    return false;
  }

  const nextIndentColumn = previous.indentColumn + previous.marker.length + 1;
  if (nextIndentColumn <= current.indentColumn) {
    return false;
  }

  replaceListLinePrefix(view, current, nextIndentColumn);
  return true;
}

function outdentMarkdownListItem(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  const current = parseListLine(line.text, line.from, line.number);
  if (!current || current.indentColumn === 0) {
    return false;
  }

  const nextIndentColumn = findPreviousListIndentBelow(view.state, line.number - 1, current.indentColumn);
  replaceListLinePrefix(view, current, nextIndentColumn);
  return true;
}

function replaceListLinePrefix(view: EditorView, current: ParsedListLine, nextIndentColumn: number): void {
  const nextIndent = ' '.repeat(nextIndentColumn);
  const nextMarker = current.ordered
    ? `${getNextOrderedNumberAtIndent(view.state, current.lineNumber, nextIndentColumn)}${current.orderedDelimiter}`
    : current.marker;

  view.dispatch({
    changes: {
      from: current.lineFrom,
      to: current.markerTo,
      insert: `${nextIndent}${nextMarker}`
    }
  });
}

function findPreviousListLine(state: EditorState, lineNumber: number): ParsedListLine | undefined {
  for (let currentLineNumber = lineNumber; currentLineNumber >= 1; currentLineNumber -= 1) {
    const line = state.doc.line(currentLineNumber);
    if (line.text.trim().length === 0) {
      return undefined;
    }

    const parsed = parseListLine(line.text, line.from, line.number);
    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

function findPreviousListIndentBelow(state: EditorState, lineNumber: number, indentColumn: number): number {
  for (let currentLineNumber = lineNumber; currentLineNumber >= 1; currentLineNumber -= 1) {
    const line = state.doc.line(currentLineNumber);
    if (line.text.trim().length === 0) {
      return 0;
    }

    const parsed = parseListLine(line.text, line.from, line.number);
    if (parsed && parsed.indentColumn < indentColumn) {
      return parsed.indentColumn;
    }
  }

  return 0;
}

function getNextOrderedNumberAtIndent(state: EditorState, beforeLineNumber: number, indentColumn: number): number {
  for (let currentLineNumber = beforeLineNumber - 1; currentLineNumber >= 1; currentLineNumber -= 1) {
    const line = state.doc.line(currentLineNumber);
    if (line.text.trim().length === 0) {
      break;
    }

    const parsed = parseListLine(line.text, line.from, line.number);
    if (!parsed) {
      continue;
    }

    if (parsed.indentColumn === indentColumn) {
      return parsed.ordered ? parsed.orderedNumber + 1 : 1;
    }

    if (parsed.indentColumn < indentColumn) {
      break;
    }
  }

  return 1;
}

function parseListLine(text: string, lineFrom: number, lineNumber: number): ParsedListLine | undefined {
  const match = /^([ \t]*)(?:(\d+)([.)])|([-+*]))[ \t]+/.exec(text);
  if (!match) {
    return undefined;
  }

  const indent = match[1];
  const orderedNumber = match[2] ? Number(match[2]) : 0;
  const marker = match[2] ? `${match[2]}${match[3]}` : match[4];
  const markerFrom = lineFrom + indent.length;

  return {
    lineFrom,
    lineNumber,
    indent,
    indentColumn: getIndentColumn(indent),
    marker,
    markerFrom,
    markerTo: markerFrom + marker.length,
    ordered: Boolean(match[2]),
    orderedDelimiter: match[3] ?? '.',
    orderedNumber
  };
}

function getIndentColumn(indent: string): number {
  let column = 0;

  for (const character of indent) {
    if (character === '\t') {
      column += tabSize - (column % tabSize);
    } else {
      column += 1;
    }
  }

  return column;
}

function getReplacement(previous: string, next: string): { from: number; to: number; insert: string } {
  let from = 0;

  while (from < previous.length && from < next.length && previous.charCodeAt(from) === next.charCodeAt(from)) {
    from += 1;
  }

  let previousSuffix = previous.length;
  let nextSuffix = next.length;

  while (
    previousSuffix > from &&
    nextSuffix > from &&
    previous.charCodeAt(previousSuffix - 1) === next.charCodeAt(nextSuffix - 1)
  ) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }

  return {
    from,
    to: previousSuffix,
    insert: next.slice(from, nextSuffix)
  };
}

function currentThemeKind(): 'light' | 'dark' | 'high-contrast' {
  if (document.body.classList.contains('vscode-high-contrast')) {
    return 'high-contrast';
  }

  if (document.body.classList.contains('vscode-light')) {
    return 'light';
  }

  return 'dark';
}

function markdownWeaveTheme(themeKind: 'light' | 'dark' | 'high-contrast') {
  const gutterBackground =
    themeKind === 'high-contrast'
      ? 'var(--vscode-editor-background)'
      : 'var(--vscode-editorGutter-background, var(--vscode-editor-background))';

  return EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
      fontFamily: 'var(--vscode-editor-font-family, var(--vscode-font-family))',
      fontSize: 'var(--vscode-editor-font-size, 14px)',
      lineHeight: '1.6'
    },
    '.cm-scroller': {
      fontFamily: 'inherit',
      lineHeight: 'inherit'
    },
    '.cm-content': {
      padding: '16px',
      caretColor: 'var(--vscode-editorCursor-foreground)',
      minHeight: '100%'
    },
    '&.cm-focused, .cm-content, .cm-content:focus, .cm-scroller, .cm-scroller:focus': {
      outline: 'none !important'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--vscode-editorCursor-foreground)'
    },
    '.cm-cursorLayer': {
      zIndex: '20'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--vscode-editor-selectionBackground)'
    },
    '.cm-gutters': {
      backgroundColor: gutterBackground,
      color: 'var(--vscode-editorLineNumber-foreground)',
      borderRightColor: 'var(--vscode-editorWidget-border, transparent)'
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--vscode-editor-lineHighlightBackground, transparent)'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--vscode-editor-lineHighlightBackground, transparent)'
    }
  });
}
