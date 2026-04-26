import { WidgetType } from '@codemirror/view';

export class ListMarkerWidget extends WidgetType {
  public constructor(private readonly text: string) {
    super();
  }

  public toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = 'mw-list-marker';
    marker.textContent = this.text;
    return marker;
  }

  public ignoreEvent(): boolean {
    return false;
  }
}
