import { WidgetType } from '@codemirror/view';

export class HrWidget extends WidgetType {
  public toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'mw-hr-wrapper';

    const hr = document.createElement('hr');
    hr.className = 'mw-hr';
    wrapper.appendChild(hr);

    return wrapper;
  }
}
