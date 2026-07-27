# Writing Assistant

> **Sentence → Paragraph → Independent Writing**

A local-first English writing practice studio. Core practice works without an account, backend database or AI. Optional BYOK analysis processes only reference text selected by the visitor.

**Live demo:** https://writing-assistant.ccwu.cc/

[中文说明](README.zh-CN.md)

![Writing Assistant interface](assets/screenshot.png)

## Features

- Sentence Lab: copying, structural imitation, splitting and local rule analysis.
- Paragraph Lab: sentence functions, guided planning, skeleton transfer and independent writing.
- Practice Library: folders, long documents, chapter progress and local materials.
- Browser document import for TXT, Markdown, EPUB, DOCX and PDF.
- Self-hosted browser English OCR.
- Optional BYOK reference analysis excluding learner writing, notes, plans and progress.
- User-triggered Wikipedia and Wikisource resources.
- Browser-local storage with JSON backup and restore.

## Privacy, legal and security

There is no shared practice database, account system, advertising tracker or first-party behavior analytics. Ordinary delivery uses Cloudflare. External requests occur only for user-triggered AI, Wikimedia or optional OCR features.

- [Privacy Policy](PRIVACY.md)
- [Terms and Disclaimer](TERMS.md)
- [Copyright and Takedown](COPYRIGHT_AND_TAKEDOWN.md)
- [Security Policy](SECURITY.md)
- [Third-party Notices](THIRD_PARTY_NOTICES.md)
- [Contact](CONTACT.md)
- [Public legal center](https://writing-assistant.ccwu.cc/legal/)

## 0.8.1 transparency patch

Version 0.8.1 preserves storage schema 5 and existing local data. It adds public policy pages, a footer, clearer data-flow disclosures, terms, copyright reporting, security-reporting boundaries and release checks.

## Documents and progress

Documents enter local preview before saving. Title and order changes preserve identifiers where possible. Structural changes reconcile only affected progress after confirmation. PDF.js handles text layers; browser English OCR handles scan-like pages. The larger loopback companion remains optional and experimental.

## Run, build and deploy

```bash
python3 -m http.server 8080
npm install --omit=dev --no-audit --no-fund
npm run vendor
npm run build:release
npm run deploy
```

`dist/site` is deployed through Cloudflare Workers Static Assets.

## Content, contribution and license

Built-in IELTS-style texts are original and unofficial. Users are responsible for lawful imported material. See [CONTRIBUTING.md](CONTRIBUTING.md). Code is released under the [MIT License](LICENSE).
