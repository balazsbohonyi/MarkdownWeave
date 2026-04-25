# Phase 11: Publishing & CI

---

#### P11-T1: Marketplace metadata

**Steps:**

1. Add to ##package.json##:
   - ##displayName: "MarkdownWeave"##
   - ##description: "Obsidian-style inline WYSIWYG editing for Markdown files"##
   - ##icon: "media/icon.png"## (128x128 PNG)
   - ##categories: ["Other"]##
   - ##repository: { type: "git", url: "..." }##
   - ##license: "MIT"## (or preferred license)
   - ##publisher: "your-publisher-id"##
2. Create the icon image.

---

#### P11-T2: README.md with screenshots and GIF demos

**Steps:**

1. Record GIFs showing: live preview editing, block/inline reveal, code block highlighting, table rendering, image paste, outline sidebar.
2. Write README sections: Features, Installation, Usage, Settings, Keyboard Shortcuts, Contributing.

---

#### P11-T3: CHANGELOG.md

Maintain semver entries for each release.

---

#### P11-T4: GitHub Actions — CI (build + test + lint on PR)

**Steps:**

1. Create ##.github/workflows/ci.yml##:
   - Trigger: ##pull_request## and ##push## to main.
   - Steps: checkout, setup Node 20, ##npm ci##, ##npm run lint##, ##npm run compile##, ##npm test##.
2. Test step uses ##@vscode/test-electron## to run tests in a headless VS Code.

---

#### P11-T5: GitHub Actions — publish to VS Marketplace

**Steps:**

1. Create ##.github/workflows/publish.yml##:
   - Trigger: ##push## of tags matching ##v*##.
   - Steps: build, test, ##npx @vscode/vsce package##, ##npx @vscode/vsce publish##.
   - Use Azure DevOps PAT stored as GitHub secret.
2. Requires Node ≥20.18.1 for recent ##@vscode/vsce##.

---

#### P11-T6: GitHub Actions — publish to Open VSX

**Steps:**

1. Add the ##HaaLeo/publish-vscode-extension@v2## action step after the VS Marketplace publish.
2. Use Open VSX access token stored as GitHub secret.

**Done when:** Pushing a ##v0.1.0## tag builds and publishes to both marketplaces.

---

#### P11-T7: ##.vsix## artifact upload to GitHub Release

**Steps:**

1. Add a step in the publish workflow to upload the ##.vsix## file as a GitHub Release artifact using ##softprops/action-gh-release##.
2. Create the GitHub Release automatically from the tag.

**Done when:** Each tagged release has a downloadable ##.vsix## on the GitHub Releases page.

---
