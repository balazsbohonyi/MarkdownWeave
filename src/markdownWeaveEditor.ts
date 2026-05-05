import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { highlight } from './shikiHighlighter';
import type { HeadingItem, OutlineProvider } from './outlineProvider';

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

type EditorIndentation = {
  insertSpaces: boolean;
  tabSize: number;
};

type WebviewHighlightCodeBlocksMessage = {
  type: 'highlightCodeBlocks';
  requests: Array<{
    id: string;
    code: string;
    lang: string;
  }>;
};

type WebviewCheckWikiLinksMessage = {
  type: 'checkWikiLinks';
  targets: string[];
};

type WebviewOpenWikiLinkMessage = {
  type: 'openWikiLink';
  uri: string;
  heading?: string;
};

type WebviewPasteImageMessage = {
  type: 'pasteImage';
  data: string;
  mimeType: string;
  filename?: string;
};

type WebviewPasteImagesBatchMessage = {
  type: 'pasteImagesBatch';
  images: Array<{
    data: string;
    mimeType: string;
    filename?: string;
  }>;
};

type WebviewHeadingsMessage = {
  type: 'headings';
  items: HeadingItem[];
};

type WebviewCursorLineMessage = {
  type: 'cursorLine';
  line: number;
};

type WebviewMessage =
  | WebviewReadyMessage
  | WebviewEditMessage
  | WebviewOpenLinkMessage
  | WebviewResolveImageUriMessage
  | WebviewHighlightCodeBlocksMessage
  | WebviewCheckWikiLinksMessage
  | WebviewOpenWikiLinkMessage
  | WebviewPasteImageMessage
  | WebviewPasteImagesBatchMessage
  | WebviewHeadingsMessage
  | WebviewCursorLineMessage;

const DOCUMENT_SYNC_DEBOUNCE_MS = 200;

export class MarkdownWeaveEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'markdownWeave.editor';

  private static readonly openPanels = new Map<string, vscode.WebviewPanel>();
  private static readonly pendingHeadings = new Map<string, string>();
  private static _activePanel: vscode.WebviewPanel | undefined;

  public static outlineProvider: OutlineProvider | undefined;
  public static treeView: vscode.TreeView<HeadingItem> | undefined;

  public static get activePanel(): vscode.WebviewPanel | undefined {
    return MarkdownWeaveEditorProvider._activePanel;
  }

  public static sendCommandToActive(command: string): void {
    MarkdownWeaveEditorProvider._activePanel?.webview.postMessage({ type: 'runCommand', command });
  }

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    const disposables: vscode.Disposable[] = [];
    const workspaceRoots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? [];
    let isWebviewReady = false;
    const wikiLinkCache = new Map<string, { exists: boolean; uri: vscode.Uri | undefined }>();
    let suppressNextSync = false;
    let syncSuppressionGeneration = 0;
    let documentSyncTimer: NodeJS.Timeout | undefined;
    let editQueue = Promise.resolve();
    let lastKnownHeadings: HeadingItem[] = [];

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        ...workspaceRoots
      ]
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    const uriKey = document.uri.toString();
    MarkdownWeaveEditorProvider.openPanels.set(uriKey, webviewPanel);
    if (webviewPanel.active) {
      MarkdownWeaveEditorProvider._activePanel = webviewPanel;
    }
    disposables.push({ dispose: () => {
      MarkdownWeaveEditorProvider.openPanels.delete(uriKey);
      if (MarkdownWeaveEditorProvider._activePanel === webviewPanel) {
        MarkdownWeaveEditorProvider._activePanel = undefined;
      }
    }});

    const postDocumentContent = (type: 'init' | 'update', source: 'extension' | 'initial'): void => {
      const editorSettings = this.getEditorSettings(document);
      void webviewPanel.webview.postMessage({
        type,
        content: this.normalizeLineEndings(document.getText()),
        version: document.version,
        source,
        eol: editorSettings.eol,
        indentation: editorSettings.indentation
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

      const currentContent = this.normalizeLineEndings(document.getText());
      if (currentContent === message.after) {
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const replacement = this.getReplacement(currentContent, message.after);
      const range = new vscode.Range(
        this.positionAtNormalizedOffset(currentContent, replacement.from),
        this.positionAtNormalizedOffset(currentContent, replacement.to)
      );

      if (currentContent !== message.before) {
        console.warn('MarkdownWeave applying edit snapshot after host/webview drift.');
      }

      edit.replace(document.uri, range, this.toDocumentLineEndings(replacement.insert, document.eol));

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

    const resolveImageUri = async (message: WebviewResolveImageUriMessage): Promise<void> => {
      const uri = await this.getImageWebviewUri(message.src, document, webviewPanel.webview);

      void webviewPanel.webview.postMessage({
        type: 'imageUri',
        requestId: message.requestId,
        src: message.src,
        uri
      });
    };

    const checkWikiLinks = async (message: WebviewCheckWikiLinksMessage): Promise<void> => {
      if (!Array.isArray(message.targets) || message.targets.length === 0) {
        return;
      }

      const results = await Promise.all(
        message.targets.map(async (target) => {
          const cached = wikiLinkCache.get(target);
          if (cached !== undefined) {
            return { target, exists: cached.exists, uri: cached.uri?.toString() };
          }

          const mdMatches = await vscode.workspace.findFiles(`**/${target}.md`, null, 1);
          const matches = mdMatches.length > 0
            ? mdMatches
            : await vscode.workspace.findFiles(`**/${target}.markdown`, null, 1);

          const uri = matches[0] as vscode.Uri | undefined;
          wikiLinkCache.set(target, { exists: !!uri, uri });
          return { target, exists: !!uri, uri: uri?.toString() };
        })
      );

      void webviewPanel.webview.postMessage({ type: 'wikiLinkStatuses', results });
    };

    const invalidateWikiLinkCache = (): void => {
      wikiLinkCache.clear();
      void webviewPanel.webview.postMessage({ type: 'clearWikiLinkCache' });
    };

    const pasteImage = async (message: WebviewPasteImageMessage): Promise<void> => {
      const ext = mimeTypeToExtension(message.mimeType);
      if (!ext || !document.uri.scheme.startsWith('file')) {
        return;
      }

      const config = vscode.workspace.getConfiguration('markdownWeave', document.uri);
      const pasteFolder = config.get<string>('pasteImageFolder', '');
      const docDir = path.dirname(document.uri.fsPath);
      const targetDir = pasteFolder ? path.join(docDir, pasteFolder) : docDir;
      const targetDirUri = vscode.Uri.file(targetDir);

      try {
        await vscode.workspace.fs.createDirectory(targetDirUri);
      } catch {
        // Directory already exists
      }

      const altText = resolveAltText(message.filename, ext, targetDir);
      const fileName = `${altText}.${ext}`;
      const filePath = path.join(targetDir, fileName);
      const fileUri = vscode.Uri.file(filePath);
      const buffer = Buffer.from(message.data, 'base64');
      await vscode.workspace.fs.writeFile(fileUri, buffer);

      const relativePath = path.relative(docDir, filePath).replace(/\\/g, '/');
      void webviewPanel.webview.postMessage({
        type: 'imageInserted',
        markdownText: `![${altText}](${relativePath})\n`
      });
    };

    const pasteImagesBatch = async (message: WebviewPasteImagesBatchMessage): Promise<void> => {
      if (!document.uri.scheme.startsWith('file')) {
        return;
      }

      const config = vscode.workspace.getConfiguration('markdownWeave', document.uri);
      const pasteFolder = config.get<string>('pasteImageFolder', '');
      const docDir = path.dirname(document.uri.fsPath);
      const targetDir = pasteFolder ? path.join(docDir, pasteFolder) : docDir;
      const targetDirUri = vscode.Uri.file(targetDir);

      try {
        await vscode.workspace.fs.createDirectory(targetDirUri);
      } catch {
        // Directory already exists
      }

      const lines: string[] = [];

      for (const img of message.images) {
        const ext = mimeTypeToExtension(img.mimeType);
        if (!ext) {
          continue;
        }

        const altText = resolveAltText(img.filename, ext, targetDir);
        const fileName = `${altText}.${ext}`;
        const filePath = path.join(targetDir, fileName);
        const fileUri = vscode.Uri.file(filePath);
        const buffer = Buffer.from(img.data, 'base64');
        await vscode.workspace.fs.writeFile(fileUri, buffer);

        const relativePath = path.relative(docDir, filePath).replace(/\\/g, '/');
        lines.push(`![${altText}](${relativePath})`);
      }

      if (lines.length === 0) {
        return;
      }

      void webviewPanel.webview.postMessage({
        type: 'imageInserted',
        markdownText: lines.join('\n\n') + '\n'
      });
    };

    const highlightCodeBlocks = async (message: WebviewHighlightCodeBlocksMessage): Promise<void> => {
      if (!Array.isArray(message.requests) || message.requests.length === 0) {
        return;
      }

      const results = await Promise.all(
        message.requests.map(async (request) => {
          const highlighted = await highlight(request.code, request.lang);
          return {
            id: request.id,
            ...highlighted
          };
        })
      );

      void webviewPanel.webview.postMessage({
        type: 'highlightedCodeBlocks',
        results
      });
    };

    let lastRevealRequestLine = 0;

    const attemptReveal = (line: number, retriesLeft: number): void => {
      const op = MarkdownWeaveEditorProvider.outlineProvider;
      const tv = MarkdownWeaveEditorProvider.treeView;
      if (!op || !tv || lastRevealRequestLine !== line) {
        return;
      }
      const heading = op.findHeadingForLine(line);
      if (!heading) {
        return;
      }
      tv.reveal(heading, { select: true, focus: false, expand: true }).then(
        undefined,
        () => {
          // VS Code's treeView.reveal() silently fails when called before the tree has
          // been rendered for the first time. Retry a few times with a short backoff.
          if (retriesLeft > 0 && lastRevealRequestLine === line) {
            setTimeout(() => attemptReveal(line, retriesLeft - 1), 50);
          }
        }
      );
    };

    const revealHeadingForLine = (line: number): void => {
      const op = MarkdownWeaveEditorProvider.outlineProvider;
      const tv = MarkdownWeaveEditorProvider.treeView;
      if (!op || !tv) {
        return;
      }
      const heading = op.findHeadingForLine(line);
      if (!heading) {
        return;
      }
      lastRevealRequestLine = line;
      attemptReveal(line, 3);
    };

    disposables.push(
      webviewPanel.webview.onDidReceiveMessage((message: WebviewMessage) => {
        if (message.type === 'ready') {
          isWebviewReady = true;
          postDocumentContent('init', 'initial');
          const pendingHeading = MarkdownWeaveEditorProvider.pendingHeadings.get(uriKey);
          if (pendingHeading) {
            MarkdownWeaveEditorProvider.pendingHeadings.delete(uriKey);
            void webviewPanel.webview.postMessage({ type: 'scrollToHeading', heading: pendingHeading });
          }
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
          void resolveImageUri(message);
          return;
        }

        if (message.type === 'highlightCodeBlocks') {
          void highlightCodeBlocks(message);
          return;
        }

        if (message.type === 'checkWikiLinks') {
          void checkWikiLinks(message);
          return;
        }

        if (message.type === 'openWikiLink') {
          const uri = vscode.Uri.parse(message.uri);
          const targetKey = uri.toString();
          const existingPanel = MarkdownWeaveEditorProvider.openPanels.get(targetKey);
          if (existingPanel) {
            existingPanel.reveal();
            if (message.heading) {
              void existingPanel.webview.postMessage({ type: 'scrollToHeading', heading: message.heading });
            }
          } else {
            if (message.heading) {
              MarkdownWeaveEditorProvider.pendingHeadings.set(targetKey, message.heading);
            }
            void vscode.commands.executeCommand('vscode.openWith', uri, MarkdownWeaveEditorProvider.viewType);
          }
          return;
        }

        if (message.type === 'pasteImage') {
          void pasteImage(message);
          return;
        }

        if (message.type === 'pasteImagesBatch') {
          void pasteImagesBatch(message);
          return;
        }

        if (message.type === 'headings') {
          lastKnownHeadings = message.items;
          if (MarkdownWeaveEditorProvider._activePanel === webviewPanel) {
            MarkdownWeaveEditorProvider.outlineProvider?.setHeadings(message.items);
          }
          return;
        }

        if (message.type === 'cursorLine') {
          if (MarkdownWeaveEditorProvider._activePanel === webviewPanel || webviewPanel.visible) {
            MarkdownWeaveEditorProvider._activePanel = webviewPanel;
            revealHeadingForLine(message.line);
          }
          return;
        }

      }),
      webviewPanel.onDidChangeViewState((e) => {
        if (e.webviewPanel.active) {
          MarkdownWeaveEditorProvider._activePanel = webviewPanel;
          MarkdownWeaveEditorProvider.outlineProvider?.setHeadings(lastKnownHeadings);
        } else if (MarkdownWeaveEditorProvider._activePanel === webviewPanel) {
          MarkdownWeaveEditorProvider._activePanel = undefined;
          MarkdownWeaveEditorProvider.outlineProvider?.setHeadings([]);
        }
      }),
      vscode.workspace.onDidCreateFiles(() => {
        invalidateWikiLinkCache();
        void webviewPanel.webview.postMessage({ type: 'clearImageUriCache' });
      }),
      vscode.workspace.onDidDeleteFiles(() => {
        invalidateWikiLinkCache();
        void webviewPanel.webview.postMessage({ type: 'clearImageUriCache' });
      }),
      vscode.workspace.onDidRenameFiles(() => {
        invalidateWikiLinkCache();
        void webviewPanel.webview.postMessage({ type: 'clearImageUriCache' });
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
    const katexModuleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'katex', 'katex.mjs'));
    const katexStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'katex', 'katex.min.css'));
    const mermaidModuleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'mermaid', 'mermaid.esm.min.mjs')
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="markdownweave-style-nonce" content="${nonce}">
  <link href="${styleUri}" rel="stylesheet">
  <title>MarkdownWeave</title>
</head>
<body>
  <main id="app">
    <nav id="breadcrumb" aria-label="Document breadcrumb"></nav>
    <div id="status">Markdown Weave loading...</div>
    <div id="editor" aria-label="Markdown source"></div>
  </main>
  <script nonce="${nonce}">
    window.markdownWeaveAssets = {
      katexModule: "${katexModuleUri}",
      katexCss: "${katexStyleUri}",
      mermaidModule: "${mermaidModuleUri}"
    };
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async openLink(url: string): Promise<void> {
    try {
      const normalized = /^[a-z][a-z\d+\-.]*:/i.test(url) ? url : `https://${url}`;
      await vscode.env.openExternal(vscode.Uri.parse(normalized));
    } catch {
      void vscode.window.showWarningMessage(`Markdown Weave could not open link: ${url}`);
    }
  }

  private getEditorSettings(document: vscode.TextDocument): { eol: '\n' | '\r\n'; indentation: EditorIndentation } {
    const configuration = vscode.workspace.getConfiguration('editor', document.uri);
    const tabSizeSetting = configuration.get<number | string>('tabSize', 4);
    const insertSpacesSetting = configuration.get<boolean | string>('insertSpaces', true);
    const tabSize = typeof tabSizeSetting === 'number' && Number.isFinite(tabSizeSetting) ? tabSizeSetting : 4;

    return {
      eol: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
      indentation: {
        insertSpaces: typeof insertSpacesSetting === 'boolean' ? insertSpacesSetting : true,
        tabSize: Math.max(1, Math.min(8, Math.floor(tabSize)))
      }
    };
  }

  private normalizeLineEndings(value: string): string {
    return value.replace(/\r\n?/g, '\n');
  }

  private toDocumentLineEndings(value: string, eol: vscode.EndOfLine): string {
    return eol === vscode.EndOfLine.CRLF ? value.replace(/\n/g, '\r\n') : value;
  }

  private positionAtNormalizedOffset(normalizedContent: string, offset: number): vscode.Position {
    const prefix = normalizedContent.slice(0, offset);
    const line = prefix.split('\n').length - 1;
    const lastBreak = prefix.lastIndexOf('\n');
    const character = lastBreak < 0 ? offset : offset - lastBreak - 1;
    return new vscode.Position(line, character);
  }

  private async getImageWebviewUri(
    src: string,
    document: vscode.TextDocument,
    webview: vscode.Webview
  ): Promise<string | undefined> {
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

    try {
      const stat = await vscode.workspace.fs.stat(imageUri);
      if (stat.type === vscode.FileType.Directory) {
        return undefined;
      }
    } catch {
      return undefined;
    }

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

const GENERIC_CLIPBOARD_NAMES = new Set([
  'image.png',
  'image.jpeg',
  'image.jpg',
  'image.gif',
  'image.webp',
  'image.svg',
  'image.bmp',
  'blob'
]);

function resolveAltText(
  originalFilename: string | undefined,
  ext: string,
  targetDir: string
): string {
  const generatedName = `image-${Date.now()}`;

  if (!originalFilename) {
    return generatedName;
  }

  const sanitized = originalFilename.replace(/[/\\:*?"<>|]/g, '_').replace(/[\x00-\x1f]/g, '');
  if (!sanitized) {
    return generatedName;
  }

  if (GENERIC_CLIPBOARD_NAMES.has(sanitized.toLowerCase())) {
    return generatedName;
  }

  const parsedPath = path.parse(sanitized);
  const baseName = parsedPath.name;
  if (!baseName) {
    return generatedName;
  }

  return findAvailableName(baseName, ext, targetDir);
}

function findAvailableName(
  baseName: string,
  ext: string,
  targetDir: string
): string {
  if (!fs.existsSync(path.join(targetDir, `${baseName}.${ext}`))) {
    return baseName;
  }

  for (let n = 1; n <= 99; n++) {
    const suffix = n.toString().padStart(2, '0');
    const candidate = `${baseName}-${suffix}`;
    if (!fs.existsSync(path.join(targetDir, `${candidate}.${ext}`))) {
      return candidate;
    }
  }

  return `image-${Date.now()}`;
}

function mimeTypeToExtension(mimeType: string): string | undefined {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
  };
  return map[mimeType];
}
