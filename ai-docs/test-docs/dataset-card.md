---
title: "Synthetic Dataset Card"
kind: "wiki-link-target"
---

# Synthetic Dataset Card

This page supplies a realistic linked note for dataset references in the main paper.

## Corpus Summary

| Split | Documents | Tokens | Median length | Notes |
|---:|---:|---:|---:|---|
| Train | 48,000 | 39.2M | 731 | Mixed abstracts and introductions |
| Validation | 3,000 | 2.4M | 716 | Stratified by venue |
| Test | 3,000 | 2.5M | 744 | Held out by publication year |

## Known Limitations

- [x] Contains long mathematical paragraphs.
- [x] Contains tables and citations.
- [ ] Does not include scanned PDF figures.
- [ ] Does not model multilingual code-switching.

## Field Schema

```json
{
  "paper_id": "synthetic-0001",
  "title": "A reproducible attention study",
  "sections": ["abstract", "method", "results"],
  "token_count": 912,
  "has_equations": true
}
```

See [[glossary#Attention score]] for terminology.
