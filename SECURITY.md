# Security Policy

## Supported version

The current supported public release is `0.8.1`.

## Architecture

Writing Assistant is a local-first static web application with no shared user database or login backend. Main risks are deployment-account compromise, dependency supply chain, imported-content handling, shared-device browser storage and visitor-supplied API keys.

## Reporting

Do not publish an exploitable vulnerability, exposed credential, identity document or sensitive user data in a public Issue. Use GitHub Private Vulnerability Reporting when available, or a private contact method listed on the maintainer's GitHub profile.

Include affected version, browser, reproduction steps, expected and observed behavior, impact and a minimal proof of concept without live credentials.

## Good-faith boundaries

- Test only systems, data and accounts you control.
- Do not perform denial of service, high-volume scanning, credential attacks, social engineering or third-party testing.
- Do not retain or publish another person's data.
- Stop and report privately if a live credential or sensitive record is encountered.
- Allow a reasonable remediation period before disclosure.

There is no formal bug bounty or guaranteed response time.

## Operational safeguards

Cloudflare, GitHub and domain credentials must never be committed. Maintainers should use passkeys or 2FA, keep recovery codes offline, review diffs before deployment and protect the production branch.

BYOK keys should be low-limit, revocable and dedicated to this tool. Imported and remote content is rendered as text, PDF JavaScript is disabled, parsers are pinned, browser OCR is self-hosted, and advanced OCR is loopback-only.

Public HTML: `/legal/security.html`.
