# Writing Assistant

> **Sentence → Paragraph → Independent Writing**

A local-first English writing practice studio. It helps learners move from sentence imitation to paragraph development and independent writing without requiring an account, backend database, or AI API.

**Live demo:** https://writing-assistant.ccwu.cc/

[中文说明](README.zh-CN.md)

## Interface

### Sentence Lab

![Sentence Lab](assets/sentence-lab.png)

### Paragraph Lab

![Paragraph Lab](assets/paragraph-lab.png)

### Practice Library

![Practice Library](assets/practice-library.png)

## Why this project

Many learners are asked to write full essays before they have been trained to build clear sentences and logically developed paragraphs. Writing Assistant separates those skills into a gradual path:

1. observe and imitate useful sentence structures;
2. identify how each sentence functions inside a paragraph;
3. build a paragraph from claim, reason, mechanism, example and qualification;
4. move toward independent writing;
5. copy the learner's own work into a GPT conversation for feedback and rewriting.

## Features

- **Sentence Lab** — precise copying, structural imitation, automatic text splitting, local rule-based analysis, and copy-ready feedback prompts.
- **Paragraph Lab** — sentence-function labeling, guided paragraph planning, skeleton transfer, and independent paragraph writing.
- **Practice Library** — a folder-based local library that preserves the existing material cards and supports custom folders, TXT, Markdown and JSON imports.
- **Long-text workspace** — documents are organised into chapters and batches of at most 45 practice units, with separate saved progress for Sentence Lab and Paragraph Lab.
- **Local-first storage** — practice state stays in the visitor's own browser; optional JSON backup and restore.
- **Optional BYOK reference analysis** — AI analyses only the selected model text, novel excerpt or academic source; learner writing is not sent or evaluated.
- **No account required** — each visitor receives an independent local workspace.

## Privacy and security model

The public website contains only the application code and built-in practice materials.

- Practice text, answers, notes and custom materials are stored in the visitor's browser using `localStorage` and `IndexedDB`.
- One visitor cannot see another visitor's local practice data.
- The project does not include a cloud database, analytics script or API endpoint for modifying the deployed site.
- Changes made through browser developer tools affect only that visitor's current browser session.
- Publishing this repository does not give contributors access to the maintainer's Cloudflare account.
- A change affects the live Cloudflare site only after an authorized maintainer deploys a new Worker version, or after an explicitly configured trusted CI/CD workflow deploys it.

See [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md), the [BYOK AI configuration guide](docs/AI_CONFIGURATION.md), and the [folder and long-text guide](docs/LONG_TEXT_AND_FOLDERS.md).

## Run locally

A local web server is recommended because browser security restrictions may block some features when `index.html` is opened directly.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.



## Deploy as a Cloudflare Worker

A copy-paste Worker build is included:

```text
dist/writing-assistant-worker.js
```

To rebuild it after editing the source project:

```bash
npm run build:worker
```

Paste the generated Worker into the Cloudflare editor and deploy.

## Repository suggestions

- Repository name: `writing-assistant-lab`
- Description: `Local-first English writing practice: Sentence → Paragraph → Independent Writing`
- Website: `https://writing-assistant.ccwu.cc/`
- Topics: `english-writing`, `ielts`, `writing-practice`, `local-first`, `vanilla-javascript`, `cloudflare-workers`

## Content and copyright

Starter IELTS-style texts are original practice materials and are not official IELTS model answers. Users are responsible for verifying the copyright status of imported material. Do not redistribute copyrighted essays or books without permission.

## Contributing

Bug reports and focused improvements are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests do not change the live website unless the maintainer reviews, merges and deploys them.

## License

Code is released under the [MIT License](LICENSE). Included original starter materials are licensed for use with this project; attribution is appreciated. Third-party imported material remains subject to its own copyright and license.

## AI reference-analysis boundary

When enabled, AI analyses only the selected reference sentence or paragraph, such as a model essay, novel excerpt or academic text. Learner writing, notes, labels, plans and progress are not sent to the provider and are not evaluated.

The normal exercise copy actions do not include AI analysis output. Analysis remains in a separate panel and local browser cache.

## 0.7.0 format boundary

This release continues to import plain text, TXT, Markdown and practice-library JSON. Online Wikipedia/Wikisource retrieval and EPUB, DOCX or PDF parsing are not included in 0.7.0.
