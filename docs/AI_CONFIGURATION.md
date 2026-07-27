# BYOK AI reference-text analysis

Writing Assistant 0.6.0 adds optional AI analysis of the selected reference text without a developer-operated AI backend.

## Exact scope

The AI request contains only the current reference sentence or paragraph. It does not contain or evaluate learner imitation, notes, labels, plans, independent writing or progress.

The existing exercise copy actions never append AI analysis. Analysis is displayed separately and cached locally for the matching reference text.

## Security boundary

- Use a dedicated, low-limit, revocable API key.
- Session-only key storage is the default.
- Optional encrypted storage uses PBKDF2 and AES-GCM.
- The API key is excluded from ordinary backup JSON files.
- The selected reference text is sent directly to the chosen provider.
- Browser CORS policy may block some providers.
- Never commit a real key to GitHub, screenshots, issues or logs.

## Analysis behavior

Sentence analysis covers meaning, grammatical skeleton, clauses, collocations, register, transferable patterns and imitation cautions.

Paragraph analysis covers genre, sentence-function mapping, development, cohesion, high-value language, transferable structure and imitation cautions.
