# Changelog

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
