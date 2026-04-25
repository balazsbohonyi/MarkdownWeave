import * as vscode from 'vscode';
import { MarkdownWeaveEditorProvider } from './markdownWeaveEditor';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MarkdownWeaveEditorProvider(context.extensionUri);

  context.subscriptions.push(
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
    })
  );
}

export function deactivate(): void {
  // No extension-level resources are held outside VS Code disposables.
}
