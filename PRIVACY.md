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
