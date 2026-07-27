# Privacy

Writing Assistant is designed as a local-first static web application.

## Data stored on the device

The application may store the following data in the current browser:

- sentence and paragraph practice state;
- user-written answers and analysis notes;
- custom practice-library items;
- the last selected backup-directory handle, when the browser supports it.

The main practice state uses `localStorage`. Custom library entries and the optional directory handle use IndexedDB.

## Network behavior

The application does not include a cloud database, account system, analytics script, advertising tracker, or AI API call. Clicking an external resource link opens that third-party website, which is governed by its own privacy policy.

## Shared devices

Anyone using the same browser profile on the same device may be able to open the site and see locally stored practice data. Use a separate browser profile, device login, or site-access protection when needed.

## Deleting data

Use **Data & Backup → Clear local practice data**, or clear the site's browser storage manually. Saving a JSON backup first is recommended.


## Live deployment

The official demo is currently hosted at:

`https://writing-assistant.ccwu.cc/`

The application does not send practice text to the project maintainer. Standard infrastructure providers may process ordinary connection metadata such as IP addresses and request headers as part of serving the website.

## Optional BYOK AI reference analysis

AI analysis is disabled until a visitor configures a provider and actively starts a request. The browser sends only the selected reference sentence or paragraph directly to the chosen provider. Learner writing, notes, labels, plans and progress are excluded from the request.

The project maintainer does not operate an AI proxy and does not receive the API key or request body. API keys are excluded from ordinary Writing Assistant backup JSON files. The normal exercise copy actions never include AI analysis output.

## Local document parsing

EPUB, DOCX, PDF, TXT and Markdown files selected for import are read by JavaScript in the visitor's browser. The project maintainer does not receive the source file or extracted text.

The production build can serve pinned local copies of JSZip, Mammoth and PDF.js. During development or when those local files are missing, the interface may load the same pinned parser code from jsDelivr. Loading a library from the CDN sends an ordinary library request to the CDN, but Writing Assistant does not send the selected document or extracted text with that request.

PDF.js extracts existing PDF text layers directly in the browser. Scan-like PDFs may optionally use the M4 Local OCR companion after separate installation, browser permission and pairing.
## Local document edits in 0.8.0 M2

Card-title overrides, edited metadata and chapter text remain in the visitor's own browser storage and ordinary local backups. Editing a document never uploads its source text to the project maintainer. When source chapter text changes, Writing Assistant may remove only local progress records that no longer match that chapter, after explicit confirmation.


## Wikimedia requests in M3

Opening the online-resource center does not make a request. When the user explicitly searches or previews a page, the browser sends the search term or selected page title directly to English Wikipedia or English Wikisource. Writing Assistant does not proxy the request. Learner writing, notes, progress, AI keys and AI analysis are excluded. Imported text remains local unless the user separately exports or backs it up.

## Local OCR companion in M4

The Local OCR companion is optional and runs on the visitor’s own computer at `http://127.0.0.1:8765`. Writing Assistant does not upload scanned pages to Cloudflare, GitHub or a maintainer-operated OCR endpoint. Only PDF pages explicitly selected by the visitor are rendered into temporary images and sent to loopback. The companion deletes those temporary images after processing.

A random pairing token is stored by the local companion and in the current browser's local storage. It is excluded from ordinary Writing Assistant JSON backups. OCR requests do not contain learner writing, notes, AI keys, AI analysis or unrelated practice progress. Modern Chromium browsers may ask for permission before the official HTTPS site can connect to loopback.


## Browser OCR

Browser OCR loads only after explicit user action. PDF page images and OCR results remain in the current browser. The optional advanced companion is a separate loopback-only path selected by the user.
