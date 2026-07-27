# Writing Assistant 0.8.1

Version 0.8.1 is a privacy, legal and transparency patch. It does not change storage schema 5 or remove existing browser data.

## Added

- Public legal center under `/legal/`.
- Privacy Policy covering Cloudflare, BYOK AI, Wikimedia and both OCR paths.
- Terms of Use and educational disclaimer.
- Copyright and takedown process.
- Security-reporting guidance.
- Third-party component and external-service page.
- Contact page separating public feedback from sensitive reports.
- Compact policy footer and release checks.

## Corrected

- Removed the outdated statement that the application made no AI API calls.
- Clarified that core practice works without AI while BYOK can make direct user-triggered requests.
- Clarified that Cloudflare or static hosting does not itself determine filing obligations.

## Compatibility

The existing `writing-assistant-v4` localStorage and `writing-assistant-v4-db` IndexedDB data are preserved. The optional advanced OCR companion remains version 0.8.0 and compatible.
