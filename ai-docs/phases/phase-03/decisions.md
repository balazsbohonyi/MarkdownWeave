# Phase 03 Decisions

This document records Phase 3 implementation deviations from `plan.md` and durable decisions from `revised-plan.md`.

## Deviations From Plan

### Shiki uses v4, class-based CSS, and curated language loading

The original Phase 3 plan described Shiki v3 output with inline token styles. Phase 3 uses Shiki v4 with the JavaScript regex engine, `light-plus` / `dark-plus`, a curated static language map, and class-based token CSS.

Reason:

The revised plan requires Shiki v4 and class-based CSS so the webview CSP does not need `unsafe-inline` for highlighted code token colors.

Implication:

Code highlighting requests return sanitized Shiki HTML plus generated CSS. Unknown languages fall back to plaintext instead of dynamic arbitrary grammar imports.

### Block widgets preserve Phase 2 reveal semantics

Block widgets use the shared focus-gated reveal rules from Phase 2: broad non-empty selection reveal, delayed reveal during pointer selection, and preview styling in raw mode where practical.

Reason:

Phase 2 established these semantics to avoid layout jumps and accidental raw reveal while the webview is blurred.

Implication:

New block widgets should use the shared reveal helpers and session state rather than independent cursor checks.

### Math scanning is conservative

Inline and display math are detected with scanner logic instead of extending the Markdown parser. The scanner skips code, links, images, escaped delimiters, and currency-like dollar usage.

Reason:

The revised plan prefers conservative post-parse scanning for Phase 3 to avoid broad grammar changes.

Implication:

Some ambiguous `$...$` sequences intentionally remain raw markdown until math parsing rules are expanded deliberately.

### Embedded HTML uses DOMPurify

Embedded HTML is sanitized with DOMPurify using the Phase 3 allowlist. Dangerous elements, event handlers, unsafe URLs, and arbitrary attributes are stripped before rendering.

Reason:

The original plan required sanitization; the revised plan selects DOMPurify as the implementation.

Implication:

Only simple same-line inline HTML pairs are rendered inline. Complex inline HTML remains raw. Block HTML renders through sanitized widgets.

### Local HTML images resolve through the existing host URI resolver

Sanitized `<img src>` values in HTML widgets are resolved through the extension host's existing local image URI resolver and use the same deterministic missing-image behavior as Markdown image widgets.

Reason:

Webviews cannot load arbitrary workspace file paths directly, and Phase 2 already established a cacheable host resolver.

Implication:

HTML image rendering depends on asynchronous host responses and may update after the widget first mounts.

## Decisions

### Widget raw state is session-only

Table raw toggles and frontmatter expansion are stored only in CM6 state fields for the active editor session. They are not persisted through `vscode.setState()` in Phase 3.

### Mermaid is treated as a special code block language

Fenced code blocks with language `mermaid` bypass Shiki and render through the lazy Mermaid renderer. Invalid diagrams show a deterministic error fallback with raw diagram text.

### Highlighting and heavy renderers are lazy

Code highlighting, KaTeX rendering, Mermaid rendering, and HTML image URI resolution are requested only when relevant syntax exists and, where applicable, when widgets enter the observed viewport overscan.
