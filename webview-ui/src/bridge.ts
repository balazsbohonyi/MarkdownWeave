export type PersistedState = {
  scrollTop: number;
  cursorOffset: number;
};

export type HostInitMessage = {
  type: 'init';
  content: string;
  version: number;
  source: 'initial';
  eol: '\n' | '\r\n';
  indentation: EditorIndentation;
};

export type HostUpdateMessage = {
  type: 'update';
  content: string;
  version: number;
  source: 'extension';
  eol: '\n' | '\r\n';
  indentation: EditorIndentation;
};

export type HostImageUriMessage = {
  type: 'imageUri';
  requestId: number;
  src: string;
  uri?: string;
};

export type HighlightedCodeBlock = {
  id: string;
  html: string;
  css: string;
  lang: string;
  tokens: HighlightedCodeToken[];
};

export type HighlightedCodeToken = {
  from: number;
  to: number;
  className: string;
};

export type EditorIndentation = {
  insertSpaces: boolean;
  tabSize: number;
};

export type HostHighlightedCodeBlocksMessage = {
  type: 'highlightedCodeBlocks';
  results: HighlightedCodeBlock[];
};

export type WikiLinkStatus = {
  target: string;
  exists: boolean;
  uri?: string;
};

export type HostWikiLinkStatusesMessage = {
  type: 'wikiLinkStatuses';
  results: WikiLinkStatus[];
};

export type HostClearWikiLinkCacheMessage = {
  type: 'clearWikiLinkCache';
};

export type HostScrollToHeadingMessage = {
  type: 'scrollToHeading';
  heading: string;
};

export type HostImageInsertedMessage = {
  type: 'imageInserted';
  markdownText: string;
};

export type HostInsertMarkdownMessage = {
  type: 'insertMarkdown';
  requestId: number;
  text: string;
};

export type HostRunCommandMessage = {
  type: 'runCommand';
  command: string;
};

export type HostMessage =
  | HostInitMessage
  | HostUpdateMessage
  | HostImageUriMessage
  | HostHighlightedCodeBlocksMessage
  | HostWikiLinkStatusesMessage
  | HostClearWikiLinkCacheMessage
  | HostScrollToHeadingMessage
  | HostImageInsertedMessage
  | HostInsertMarkdownMessage
  | HostRunCommandMessage;

export type WebviewEditChange = {
  from: number;
  to: number;
  insert: string;
  deleted: string;
};

export type WebviewPasteImageMessage = {
  type: 'pasteImage';
  data: string;
  mimeType: string;
  filename?: string;
};

export type WebviewPasteImagesBatchMessage = {
  type: 'pasteImagesBatch';
  images: Array<{
    data: string;
    mimeType: string;
    filename?: string;
  }>;
};

export type WebviewDropFileMessage = {
  type: 'dropFile';
  requestId: number;
  filePath: string;
  fileName: string;
  mimeType: string;
};

type VsCodeApi = {
  postMessage(message: unknown): void;
  getState(): PersistedState | undefined;
  setState(state: PersistedState): void;
};

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
type PendingImageUriRequest = {
  requestId: number;
  callbacks: Array<(uri: string | undefined) => void>;
};

const imageUriHandlers = new Map<number, PendingImageUriRequest>();
const imageUriCache = new Map<string, string | undefined>();
const pendingImageUriRequests = new Map<string, PendingImageUriRequest>();
let nextImageRequestId = 1;
const codeHighlightCallbacks = new Map<string, Array<(result: HighlightedCodeBlock) => void>>();
const pendingCodeHighlightRequests = new Map<string, { id: string; code: string; lang: string }>();
let codeHighlightBatchTimer: number | undefined;
const wikiLinkStatusCache = new Map<string, WikiLinkStatus>();
const pendingWikiLinkTargets = new Set<string>();
let wikiLinkBatchCallbacks: Array<(results: WikiLinkStatus[]) => void> = [];
let wikiLinkBatchTimer: number | undefined;
let wikiLinkClearCallback: (() => void) | undefined;

export function postReady(): void {
  vscode.postMessage({ type: 'ready' });
}

export function postEdit(changes: WebviewEditChange[], before: string, after: string): void {
  if (changes.length === 0) {
    return;
  }

  vscode.postMessage({ type: 'edit', changes, before, after, source: 'webview' });
}

export function postOpenLink(url: string): void {
  vscode.postMessage({ type: 'openLink', url });
}

export function resolveImageUri(src: string, callback: (uri: string | undefined) => void): void {
  if (imageUriCache.has(src)) {
    queueMicrotask(() => callback(imageUriCache.get(src)));
    return;
  }

  const pending = pendingImageUriRequests.get(src);
  if (pending) {
    pending.callbacks.push(callback);
    return;
  }

  const requestId = nextImageRequestId++;
  const request = { requestId, callbacks: [callback] };
  imageUriHandlers.set(requestId, request);
  pendingImageUriRequests.set(src, request);
  vscode.postMessage({ type: 'resolveImageUri', requestId, src });
}

export function requestCodeHighlight(
  request: { id: string; code: string; lang: string },
  callback: (result: HighlightedCodeBlock) => void
): void {
  const callbacks = codeHighlightCallbacks.get(request.id) ?? [];
  callbacks.push(callback);
  codeHighlightCallbacks.set(request.id, callbacks);
  pendingCodeHighlightRequests.set(request.id, request);

  if (codeHighlightBatchTimer) {
    clearTimeout(codeHighlightBatchTimer);
  }

  codeHighlightBatchTimer = window.setTimeout(() => {
    codeHighlightBatchTimer = undefined;
    const requests = Array.from(pendingCodeHighlightRequests.values());
    pendingCodeHighlightRequests.clear();

    if (requests.length > 0) {
      vscode.postMessage({ type: 'highlightCodeBlocks', requests });
    }
  }, 50);
}

export function checkWikiLinks(targets: string[], onResults: (results: WikiLinkStatus[]) => void): void {
  const uncached = targets.filter((t) => !wikiLinkStatusCache.has(t));
  if (uncached.length === 0) {
    return;
  }

  wikiLinkBatchCallbacks.push(onResults);
  uncached.forEach((t) => pendingWikiLinkTargets.add(t));

  clearTimeout(wikiLinkBatchTimer);
  wikiLinkBatchTimer = window.setTimeout(() => {
    wikiLinkBatchTimer = undefined;
    const batch = Array.from(pendingWikiLinkTargets);
    pendingWikiLinkTargets.clear();
    if (batch.length > 0) {
      vscode.postMessage({ type: 'checkWikiLinks', targets: batch });
    }
  }, 50);
}

export function requestWikiLinkStatus(target: string): WikiLinkStatus | undefined {
  return wikiLinkStatusCache.get(target);
}

export function setWikiLinkClearCallback(callback: (() => void) | undefined): void {
  wikiLinkClearCallback = callback;
}

export function postOpenWikiLink(uri: string, heading?: string): void {
  vscode.postMessage({ type: 'openWikiLink', uri, heading });
}

export function postPasteImage(data: string, mimeType: string, filename?: string): void {
  vscode.postMessage({ type: 'pasteImage', data, mimeType, filename });
}

export function postPasteImagesBatch(
  images: Array<{ data: string; mimeType: string; filename?: string }>
): void {
  vscode.postMessage({ type: 'pasteImagesBatch', images });
}

let nextDropRequestId = 1;
const dropRequestCallbacks = new Map<number, (text: string) => void>();

export function postDropFile(
  filePath: string,
  fileName: string,
  mimeType: string,
  onInsert: (text: string) => void
): void {
  const requestId = nextDropRequestId++;
  dropRequestCallbacks.set(requestId, onInsert);
  vscode.postMessage({ type: 'dropFile', requestId, filePath, fileName, mimeType });
}

export function getPersistedState(): PersistedState | undefined {
  return vscode.getState();
}

export function setPersistedState(state: PersistedState): void {
  vscode.setState(state);
}

export function handleBridgeMessage(message: HostMessage): boolean {
  if (message.type === 'imageUri') {
    const request = imageUriHandlers.get(message.requestId);
    imageUriHandlers.delete(message.requestId);
    pendingImageUriRequests.delete(message.src);
    imageUriCache.set(message.src, message.uri);
    request?.callbacks.forEach((callback) => callback(message.uri));
    return true;
  }

  if (message.type === 'highlightedCodeBlocks') {
    message.results.forEach((result) => {
      const callbacks = codeHighlightCallbacks.get(result.id);
      codeHighlightCallbacks.delete(result.id);
      callbacks?.forEach((callback) => callback(result));
    });
    return true;
  }

  if (message.type === 'wikiLinkStatuses') {
    message.results.forEach((r) => wikiLinkStatusCache.set(r.target, r));
    const callbacks = wikiLinkBatchCallbacks.splice(0);
    callbacks.forEach((cb) => cb(message.results));
    return true;
  }

  if (message.type === 'clearWikiLinkCache') {
    wikiLinkStatusCache.clear();
    pendingWikiLinkTargets.clear();
    clearTimeout(wikiLinkBatchTimer);
    wikiLinkBatchTimer = undefined;
    wikiLinkBatchCallbacks.length = 0;
    wikiLinkClearCallback?.();
    return true;
  }

  if (message.type === 'insertMarkdown') {
    const callback = dropRequestCallbacks.get(message.requestId);
    dropRequestCallbacks.delete(message.requestId);
    if (callback) {
      callback(message.text);
    }
    return true;
  }

  return false;
}
