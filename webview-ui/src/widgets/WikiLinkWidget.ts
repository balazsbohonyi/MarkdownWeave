import { WidgetType } from '@codemirror/view';

export class WikiLinkWidget extends WidgetType {
  public constructor(
    private readonly displayText: string,
    private readonly exists: boolean | undefined // undefined = not yet checked (optimistic)
  ) {
    super();
  }

  public toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = this.exists === false ? 'mw-wikilink mw-wikilink-broken' : 'mw-wikilink';
    span.textContent = this.displayText;
    return span;
  }

  public eq(other: WikiLinkWidget): boolean {
    return other.displayText === this.displayText && other.exists === this.exists;
  }

  public ignoreEvent(): boolean {
    return false;
  }
}
