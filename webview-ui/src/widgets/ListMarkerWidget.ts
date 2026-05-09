import { WidgetType } from '@codemirror/view';

export class ListMarkerWidget extends WidgetType {
  public constructor(
    private readonly text: string,
    private readonly kind: 'bullet' | 'ordered' | 'task' = 'bullet'
  ) {
    super();
  }

  public toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = `mw-list-marker mw-list-marker-${this.kind}`;
    marker.textContent = this.text;
    return marker;
  }

  public eq(other: ListMarkerWidget): boolean {
    return this.text === other.text && this.kind === other.kind;
  }

  public ignoreEvent(): boolean {
    return false;
  }
}
