# Security Policy

## Supported version

The current public release is `0.5.x`.

## Data model

Writing Assistant is a local-first static web application. It has no application backend and no shared user database. Practice data is stored in each visitor's browser.

## Reporting a vulnerability

Please do not publish an exploitable vulnerability, exposed credential or sensitive user data in a public issue.

Contact the repository maintainer privately through the contact method listed on the maintainer's GitHub profile, and include:

- affected version;
- reproduction steps;
- expected and observed behavior;
- potential impact;
- a minimal proof of concept when appropriate.

## Deployment credentials

Cloudflare API tokens, account IDs with write context, private keys and browser backup files must never be committed to the repository.

If CI/CD deployment is added later:

- use a narrowly scoped Cloudflare API token;
- store the token only in GitHub Actions secrets;
- protect the production branch;
- require review before production changes are merged.

## BYOK API-key boundary

Writing Assistant 0.6.0 can make direct browser requests with a visitor-supplied API key. Client-side key storage is not equivalent to a private backend. Users should create a low-limit, revocable key dedicated to this tool and should never paste production, organisational or high-value credentials into an untrusted deployment.

API keys must never be committed to this repository, included in screenshots or issue reports, or added to starter-library data. Reports involving leaked credentials should be handled privately and the affected key should be revoked immediately.

## Imported-document security

- EPUB and DOCX archives are parsed as data; embedded scripts are never executed.
- Converted document HTML is reduced to text and semantic headings before it reaches the application.
- File size, page count, chapter count and extracted-character limits are enforced.
- PDF JavaScript evaluation is disabled in the PDF.js loading options.
- Parser dependencies are pinned to exact versions and should be committed with their license notices for production.
- Do not enable external DOCX file access or EPUB scripting.
## Document revision safety

Document and card editors validate non-empty titles, cap title length, render imported text as text rather than executable HTML, and preserve stable document and chapter identifiers where possible. Structural source changes require confirmation before incompatible local progress records are removed. Built-in title changes are browser-local overrides and never modify the public starter library.

