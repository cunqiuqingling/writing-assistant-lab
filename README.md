# Writing Assistant

> **Sentence → Paragraph → Independent Writing**

A local-first English writing practice studio. Core practice works without an account, backend database or AI. Optional BYOK analysis processes only reference text selected by the visitor.

**Live demo:** https://writing-assistant.ccwu.cc/

[中文说明](README.zh-CN.md)

## Interface preview

### Sentence Lab

Sentence imitation, precise copying and local rule-based analysis.

![Writing Assistant Sentence Lab](assets/sentence-lab.png)

### Paragraph Lab

Sentence-function breakdown, guided paragraph building and independent writing.

![Writing Assistant Paragraph Lab](assets/paragraph-lab.png)

### Practice Library

Local folders, imported documents, public resources and chapter progress.

![Writing Assistant Practice Library](assets/practice-library.png)

## Writing philosophy

The project does not promise to turn every learner into a native-language author. Its more practical goal is to make English a language in which learners can express what they actually mean, with less stiffness and a more natural sense of movement.

That requires high-quality input as well as sustained output. Strong writing does not have one fixed form: an essay, news report, speech, academic paper, screenplay, short story, piece of prose and poem all organise information differently.

Writing Assistant therefore encourages observation, breakdown, imitation, transfer and independent writing rather than word-for-word movement from a sentence already completed in another language.

> **文字是自由的，我们要学会如何排列它们，让自己的宇宙和这个世界产生连接。**

*Language is information, and information is everything.*

[Read the full writing philosophy](https://writing-assistant.ccwu.cc/about/philosophy.html)

## Features

- Sentence Lab: copying, structural imitation, splitting and local rule analysis.
- Paragraph Lab: sentence functions, guided planning, skeleton transfer and independent writing.
- Practice Library: folders, long documents, chapter progress and local materials.
- Browser document import for TXT, Markdown, EPUB, DOCX and PDF.
- Self-hosted browser English OCR.
- Optional BYOK reference analysis excluding learner writing, notes, plans and progress.
- User-triggered Wikipedia and Wikisource resources.
- Browser-local storage with JSON backup and restore.

## Optional AI reference analysis

Writing Assistant does not provide a shared AI account or a project-owned API key. The optional feature uses **BYOK — Bring Your Own Key**. Visitors obtain an API key from a provider they choose and connect to that provider directly from their browser.

AI analysis is designed for the **reference sentence or paragraph currently being studied**. It can explain meaning, grammatical structure, clauses, collocations, register, paragraph development, cohesion and transferable writing patterns. It does not read, send or evaluate learner imitation, notes, plans, labels or progress.

### Quick setup

1. Open the website and click **AI Settings** in the top bar.
2. Choose a provider preset: OpenAI, DeepSeek, SiliconFlow, Google Gemini, Anthropic Claude, or a custom OpenAI-compatible service.
3. Paste a dedicated, low-limit and revocable API key obtained from that provider.
4. Check the automatically filled **Base URL**, endpoint and model name against the provider's current documentation. Presets only fill the request format; model availability and pricing may change.
5. Keep **Session only** for the safest default, or choose encrypted local storage and create a local password of at least eight characters.
6. Choose the analysis language, click **Test connection**, and then click **Save settings**.
7. Open a sentence or paragraph exercise and click **AI解析原文 / Analyse reference text** in the right-side coach panel.

The key is excluded from ordinary Writing Assistant backup files. Session-only keys disappear when the browser tab session ends. Encrypted local storage uses a password that the project cannot recover. Some providers may block direct browser requests through CORS, and API usage may incur charges from the selected provider.

[Full AI configuration and troubleshooting guide](docs/AI_CONFIGURATION.md)

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