import * as crypto from 'crypto';
import * as vscode from 'vscode';

type WebviewReadyMessage = {
  type: 'ready';
};

type WebviewEditMessage = {
  type: 'edit';
  changes: WebviewEditChange[];
  before: string;
  after: string;
  source?: 'webview';
};

type WebviewEditChange = {
  from: number;
  to: number;
  insert: string;
  deleted: string;
};

type WebviewOpenLinkMessage = {
  type: 'openLink';
  url: string;
};

type WebviewResolveImageUriMessage = {
  type: 'resolveImageUri';
  requestId: number;
  src: string;
};

type WebviewMessage =
  | WebviewReadyMessage
  | WebviewEditMessage
  | WebviewOpenLinkMessage
  | WebviewResolveImageUriMessage;

const DOCUMENT_SYNC_DEBOUNCE_MS = 200;

export class MarkdownWeaveEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'markdownWeave.editor';

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    const disposables: vscode.Disposable[] = [];
    const workspaceRoots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? [];
    let isWebviewReady = false;
    let suppressNextSync = false;
    let syncSuppressionGeneration = 0;
    let documentSyncTimer: NodeJS.Timeout | undefined;
    let editQueue = Promise.resolve();

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        ...workspaceRoots
      ]
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    const postDocumentContent = (type: 'init' | 'update', source: 'extension' | 'initial'): void => {
      void webviewPanel.webview.postMessage({
        type,
        content: document.getText(),
        version: document.version,
        source
      });
    };

    const queueWebviewEdit = (message: WebviewEditMessage): void => {
      editQueue = editQueue
        .then(() => applyWebviewEdit(message))
        .catch((error: unknown) => {
          console.error('MarkdownWeave failed to apply webview edit.', error);
        });
    };

    const applyWebviewEdit = async (message: WebviewEditMessage): Promise<void> => {
      if (!this.isValidEditMessage(message)) {
        return;
      }

      const currentContent = document.getText();
      if (currentContent === message.after) {
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const replacement = this.getReplacement(currentContent, message.after);
      const range = new vscode.Range(document.positionAt(replacement.from), document.positionAt(replacement.to));

      if (currentContent !== message.before) {
        console.warn('MarkdownWeave applying edit snapshot after host/webview drift.');
      }

      edit.replace(document.uri, range, replacement.insert);

      suppressNextSync = true;
      syncSuppressionGeneration += 1;
      const suppressionGeneration = syncSuppressionGeneration;

      try {
        await vscode.workspace.applyEdit(edit);
      } finally {
        setTimeout(() => {
          if (suppressionGeneration === syncSuppressionGeneration) {
            suppressNextSync = false;
          }
        }, DOCUMENT_SYNC_DEBOUNCE_MS);
      }
    };

    const resolveImageUri = (message: WebviewResolveImageUriMessage): void => {
      const uri = this.getImageWebviewUri(message.src, document, webviewPanel.webview);

      void webviewPanel.webview.postMessage({
        type: 'imageUri',
        requestId: message.requestId,
        src: message.src,
        uri
      });
    };

    disposables.push(
      webviewPanel.webview.onDidReceiveMessage((message: WebviewMessage) => {
        if (message.type === 'ready') {
          isWebviewReady = true;
          postDocumentContent('init', 'initial');
          return;
        }

        if (message.type === 'edit') {
          queueWebviewEdit(message);
          return;
        }

        if (message.type === 'openLink') {
          void this.openLink(message.url);
          return;
        }

        if (message.type === 'resolveImageUri') {
          resolveImageUri(message);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== document.uri.toString()) {
          return;
        }

        if (event.contentChanges.length === 0 || !isWebviewReady) {
          return;
        }

        if (suppressNextSync) {
          return;
        }

        if (documentSyncTimer) {
          clearTimeout(documentSyncTimer);
        }

        documentSyncTimer = setTimeout(() => {
          postDocumentContent('update', 'extension');
        }, DOCUMENT_SYNC_DEBOUNCE_MS);
      }),
      webviewPanel.onDidDispose(() => {
        if (documentSyncTimer) {
          clearTimeout(documentSyncTimer);
        }

        while (disposables.length > 0) {
          disposables.pop()?.dispose();
        }
      })
    );
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css'));

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>MarkdownWeave</title>
</head>
<body>
  <main id="app">
    <div id="status">Markdown Weave loading...</div>
    <div id="editor" aria-label="Markdown source"></div>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async openLink(url: string): Promise<void> {
    try {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch {
      void vscode.window.showWarningMessage(`Markdown Weave could not open link: ${url}`);
    }
  }

  private getImageWebviewUri(src: string, document: vscode.TextDocument, webview: vscode.Webview): string | undefined {
    if (/^(?:https?:|data:)/i.test(src)) {
      return src;
    }

    if (src.trim().length === 0 || src.startsWith('#')) {
      return undefined;
    }

    const [pathWithoutFragment] = src.split('#', 1);
    const [pathWithoutQuery] = pathWithoutFragment.split('?', 1);
    const documentDirectory = vscode.Uri.joinPath(document.uri, '..');
    const imageUri = vscode.Uri.joinPath(documentDirectory, pathWithoutQuery);

    return webview.asWebviewUri(imageUri).toString();
  }

  private isValidEditMessage(message: WebviewEditMessage): boolean {
    return (
      Array.isArray(message.changes) &&
      message.changes.length > 0 &&
      typeof message.before === 'string' &&
      typeof message.after === 'string' &&
      message.changes.every(
        (change) =>
          this.hasValidEditShape(change, message.before.length) &&
          message.before.slice(change.from, change.to) === change.deleted
      )
    );
  }

  private hasValidEditShape(change: WebviewEditChange, documentLength: number): boolean {
    return (
      Number.isInteger(change.from) &&
      Number.isInteger(change.to) &&
      change.from >= 0 &&
      change.to >= change.from &&
      change.to <= documentLength &&
      typeof change.insert === 'string' &&
      typeof change.deleted === 'string'
    );
  }

  private getReplacement(previous: string, next: string): { from: number; to: number; insert: string } {
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
}
