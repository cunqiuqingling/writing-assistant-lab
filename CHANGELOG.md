# Changelog

## 0.8.1 — Privacy, legal and transparency pages

### R1 — Writing philosophy

- Added a dedicated writing-philosophy page for high-quality input, genre diversity, imitation and transfer.
- Added the permanent footer line: Language is information, and information is everything.
- Preserved the central Chinese project sentence in the README and public philosophy page.


- Added a public legal center with privacy, terms, copyright, security, third-party and contact pages.
- Added compact policy links to the main application footer.
- Corrected the obsolete statement that the application made no AI requests.
- Documented Cloudflare metadata, BYOK provider requests, Wikimedia access and both OCR paths.
- Added a copyright/takedown process and private security-reporting boundary.
- Preserved storage schema 5 and all existing local practice data.


## 0.8.0 — Document import, library workspace, public resources and browser OCR

- Added browser-local TXT, Markdown, EPUB, DOCX and PDF import with unified preview.
- Added editable card titles, document metadata and full chapter structure management.
- Added long-text folders, collapsible navigation and chapter-level progress.
- Added user-triggered English Wikipedia and Wikisource resource import.
- Added PDF.js text-layer extraction and self-hosted browser English OCR for scan-like PDFs.
- Kept PaddleOCR-VL as an optional experimental localhost companion behind an installation warning.
- Preserved local-first storage, stable material identifiers, targeted progress reconciliation and BYOK reference-text boundaries.
- Finalised Cloudflare Workers Static Assets deployment with local parser vendor files and production security headers.

### Release R1 fast OCR hardening

- Replaced the slow multi-CDN PaddleOCR.js browser path with self-hosted Tesseract.js 7.
- Limited the default browser OCR to English writing materials.
- Added real loading progress, same-origin runtime assets and a 90-second initialization timeout.
- Kept the larger PaddleOCR-VL localhost companion optional and experimental.

### Browser-first OCR checkpoint

- Added on-demand PP-OCRv5 browser text recognition in a Web Worker.
- Added device-based page limits, cancellation and lower-resolution page rendering.
- Removed the production URL mock path during final release hardening.
- Repaired the optional advanced macOS installer and restricted it to supported Python versions.

## 0.8.0 development checkpoints

## 0.8.0 M4 — Optional loopback PaddleOCR-VL for scanned PDFs

- Kept scan-like PDFs in the import preview instead of rejecting files with no usable text layer.
- Added explicit low-text page selection, browser page rendering and sequential local OCR progress.
- Added a fixed `127.0.0.1:8765` client with loopback request annotation, cancellation and error recovery.
- Added user-confirmed pairing with a random token excluded from normal backups.
- Added a loopback-only Python companion with strict origin checks, bearer authentication, request/queue limits and temporary-image deletion.
- Added a macOS Apple Silicon installer for PaddlePaddle 3.2.1 and PaddleOCR 3.7.0 document-parser dependencies.
- Added mock mode, protocol documentation, a scan-only PDF fixture and an M4 acceptance plan.
- Added deployment permissions-policy headers for modern browser loopback access.

## 0.8.0 M3 — Public resources and collapsible folder navigation

- Added independent expand/collapse controls for every parent folder in the Practice Library sidebar.
- Added the same collapse behavior to the “All Materials” root and persisted the expanded state locally and in backups.
- Added a curated public-resource center with 40 starter searches: 10 each for IELTS Writing, Academic Writing, Pharmacy & Biomedicine, and Literature.
- Added explicit user-triggered search for English Wikipedia and English Wikisource through fixed MediaWiki API endpoints.
- Added local preview and chapter editing before any online page is saved to the Practice Library.
- Added source URL, provider, page ID, revision ID and fetch timestamp metadata for locally saved online pages.
- Added strict remote-content boundaries: no learner writing, notes, AI keys or progress are included in Wikimedia requests.
- Added response limits, request timeouts, cancellation, HTML-to-text sanitisation and source-license reminders.

## 0.8.0 M2 — Editable cards, chapters and safer document revision

- Added local card-title editing for built-in and imported materials.
- Added restore-default-title support for built-in cards without changing public starter data.
- Added post-import document editing for metadata, folders and chapters.
- Added full chapter-text editing, cursor-based splitting, adjacent merging, reordering, removal and ten-step structural undo.
- Added selected word/character counts, estimated sentence and paragraph units, and 45-unit batch estimates.
- Added targeted progress reconciliation: only changed or removed source chapters lose incompatible saved progress.
- Added stronger PDF text-layer quality signals, including mixed-page and probable two-column warnings.
- Added soft warnings before parsing files close to browser memory limits.
- Clarified text-material and EPUB/DOCX/PDF entry points.

## 0.8.0 M1 — Browser document import and static-assets deployment

- Added local EPUB import with OPF/spine chapter extraction.
- Added local DOCX import through Mammoth with heading-aware chapter conversion.
- Added local PDF text-layer extraction through PDF.js, basic reading-order recovery, and scan detection.
- Added a unified local import preview with metadata, chapter selection, renaming, reordering and removal.
- Added drag-and-drop import for EPUB, DOCX, PDF, TXT and Markdown.
- Added pinned parser dependencies with local vendor copies and CDN fallbacks.
- Added a Cloudflare Static Assets build and Wrangler deployment configuration.
- Kept the legacy single-file Worker build available during the 0.8.0 transition.
- Scanned-PDF OCR is intentionally deferred to the optional PaddleOCR-VL local companion checkpoint.


## 0.6.0 — BYOK AI reference-text analysis

- Added user-configured OpenAI-compatible, Gemini and Anthropic adapters.
- Added provider presets for OpenAI, DeepSeek, SiliconFlow, Gemini and Anthropic.
- Added session-only key storage by default and optional PBKDF2 + AES-GCM local encryption.
- AI analyses only the selected reference sentence or paragraph.
- Learner writing, notes, labels, plans and progress are excluded from AI requests.
- Existing exercise copy actions never include AI analysis output.
- Added connection testing, source-request preview, cancellation and locally cached analysis.
- API keys remain separate from ordinary Writing Assistant backup files.
- Preserved the existing v4 browser storage keys for backward compatibility.

## 0.5.0

- Removed the development-stage “V4” suffix from the product name.
- Replaced the crowded top toolbar with a compact Data & Backup menu.
- Renamed “Import backup” to “Restore backup”.
- Added a clear-local-data action with confirmation.
- Reworked Practice Library into a wide, self-contained page.
- Added versioned GitHub Pages project files and a Cloudflare Worker build.
- Added README, privacy notice, MIT license and starter-library data files.
