---
title: "Companion Methods: Attention Fixture"
kind: "wiki-link-target"
status: "implemented-feature-test"
---

# Companion Methods

This companion page exists primarily to test `[[attention-methods]]`, `[[attention-methods|alias links]]`, and heading-target navigation from the main fixture.

## Data Pipeline

The pipeline uses three stages:

1. Sentence segmentation.
2. Token normalization.
3. Mini-batch construction with padding masks.

The mask is defined as inline math, $m_i \in \{0, 1\}$, and applied before softmax:

$$
\alpha_{ij} =
\frac{\exp(s_{ij})m_j}{\sum_{\ell=1}^{n}\exp(s_{i\ell})m_\ell + \epsilon}
$$

## Implementation Note

```ts
export function makePaddingMask(lengths: number[], maxLength: number): boolean[][] {
  return lengths.map((length) =>
    Array.from({ length: maxLength }, (_, index) => index < length),
  );
}
```

## Diagnostics

| Check | Expected behavior in Markdown Weave |
|---|---|
| Heading path | Breadcrumb should show `Companion Methods > Diagnostics` |
| Code block | Shiki preview should render TypeScript |
| Formula | KaTeX should render display math |
| Wiki target | Ctrl+Click from main document should open this file |

Back to [[transformer-attention-fixture|main fixture]].
