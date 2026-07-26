# Writing Assistant

> **Sentence → Paragraph → Independent Writing**

A local-first English writing practice studio. It helps learners move from sentence imitation to paragraph development and independent writing without requiring an account, backend database, or AI API.

**Live demo:** https://writing-assistant.ccwu.cc/

[中文说明](README.zh-CN.md)

![Writing Assistant interface](assets/screenshot.png)

## Why this project

Many learners are asked to write full essays before they have been trained to build clear sentences and logically developed paragraphs. Writing Assistant separates those skills into a gradual path:

1. observe and imitate useful sentence structures;
2. identify how each sentence functions inside a paragraph;
3. build a paragraph from claim, reason, mechanism, example and qualification;
4. move toward independent writing;
5. copy the learner's own work into a GPT conversation for feedback and rewriting.

## Features

- **Sentence Lab** — precise copying, structural imitation, automatic text splitting, local rule-based analysis, and copy-ready feedback prompts.
- **Paragraph Lab** — sentence-function labeling, guided paragraph planning, skeleton transfer, and independent paragraph writing.
- **Practice Library** — original starter materials plus local TXT, Markdown and JSON imports.
- **Local-first storage** — practice state stays in the visitor's own browser; optional JSON backup and restore.
- **No AI key required** — the site generates structured text that can be pasted into a ChatGPT conversation of the learner's choice.
- **No account required** — each visitor receives an independent local workspace.

## Privacy and security model

The public website contains only the application code and built-in practice materials.

- Practice text, answers, notes and custom materials are stored in the visitor's browser using `localStorage` and `IndexedDB`.
- One visitor cannot see another visitor's local practice data.
- The project does not include a cloud database, analytics script or API endpoint for modifying the deployed site.
- Changes made through browser developer tools affect only that visitor's current browser session.
- Publishing this repository does not give contributors access to the maintainer's Cloudflare account.
- A change affects the live Cloudflare site only after an authorized maintainer deploys a new Worker version, or after an explicitly configured trusted CI/CD workflow deploys it.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Run locally

A local web server is recommended because browser security restrictions may block some features when `index.html` is opened directly.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy to GitHub Pages

1. Upload this project to a GitHub repository.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`.
5. Save and open the generated Pages URL.

GitHub Pages is optional. The repository can also use the Cloudflare deployment above as its main live demo.

## Deploy as a Cloudflare Worker

A copy-paste Worker build is included:

```text
dist/writing-assistant-worker.js
```

To rebuild it after editing the source project:

```bash
npm run build:worker
```

Paste the generated Worker into the Cloudflare editor and deploy.

## Repository suggestions

- Repository name: `writing-assistant-lab`
- Description: `Local-first English writing practice: Sentence → Paragraph → Independent Writing`
- Website: `https://writing-assistant.ccwu.cc/`
- Topics: `english-writing`, `ielts`, `writing-practice`, `local-first`, `vanilla-javascript`, `cloudflare-workers`

## Content and copyright

Starter IELTS-style texts are original practice materials and are not official IELTS model answers. Users are responsible for verifying the copyright status of imported material. Do not redistribute copyrighted essays or books without permission.

## Contributing

Bug reports and focused improvements are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests do not change the live website unless the maintainer reviews, merges and deploys them.

## License

Code is released under the [MIT License](LICENSE). Included original starter materials are licensed for use with this project; attribution is appreciated. Third-party imported material remains subject to its own copyright and license.
