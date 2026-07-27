# M3 manual test plan

## A. Folder tree

1. Open Practice Library and confirm every parent folder has a chevron.
2. Collapse `IELTS Writing`; its six child folders disappear but IELTS materials remain visible if IELTS is selected.
3. Expand it again.
4. Collapse `All Materials`; every top-level folder disappears.
5. Refresh the browser and confirm the collapsed state is remembered.
6. Open a hidden descendant through a child-folder tile or document import target and confirm its ancestor chain reopens.
7. Create a custom folder with a child folder and repeat collapse/expand.
8. Export and restore a JSON backup; confirm collapsed state is restored.

## B. Curated resources

1. Click `Online Public Resources`.
2. Confirm no network status appears until a search action is taken.
3. Switch through all four curated groups; each should display 10 entries.
4. Choose a Wikipedia curated item and confirm search results appear.
5. Open the original page link in a new tab.
6. Choose `Preview and save`; confirm the local document preview opens rather than saving immediately.
7. Review title, source, licence, chapters and target folder, then save.
8. Confirm the new card displays the `WIKIPEDIA` tag and opens in both labs.

## C. Wikisource and legal messaging

1. Search Wikisource for a public-domain work.
2. Confirm the UI warns that copyright status varies by work and jurisdiction.
3. Preview a result and verify its source URL is retained.
4. Confirm the preview can remove unwanted navigation-like chapters before saving.

## D. Privacy and failure handling

1. Disable the network and run a search; the modal should show an error without losing local practice data.
2. Start a search and close the modal; the request should cancel.
3. Inspect the request URL: it must target only the allowlisted English Wikipedia/Wikisource API and include `origin=*`.
4. Confirm no learner answer, note, AI key or saved progress appears in the request.
5. Confirm existing EPUB/DOCX/PDF import, card editing, chapter editing and AI reference-only boundaries still work.
