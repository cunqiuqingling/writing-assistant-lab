# Cloudflare Static Assets deployment

Writing Assistant 0.8.0 begins moving away from the copy-paste, single-file Worker because document parsers are large static files.

## Build

```bash
npm install
npm run build:site:full
```

This performs two steps:

1. copies pinned JSZip, Mammoth and PDF.js browser files into `vendor/`;
2. builds the deployable site in `dist/site/`.

## Local Cloudflare preview

```bash
npm run dev
```

Wrangler serves the same static-assets structure used in production.

## Deploy

```bash
npm run deploy
```

The first deployment may ask you to sign in to Cloudflare. The existing custom domain remains controlled in the Cloudflare dashboard. Verify the deployment target before confirming.

## Legacy fallback

```bash
npm run build:worker
```

This still generates `dist/writing-assistant-worker.txt`. It intentionally does not embed the large parser libraries and therefore uses pinned CDN fallbacks for document parsing. It is retained during the 0.8.0 transition, not as the preferred final deployment method.
