# Writing Assistant 0.8.0

Writing Assistant 0.8.0 expands the local-first writing workspace without changing its core privacy model.

## Highlights

- Import TXT, Markdown, EPUB, DOCX and PDF in the browser.
- Preview, rename, reorder, split, merge and revise imported chapters.
- Edit card titles while preserving stable material and progress identifiers.
- Organise long texts with collapsible virtual folders and chapter progress.
- Search user-triggered English Wikipedia and Wikisource resources.
- Extract normal PDF text layers locally with PDF.js.
- Recognise ordinary scanned English text with self-hosted Tesseract.js browser OCR.
- Keep the larger PaddleOCR-VL localhost companion optional and experimental.
- Preserve BYOK boundaries: AI analyses reference text only, never learner writing.

## Privacy

Practice writing, notes, imported files, progress and ordinary backups remain in the visitor's browser. Document parsing and browser OCR run locally. Wikimedia requests occur only after an explicit search or page preview. The optional advanced OCR companion is loopback-only.

## Upgrade

Existing browser data continues to use the established `writing-assistant-v4` localStorage key and `writing-assistant-v4-db` IndexedDB database.

## Deployment

The production site uses Cloudflare Workers Static Assets from `dist/site`. JSZip, Mammoth and PDF.js are copied into the release build as pinned local vendor files.

## Release R1 OCR hardening

The final acceptance pass replaced the remote multi-CDN PaddleOCR.js browser path with self-hosted Tesseract.js 7 and English fast data. This makes first use predictable, exposes real loading progress, adds a 90-second timeout, and keeps all OCR runtime assets on the Writing Assistant origin.
