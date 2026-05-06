import * as vscode from 'vscode';
import { MarkdownWeaveEditorProvider } from './markdownWeaveEditor';
import { OutlineProvider } from './outlineProvider';

const SCROLL_SYNC_SUPPRESSION_MS = 250;
const ACTIVE_STANDALONE_CONTEXT = 'markdownWeave.activeStandaloneEditor';

const FORMATTING_COMMANDS: Array<{ id: string; command: string }> = [
  { id: 'markdownWeave.toggleBold', command: 'toggleBold' },
  { id: 'markdownWeave.toggleItalic', command: 'toggleItalic' },
  { id: 'markdownWeave.toggleStrikethrough', command: 'toggleStrikethrough' },
  { id: 'markdownWeave.toggleInlineCode', command: 'toggleInlineCode' },
  { id: 'markdownWeave.insertLink', command: 'insertLink' },
  { id: 'markdownWeave.toggleCodeBlock', command: 'toggleCodeBlock' },
  { id: 'markdownWeave.increaseHeading', command: 'increaseHeadingLevel' },
  { id: 'markdownWeave.decreaseHeading', command: 'decreaseHeadingLevel' }
];

type SideBySideSession = {
  uriKey: string;
  rawEditor: vscode.TextEditor;
  previewPanel: vscode.WebviewPanel;
  suppressRawUntil: number;
  suppressPreviewUntil: number;
  lastRawLine: number | undefined;
  lastPreviewLine: number | undefined;
  disposables: vscode.Disposable[];
};

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MarkdownWeaveEditorProvider(context.extensionUri);
  const outlineProvider = new OutlineProvider();
  const treeView = vscode.window.createTreeView('markdownWeave.outline', {
    treeDataProvider: outlineProvider,
    showCollapseAll: false
  });
  const sideBySideSessions = new Map<string, SideBySideSession>();

  const isSideBySidePreviewPanel = (panel: vscode.WebviewPanel | undefined): boolean => {
    if (!panel) {
      return false;
    }

    return Array.from(sideBySideSessions.values()).some((session) => session.previewPanel === panel);
  };

  const updateStandaloneEditorContext = (): void => {
    const activePanel = MarkdownWeaveEditorProvider.activePanel;
    const activeStandaloneEditor = !!activePanel && !isSideBySidePreviewPanel(activePanel);
    void vscode.commands.executeCommand('setContext', ACTIVE_STANDALONE_CONTEXT, activeStandaloneEditor);
  };

  const disposeSideBySideSession = (uriKey: string): void => {
    const existing = sideBySideSessions.get(uriKey);
    if (!existing) {
      return;
    }

    existing.disposables.forEach((disposable) => disposable.dispose());
    sideBySideSessions.delete(uriKey);
    updateStandaloneEditorContext();
  };

  const openSideBySide = async (resource?: vscode.Uri): Promise<void> => {
    const uri = resource ?? vscode.window.activeTextEditor?.document.uri ?? MarkdownWeaveEditorProvider.activeUri;

    if (!uri) {
      void vscode.window.showWarningMessage('Open a Markdown file before opening side-by-side mode.');
      return;
    }

    const uriKey = uri.toString();
    disposeSideBySideSession(uriKey);

    const rawEditor = await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.One });
    await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownWeaveEditorProvider.viewType, vscode.ViewColumn.Two);
    const previewPanel = await waitForPreviewPanel(uri);

    if (!previewPanel) {
      void vscode.window.showWarningMessage('Markdown Weave could not open the side-by-side preview.');
      return;
    }

    const session: SideBySideSession = {
      uriKey,
      rawEditor,
      previewPanel,
      suppressRawUntil: 0,
      suppressPreviewUntil: 0,
      lastRawLine: undefined,
      lastPreviewLine: undefined,
      disposables: []
    };

    session.disposables.push(previewPanel.onDidDispose(() => disposeSideBySideSession(uriKey)));
    sideBySideSessions.set(uriKey, session);
    updateStandaloneEditorContext();
  };

  const openEditor = async (resource?: vscode.Uri): Promise<void> => {
    const uri = resource ?? vscode.window.activeTextEditor?.document.uri;

    if (!uri) {
      void vscode.window.showWarningMessage('Open a Markdown file before running Markdown Weave.');
      return;
    }

    await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownWeaveEditorProvider.viewType);
  };

  const showSource = async (): Promise<void> => {
    const uri = MarkdownWeaveEditorProvider.activeUri;

    if (!uri) {
      void vscode.window.showWarningMessage('Open a Markdown Weave editor before showing source.');
      return;
    }

    const existingColumn = findExistingStandaloneSourceColumn(uri, sideBySideSessions);
    const targetColumn = existingColumn ?? MarkdownWeaveEditorProvider.activePanel?.viewColumn ?? vscode.ViewColumn.Active;
    await vscode.window.showTextDocument(uri, { viewColumn: targetColumn, preview: false });
  };

  MarkdownWeaveEditorProvider.outlineProvider = outlineProvider;
  MarkdownWeaveEditorProvider.treeView = treeView;
  MarkdownWeaveEditorProvider.activePanelChangeHandler = updateStandaloneEditorContext;
  MarkdownWeaveEditorProvider.previewScrollHandler = (uri, panel, line) => {
    const session = sideBySideSessions.get(uri.toString());
    if (!session || session.previewPanel !== panel || Date.now() < session.suppressPreviewUntil) {
      return;
    }

    const rawEditor = findVisibleRawEditor(session) ?? session.rawEditor;
    if (!rawEditor) {
      return;
    }

    session.rawEditor = rawEditor;
    if (session.lastPreviewLine === line) {
      return;
    }

    session.lastPreviewLine = line;
    session.suppressRawUntil = Date.now() + SCROLL_SYNC_SUPPRESSION_MS;
    const targetLine = Math.max(0, Math.min(line - 1, rawEditor.document.lineCount - 1));
    const position = new vscode.Position(targetLine, 0);
    rawEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
  };

  context.subscriptions.push(
    treeView,
    vscode.window.registerCustomEditorProvider(
      MarkdownWeaveEditorProvider.viewType,
      provider,
      {
        supportsMultipleEditorsPerDocument: true
      }
    ),
    vscode.commands.registerCommand('markdownWeave.openEditor', openEditor),
    vscode.commands.registerCommand('markdownWeave.openEditorContext', openEditor),
    vscode.commands.registerCommand('markdownWeave.openSideBySide', openSideBySide),
    vscode.commands.registerCommand('markdownWeave.openSideBySideToolbar', openSideBySide),
    vscode.commands.registerCommand('markdownWeave.openSideBySideContext', openSideBySide),
    vscode.commands.registerCommand('markdownWeave.showSource', showSource),
    vscode.commands.registerCommand('markdownWeave.scrollToHeading', (line: number) => {
      MarkdownWeaveEditorProvider.activePanel?.webview.postMessage({ type: 'scrollToLine', line });
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      const uriKey = event.textEditor.document.uri.toString();
      const session = sideBySideSessions.get(uriKey);
      if (!session || event.textEditor.viewColumn !== vscode.ViewColumn.One || Date.now() < session.suppressRawUntil) {
        return;
      }

      const firstVisibleRange = event.visibleRanges[0];
      if (!firstVisibleRange) {
        return;
      }

      const line = firstVisibleRange.start.line + 1;
      if (session.lastRawLine === line) {
        return;
      }

      session.rawEditor = event.textEditor;
      session.lastRawLine = line;
      session.suppressPreviewUntil = Date.now() + SCROLL_SYNC_SUPPRESSION_MS;
      void session.previewPanel.webview.postMessage({ type: 'syncScrollToLine', line });
    }),
    ...FORMATTING_COMMANDS.map(({ id, command }) =>
      vscode.commands.registerCommand(id, () => {
        MarkdownWeaveEditorProvider.sendCommandToActive(command);
      })
    )
  );

  context.subscriptions.push({
    dispose: () => {
      MarkdownWeaveEditorProvider.previewScrollHandler = undefined;
      MarkdownWeaveEditorProvider.activePanelChangeHandler = undefined;
      void vscode.commands.executeCommand('setContext', ACTIVE_STANDALONE_CONTEXT, false);
      Array.from(sideBySideSessions.keys()).forEach(disposeSideBySideSession);
    }
  });
}

export function deactivate(): void {
  // No extension-level resources are held outside VS Code disposables.
}

function findVisibleRawEditor(session: SideBySideSession): vscode.TextEditor | undefined {
  const visibleForUri = vscode.window.visibleTextEditors.filter(
    (editor) => editor.document.uri.toString() === session.uriKey
  );

  return visibleForUri.find((editor) => editor.viewColumn === vscode.ViewColumn.One) ?? visibleForUri[0];
}

function findExistingStandaloneSourceColumn(
  uri: vscode.Uri,
  sideBySideSessions: Map<string, SideBySideSession>
): vscode.ViewColumn | undefined {
  const uriKey = uri.toString();
  const sideBySideSourceColumns = Array.from(sideBySideSessions.values())
    .filter((session) => session.uriKey === uriKey)
    .map((session) => session.rawEditor.viewColumn)
    .filter((viewColumn): viewColumn is vscode.ViewColumn => viewColumn !== undefined);

  const visibleEditor = vscode.window.visibleTextEditors.find(
    (editor) =>
      editor.document.uri.toString() === uriKey &&
      editor.viewColumn !== undefined &&
      !sideBySideSourceColumns.includes(editor.viewColumn)
  );

  if (visibleEditor?.viewColumn !== undefined) {
    return visibleEditor.viewColumn;
  }

  for (const group of vscode.window.tabGroups.all) {
    if (sideBySideSourceColumns.includes(group.viewColumn)) {
      continue;
    }

    const hasSourceTab = group.tabs.some(
      (tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uriKey
    );

    if (hasSourceTab) {
      return group.viewColumn;
    }
  }

  return undefined;
}

async function waitForPreviewPanel(uri: vscode.Uri): Promise<vscode.WebviewPanel | undefined> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const panel = MarkdownWeaveEditorProvider.getPanel(uri);
    if (panel) {
      return panel;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return undefined;
}
