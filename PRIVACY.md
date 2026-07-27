# Privacy

Writing Assistant is designed as a local-first static web application.

## Data stored on the device

The application may store the following data in the current browser:

- sentence and paragraph practice state;
- user-written answers and analysis notes;
- custom practice-library items;
- virtual practice-library folders and material locations;
- per-document, per-chapter Sentence Lab and Paragraph Lab progress;
- the last selected backup-directory handle, when the browser supports it.

The active interface state uses `localStorage`. Custom library entries, virtual folders, chapter progress and the optional directory handle use IndexedDB.

## Network behavior

The application does not include a cloud database, account system, analytics script or advertising tracker. Optional BYOK AI reference analysis makes a direct browser request only after the visitor configures and starts it. Clicking an external resource link opens that third-party website, which is governed by its own privacy policy.

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

## Folder and chapter backups

Schema 5 backups include custom materials, custom folders and per-chapter progress records. They do not include API keys. Restoring a backup replaces the current local workspace after confirmation.
