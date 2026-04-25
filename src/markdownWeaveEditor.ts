import * as crypto from 'crypto';
import * as vscode from 'vscode';

type WebviewReadyMessage = {
  type: 'ready';
};

type WebviewEditMessage = {
  type: 'edit';
  from: number;
  to: number;
  insert: string;
  source?: 'webview';
};

type WebviewMessage = WebviewReadyMessage | WebviewEditMessage;

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
    let documentSyncTimer: NodeJS.Timeout | undefined;

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

    const applyWebviewEdit = async (message: WebviewEditMessage): Promise<void> => {
      if (!this.isValidEditMessage(message, document)) {
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const range = new vscode.Range(document.positionAt(message.from), document.positionAt(message.to));

      edit.replace(document.uri, range, message.insert);
      suppressNextSync = true;

      try {
        await vscode.workspace.applyEdit(edit);
      } finally {
        setTimeout(() => {
          suppressNextSync = false;
        }, 0);
      }
    };

    disposables.push(
      webviewPanel.webview.onDidReceiveMessage((message: WebviewMessage) => {
        if (message.type === 'ready') {
          isWebviewReady = true;
          postDocumentContent('init', 'initial');
          return;
        }

        if (message.type === 'edit') {
          void applyWebviewEdit(message);
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
    <textarea id="editor" spellcheck="false" aria-label="Markdown source"></textarea>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private isValidEditMessage(message: WebviewEditMessage, document: vscode.TextDocument): boolean {
    const documentLength = document.getText().length;

    return (
      Number.isInteger(message.from) &&
      Number.isInteger(message.to) &&
      message.from >= 0 &&
      message.to >= message.from &&
      message.to <= documentLength &&
      typeof message.insert === 'string'
    );
  }
}
