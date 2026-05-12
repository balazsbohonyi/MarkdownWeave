import './main.css';
import {
  getPersistedState,
  handleBridgeMessage,
  postHeadings,
  postCursorLine,
  postReady,
  type HostMessage
} from './bridge';
import { createMarkdownEditor, type MarkdownEditor } from './editor';
import { extractHeadings, type HeadingItem } from './headings';
import { Breadcrumb } from './breadcrumb';
import { initTheme, observeThemeChanges, setThemeOverride } from './themes/themeManager';
import { applyMarkdownWeaveSettings } from './settings';

// Apply theme before creating the editor so CSS variables are correct on first paint
initTheme();

const app = document.getElementById('app');
const editorMount = document.getElementById('editor');
const breadcrumbContainer = document.getElementById('breadcrumb');
const status = document.getElementById('status');

let editor: MarkdownEditor | undefined;
let breadcrumb: Breadcrumb | undefined;
let currentHeadings: HeadingItem[] = [];
let currentCursorLine = 1;
let themeObserverStarted = false;

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

  if (message.type === 'settings') {
    applyMarkdownWeaveSettings(message.settings);
    setThemeOverride(message.settings.theme);
    editor?.applySettings();
    return;
  }

  if (message.type === 'init') {
    editorMount.textContent = '';
    breadcrumb?.destroy();
    breadcrumb = undefined;

    editor = createMarkdownEditor(
      editorMount,
      message.content,
      message.indentation,
      (headings) => {
        currentHeadings = headings;
        breadcrumb?.update(headings, currentCursorLine);
      },
      (line) => {
        currentCursorLine = line;
        breadcrumb?.update(currentHeadings, line);
      }
    );

    editor.restoreState(getPersistedState());

    // Extract and send initial headings immediately after load
    const initialHeadings = extractHeadings(editor.view.state);
    currentHeadings = initialHeadings;
    postHeadings(initialHeadings);

    // Send initial cursor line
    const initialLine = editor.view.state.doc.lineAt(editor.view.state.selection.main.head).number;
    currentCursorLine = initialLine;
    postCursorLine(initialLine);

    if (breadcrumbContainer) {
      breadcrumb = new Breadcrumb(breadcrumbContainer, editor.view);
      breadcrumb.update(initialHeadings, initialLine);
    }

    setStatus(`Document loaded (${message.content.length} characters)`);

    if (!themeObserverStarted) {
      observeThemeChanges();
      themeObserverStarted = true;
    }
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
    return;
  }

  if (message.type === 'scrollToLine') {
    editor?.scrollToLine(message.line);
    return;
  }

  if (message.type === 'syncScrollToLine') {
    editor?.syncScrollToLine(message.line);
    return;
  }

  if (message.type === 'imageInserted') {
    editor?.insertAtCursor(message.markdownText);
    return;
  }

  if (message.type === 'runCommand') {
    editor?.runCommand(message.command);
  }
});

window.addEventListener('beforeunload', () => {
  editor?.saveState();
  editor?.destroy();
  breadcrumb?.destroy();
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
