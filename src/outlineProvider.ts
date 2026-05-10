import * as vscode from 'vscode';

export type HeadingItem = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  line: number;   // 1-based
  from: number;   // char offset
};

export class OutlineProvider implements vscode.TreeDataProvider<HeadingItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private headings: HeadingItem[] = [];
  private roots: HeadingItem[] = [];
  private childrenMap = new Map<HeadingItem, HeadingItem[]>();
  private parentMap = new Map<HeadingItem, HeadingItem>();

  setHeadings(items: HeadingItem[]): void {
    this.headings = items;
    this.buildTree(items);
    this._onDidChangeTreeData.fire();
  }

  findHeadingForLine(line: number): HeadingItem | undefined {
    let found: HeadingItem | undefined;
    for (const h of this.headings) {
      if (h.line <= line) {
        found = h;
      } else {
        break;
      }
    }
    return found;
  }

  getTreeItem(item: HeadingItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(item.text);
    const children = this.childrenMap.get(item);
    treeItem.collapsibleState =
      children && children.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None;
    treeItem.tooltip = item.text;
    treeItem.id = `${item.from}:${item.level}:${item.text}`;
    treeItem.command = {
      command: 'markdownWeave.scrollToHeading',
      title: 'Scroll to Heading',
      arguments: [item.line]
    };
    return treeItem;
  }

  getChildren(parent?: HeadingItem): HeadingItem[] {
    if (!parent) {
      return this.roots;
    }
    return this.childrenMap.get(parent) ?? [];
  }

  getParent(item: HeadingItem): HeadingItem | undefined {
    return this.parentMap.get(item);
  }

  private buildTree(items: HeadingItem[]): void {
    this.roots = [];
    this.childrenMap = new Map();
    this.parentMap = new Map();
    const stack: HeadingItem[] = [];

    for (const item of items) {
      // Pop ancestors with level >= current item (they can't be parents)
      while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        this.roots.push(item);
      } else {
        const parent = stack[stack.length - 1];
        const siblings = this.childrenMap.get(parent) ?? [];
        siblings.push(item);
        this.childrenMap.set(parent, siblings);
        this.parentMap.set(item, parent);
      }

      stack.push(item);
    }
  }
}
