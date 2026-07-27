# Changelog

## 0.7.0 — Folder library and long-text workspace

- Fixed parent-folder material totals, subfolder labels, and recursive card display.

- Added a virtual folder tree while preserving the existing practice-material cards.
- Added built-in IELTS, academic, pharmacy/biomedicine, literature and personal-library folder groups.
- Added local custom-folder creation, rename, deletion and material movement.
- Added document → chapter → batch → unit navigation for long texts.
- Limited each visible batch to at most 45 practice units.
- Added independent Sentence Lab and Paragraph Lab progress for every chapter.
- Added automatic chapter recognition from Markdown and Chapter/Part/Book/Section headings.
- Added safe migration of active 0.6.0 practice into a one-chapter document.
- Upgraded JSON backups to schema 5 with custom folders and chapter progress.
- Preserved the 0.6.0 BYOK AI reference-analysis and copy boundaries.

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
