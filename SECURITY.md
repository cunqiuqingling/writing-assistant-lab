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
