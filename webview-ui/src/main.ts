import './main.css';

type VsCodeApi = {
  postMessage(message: unknown): void;
  getState(): PersistedState | undefined;
  setState(state: PersistedState): void;
};

type PersistedState = {
  scrollTop: number;
  cursorOffset: number;
};

type HostInitMessage = {
  type: 'init';
  content: string;
  version: number;
  source: 'initial';
};

type HostUpdateMessage = {
  type: 'update';
  content: string;
  version: number;
  source: 'extension';
};

type HostMessage = HostInitMessage | HostUpdateMessage;

declare function acquireVsCodeApi(): VsCodeApi;

const EDIT_DEBOUNCE_MS = 200;
const STATE_DEBOUNCE_MS = 200;

const vscode = acquireVsCodeApi();
const editorElement = document.getElementById('editor') as HTMLTextAreaElement | null;
const status = document.getElementById('status');
const initialState = vscode.getState();

let syncedContent = '';
let pendingContent: string | undefined;
let editTimer: number | undefined;
let stateTimer: number | undefined;

if (!editorElement) {
  throw new Error('MarkdownWeave editor mount point was not found.');
}

const editor = editorElement;

console.log('webview loaded');

window.addEventListener('load', () => {
  vscode.postMessage({ type: 'ready' });
});

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;

  if (message.type === 'init') {
    setDocumentContent(message.content);
    restoreState();
    setStatus(`Document loaded (${message.content.length} characters)`);
    return;
  }

  if (message.type === 'update') {
    if (message.content === editor.value) {
      syncedContent = message.content;
      return;
    }

    setDocumentContent(message.content);
    setStatus(`Document updated (${message.content.length} characters)`);
  }
});

editor.addEventListener('input', () => {
  pendingContent = editor.value;
  queueEdit();
  queueStateSave();
});

editor.addEventListener('scroll', queueStateSave);
editor.addEventListener('keyup', queueStateSave);
editor.addEventListener('click', queueStateSave);
editor.addEventListener('select', queueStateSave);

function setDocumentContent(content: string): void {
  syncedContent = content;
  pendingContent = undefined;

  if (editTimer) {
    clearTimeout(editTimer);
    editTimer = undefined;
  }

  editor.value = content;
}

function queueEdit(): void {
  if (editTimer) {
    clearTimeout(editTimer);
  }

  editTimer = window.setTimeout(() => {
    editTimer = undefined;

    if (pendingContent === undefined || pendingContent === syncedContent) {
      return;
    }

    const nextContent = pendingContent;
    const replacement = getReplacement(syncedContent, nextContent);

    vscode.postMessage({
      type: 'edit',
      from: replacement.from,
      to: replacement.to,
      insert: replacement.insert,
      source: 'webview'
    });

    syncedContent = nextContent;
    pendingContent = undefined;
  }, EDIT_DEBOUNCE_MS);
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

function queueStateSave(): void {
  if (stateTimer) {
    clearTimeout(stateTimer);
  }

  stateTimer = window.setTimeout(() => {
    stateTimer = undefined;
    vscode.setState({
      scrollTop: editor.scrollTop,
      cursorOffset: editor.selectionStart
    });
  }, STATE_DEBOUNCE_MS);
}

function restoreState(): void {
  if (!initialState) {
    return;
  }

  requestAnimationFrame(() => {
    const cursorOffset = Math.min(initialState.cursorOffset, editor.value.length);
    editor.focus();
    editor.setSelectionRange(cursorOffset, cursorOffset);
    editor.scrollTop = initialState.scrollTop;
  });
}

function setStatus(message: string): void {
  if (status) {
    status.textContent = message;
  }
}
