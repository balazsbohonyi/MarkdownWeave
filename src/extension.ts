import * as vscode from 'vscode';
import { MarkdownWeaveEditorProvider } from './markdownWeaveEditor';
import { OutlineProvider } from './outlineProvider';

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

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MarkdownWeaveEditorProvider(context.extensionUri);
  const outlineProvider = new OutlineProvider();
  const treeView = vscode.window.createTreeView('markdownWeave.outline', {
    treeDataProvider: outlineProvider,
    showCollapseAll: false
  });

  MarkdownWeaveEditorProvider.outlineProvider = outlineProvider;
  MarkdownWeaveEditorProvider.treeView = treeView;

  context.subscriptions.push(
    treeView,
    vscode.window.registerCustomEditorProvider(
      MarkdownWeaveEditorProvider.viewType,
      provider,
      {
        supportsMultipleEditorsPerDocument: true
      }
    ),
    vscode.commands.registerCommand('markdownWeave.openEditor', async (resource?: vscode.Uri) => {
      const uri = resource ?? vscode.window.activeTextEditor?.document.uri;

      if (!uri) {
        void vscode.window.showWarningMessage('Open a Markdown file before running Markdown Weave.');
        return;
      }

      await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownWeaveEditorProvider.viewType);
    }),
    vscode.commands.registerCommand('markdownWeave.scrollToHeading', (line: number) => {
      MarkdownWeaveEditorProvider.activePanel?.webview.postMessage({ type: 'scrollToLine', line });
    }),
    ...FORMATTING_COMMANDS.map(({ id, command }) =>
      vscode.commands.registerCommand(id, () => {
        MarkdownWeaveEditorProvider.sendCommandToActive(command);
      })
    )
  );
}

export function deactivate(): void {
  // No extension-level resources are held outside VS Code disposables.
}
