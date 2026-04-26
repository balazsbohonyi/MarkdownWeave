import './main.css';
import {
  getPersistedState,
  handleBridgeMessage,
  postReady,
  type HostMessage
} from './bridge';
import { createMarkdownEditor, type MarkdownEditor } from './editor';

const app = document.getElementById('app');
const editorMount = document.getElementById('editor');
const status = document.getElementById('status');

let editor: MarkdownEditor | undefined;

if (!app || !editorMount) {
  throw new Error('MarkdownWeave editor mount point was not found.');
}

window.addEventListener('load', () => {
  postReady();
});

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;

  if (handleBridgeMessage(message)) {
    return;
  }

  if (message.type === 'init') {
    editorMount.textContent = '';
    editor = createMarkdownEditor(editorMount, message.content);
    editor.restoreState(getPersistedState());
    setStatus(`Document loaded (${message.content.length} characters)`);
    return;
  }

  if (message.type === 'update') {
    editor?.setContent(message.content);
    setStatus(`Document updated (${message.content.length} characters)`);
  }
});

window.addEventListener('beforeunload', () => {
  editor?.saveState();
  editor?.destroy();
});

function setStatus(message: string): void {
  if (status) {
    status.textContent = message;
  }
}
