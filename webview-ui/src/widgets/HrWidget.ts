import { WidgetType } from '@codemirror/view';

export class HrWidget extends WidgetType {
  public toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'mw-hr-wrapper';

    const hr = document.createElement('span');
    hr.className = 'mw-hr';
    wrapper.appendChild(hr);

    return wrapper;
  }
}
