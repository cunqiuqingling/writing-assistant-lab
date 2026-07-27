# Writing Assistant

> **Sentence → Paragraph → Independent Writing**

A local-first English writing practice studio. It helps learners move from sentence imitation to paragraph development and independent writing without requiring an account, backend database, or AI API.

**Live demo:** https://writing-assistant.ccwu.cc/

[中文说明](README.zh-CN.md)

![Writing Assistant interface](assets/screenshot.png)

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
- **Practice Library** — folder-based materials, chapter progress, and local TXT, Markdown, EPUB, DOCX, PDF and JSON imports.
- **Local-first storage** — practice state stays in the visitor's own browser; optional JSON backup and restore.
- **Optional BYOK reference analysis** — AI analyses only the selected model text, novel excerpt or academic source; learner writing is not sent or evaluated.
- **No account required** — each visitor receives an independent local workspace.

## Document import and management in 0.8.0 M2

The browser can now parse supported documents locally:

- EPUB: reads the package metadata, spine and HTML/XHTML chapters;
- DOCX: extracts semantic headings and text through Mammoth;
- PDF: extracts an existing text layer through PDF.js and warns when the file appears to be scanned;
- TXT and Markdown: reuse the chapter and long-text workspace introduced in 0.7.0.

Every document enters a preview before it is saved. The visitor can review metadata, select chapters, rename or reorder them, fully edit chapter text, split or merge chapters, and choose a local library folder. Imported documents can be reopened from their cards for later correction. The source file is not uploaded to the project maintainer.

Scanned-PDF OCR is not included in M2. A later 0.8.0 checkpoint will add an optional local PaddleOCR-VL companion; ordinary users will not be required to install it.

### M2 document-management safeguards

- Every card has a local title-edit action. Built-in material titles use a browser-only override and can be restored to their defaults.
- Imported document cards can reopen the full metadata and chapter editor.
- Reordering and title-only edits preserve chapter IDs and saved progress.
- Editing, merging, splitting or deleting chapter text clears only progress records whose source chapter no longer matches; the interface asks for confirmation first.
- The preview displays selected word/character counts, estimated sentence and paragraph units, and 45-unit batch estimates.
- PDF import reports probable scan pages, mixed text layers and likely two-column layouts.

## Privacy and security model

The public website contains only the application code and built-in practice materials.

- Practice text, answers, notes and custom materials are stored in the visitor's browser using `localStorage` and `IndexedDB`.
- One visitor cannot see another visitor's local practice data.
- The project does not include a cloud database, analytics script or API endpoint for modifying the deployed site.
- Changes made through browser developer tools affect only that visitor's current browser session.
- Publishing this repository does not give contributors access to the maintainer's Cloudflare account.
- A change affects the live Cloudflare site only after an authorized maintainer deploys a new Worker version, or after an explicitly configured trusted CI/CD workflow deploys it.

See [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md), and the [BYOK AI configuration guide](docs/AI_CONFIGURATION.md).

## Run locally

A local web server is recommended because browser security restrictions may block some features when `index.html` is opened directly.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.


## Deployment during the 0.8.0 transition

For local testing without installing parser packages, serve the repository directly; pinned CDN fallbacks load only the parser code, not the selected document.

For production, install the pinned dependencies and build local static assets:

```bash
npm install
npm run build:site:full
npm run deploy
```

The project now includes `wrangler.jsonc` and deploys `dist/site` as Cloudflare Static Assets. The previous single-file Worker remains available temporarily through `npm run build:worker`, but the static-assets path is recommended for the final 0.8.0 release.

See [DOCUMENT_IMPORT.md](docs/DOCUMENT_IMPORT.md) and [CLOUDFLARE_STATIC_ASSETS.md](docs/CLOUDFLARE_STATIC_ASSETS.md).


## Content and copyright

Starter IELTS-style texts are original practice materials and are not official IELTS model answers. Users are responsible for verifying the copyright status of imported material. Do not redistribute copyrighted essays or books without permission.

## Contributing

Bug reports and focused improvements are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests do not change the live website unless the maintainer reviews, merges and deploys them.

## License

Code is released under the [MIT License](LICENSE). Included original starter materials are licensed for use with this project; attribution is appreciated. Third-party imported material remains subject to its own copyright and license.

## AI reference-analysis boundary

When enabled, AI analyses only the selected reference sentence or paragraph, such as a model essay, novel excerpt or academic text. Learner writing, notes, labels, plans and progress are not sent to the provider and are not evaluated.

The normal exercise copy actions do not include AI analysis output. Analysis remains in a separate panel and local browser cache.

## 0.8.0 M3: public resources and collapsible folders

- Parent folders, including **All Materials**, can be expanded and collapsed independently from folder selection.
- The state is local, persistent and included in ordinary backups.
- The public-resource center ships forty metadata-only starters and supports user-triggered English Wikipedia/Wikisource search.
- Remote pages always pass through the same local chapter preview before they can be saved.
- Wikimedia requests never include learner writing, notes, AI keys or practice progress.

See `docs/ONLINE_RESOURCES.md` and `docs/FOLDER_NAVIGATION.md`.

## 0.8.0 M4-R1: optional local OCR for scanned PDFs

PDF.js continues to parse normal text-layer PDFs directly in the browser without any installation. Scan-like PDFs now remain in the import preview and can use an optional loopback companion at `127.0.0.1:8765`. The visitor explicitly chooses pages, pairs the browser with a random local token, and runs PaddleOCR-VL on their own Mac. Cloudflare, GitHub and the project maintainer do not receive the rendered pages or OCR results. The first packaged companion targets macOS Apple Silicon; all non-OCR features remain usable without it. See `docs/LOCAL_OCR.md`.


## M4-R1 browser-first OCR

Scanned PDFs default to on-demand PP-OCRv5 text recognition in a Web Worker. The PaddleOCR-VL loopback companion remains an optional experimental fallback behind an explicit installation warning.
