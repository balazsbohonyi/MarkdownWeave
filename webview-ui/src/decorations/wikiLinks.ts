import type { Extension } from '@codemirror/state';
import { StateEffect, StateField } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { checkWikiLinks, setWikiLinkClearCallback, type WikiLinkStatus } from '../bridge';
import { getMarkdownWeaveSettings, markdownSettingsChanged } from '../settings';

export const wikiLinkStatusEffect = StateEffect.define<WikiLinkStatus[]>();
export const clearWikiLinkStatusEffect = StateEffect.define<void>();

export const wikiLinkStatusField = StateField.define<Map<string, WikiLinkStatus>>({
  create: () => new Map(),
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(wikiLinkStatusEffect)) {
        next = new Map(next);
        for (const status of effect.value) {
          next.set(status.target, status);
        }
      } else if (effect.is(clearWikiLinkStatusEffect)) {
        next = new Map();
      }
    }
    return next;
  }
});

const wikiLinkStatusRequester = ViewPlugin.fromClass(
  class {
    public constructor(view: EditorView) {
      setWikiLinkClearCallback(() => {
        view.dispatch({ effects: [clearWikiLinkStatusEffect.of(undefined)] });
      });
      requestVisibleWikiLinkStatuses(view);
    }

    public update(update: ViewUpdate): void {
      const hasClearEffect = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(clearWikiLinkStatusEffect) || e.is(markdownSettingsChanged))
      );
      if (update.docChanged || update.viewportChanged || hasClearEffect) {
        requestVisibleWikiLinkStatuses(update.view);
      }
    }

    public destroy(): void {
      setWikiLinkClearCallback(undefined);
    }
  }
);

function requestVisibleWikiLinkStatuses(view: EditorView): void {
  if (!getMarkdownWeaveSettings().enableWikiLinks) {
    return;
  }

  const statuses = view.state.field(wikiLinkStatusField);
  const targets: string[] = [];

  for (const range of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: range.from,
      to: range.to,
      enter(node) {
        if (node.name !== 'WikiLinkTarget') {
          return;
        }
        const target = view.state.doc.sliceString(node.from, node.to);
        if (target && !statuses.has(target)) {
          targets.push(target);
        }
      }
    });
  }

  if (targets.length === 0) {
    return;
  }

  checkWikiLinks(targets, (results) => {
    view.dispatch({ effects: [wikiLinkStatusEffect.of(results)] });
  });
}

export const wikiLinkExtensions: Extension = [wikiLinkStatusField, wikiLinkStatusRequester];
