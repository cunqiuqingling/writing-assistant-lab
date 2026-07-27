# Writing Assistant 0.8.2

Version 0.8.2 adds clearer local-library management and explicit AI credential controls.

## Practice Library

- Replaces the crowded card action row with a visible `•••` management button.
- Keeps only **Sentence practice** and **Paragraph practice** as the primary card actions.
- Adds one management dialog for title editing, document editing, moving and deletion.
- Deleting a user-added material also deletes its saved chapter progress.
- If the deleted material is open in Sentence Lab or Paragraph Lab, that lab is safely returned to its empty state.
- Built-in starter materials cannot be deleted.

## AI settings

- Renames the existing action to **Remove API Key**.
- Adds **Clear all AI configuration and keys**.
- The full-clear action removes the session key, encrypted local key, provider, Base URL, endpoint, model and other saved AI settings.
- Practice data, imported materials, folders, notes, progress and saved AI analysis results are not deleted.
- The cleared state remains unconfigured after reload.

## Clipboard

Writing Assistant does not keep a clipboard or copy-history cache, so no clipboard-clear control is added.

## Compatibility

- Storage schema remains version 5.
- Existing practice data and imported materials are preserved.
- The optional advanced OCR companion remains version 0.8.0 and compatible.
