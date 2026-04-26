export type PersistedState = {
  scrollTop: number;
  cursorOffset: number;
};

export type HostInitMessage = {
  type: 'init';
  content: string;
  version: number;
  source: 'initial';
};

export type HostUpdateMessage = {
  type: 'update';
  content: string;
  version: number;
  source: 'extension';
};

export type HostImageUriMessage = {
  type: 'imageUri';
  requestId: number;
  src: string;
  uri?: string;
};

export type HostMessage = HostInitMessage | HostUpdateMessage | HostImageUriMessage;

export type WebviewEditChange = {
  from: number;
  to: number;
  insert: string;
  deleted: string;
};

type VsCodeApi = {
  postMessage(message: unknown): void;
  getState(): PersistedState | undefined;
  setState(state: PersistedState): void;
};

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const imageUriHandlers = new Map<number, (uri: string | undefined) => void>();
let nextImageRequestId = 1;

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
  const requestId = nextImageRequestId++;
  imageUriHandlers.set(requestId, callback);
  vscode.postMessage({ type: 'resolveImageUri', requestId, src });
}

export function getPersistedState(): PersistedState | undefined {
  return vscode.getState();
}

export function setPersistedState(state: PersistedState): void {
  vscode.setState(state);
}

export function handleBridgeMessage(message: HostMessage): boolean {
  if (message.type !== 'imageUri') {
    return false;
  }

  const handler = imageUriHandlers.get(message.requestId);
  imageUriHandlers.delete(message.requestId);
  handler?.(message.uri);
  return true;
}
