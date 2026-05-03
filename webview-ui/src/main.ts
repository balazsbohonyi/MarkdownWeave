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
    editor = createMarkdownEditor(editorMount, message.content, message.indentation);
    editor.restoreState(getPersistedState());
    setStatus(`Document loaded (${message.content.length} characters)`);
    return;
  }

  if (message.type === 'update') {
    editor?.setIndentation(message.indentation);
    editor?.setContent(message.content);
    setStatus(`Document updated (${message.content.length} characters)`);
    return;
  }

  if (message.type === 'scrollToHeading') {
    editor?.scrollToHeading(message.heading);
  }
});

window.addEventListener('beforeunload', () => {
  editor?.saveState();
  editor?.destroy();
});

window.addEventListener(
  'keydown',
  (event) => {
    if (!editor || event.altKey || event.shiftKey || (!event.ctrlKey && !event.metaKey)) {
      return;
    }

    if (event.key.toLowerCase() !== 'a') {
      return;
    }

    event.preventDefault();
    editor.selectAll();
  },
  true
);

window.addEventListener(
  'copy',
  (event) => {
    const selectedText = editor?.getSelectedText();
    if (!selectedText) {
      return;
    }

    event.clipboardData?.setData('text/plain', selectedText);
    event.preventDefault();
  },
  true
);

function setStatus(message: string): void {
  if (status) {
    status.textContent = message;
  }
}
