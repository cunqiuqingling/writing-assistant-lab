# Document management — 0.8.0 M2

## Card titles

Every practice card has a title-edit action. Custom-material titles are updated in IndexedDB. Built-in titles use a browser-local override stored in application state, so the public starter library remains unchanged and the default title can be restored.

Changing a card title does not change the material ID, chapter IDs or AI reference-analysis cache key. Loaded workspaces and saved progress metadata are updated to the new display title.

## Reopening imported documents

Imported EPUB, DOCX, PDF, TXT and Markdown cards expose **编辑文档**. The editor can update:

- card title, source, licence/purpose, tags and destination folder;
- chapter titles and inclusion;
- full chapter text;
- chapter order;
- chapter split, merge and removal.

The chapter editor keeps up to ten in-memory structural snapshots for undo while the modal remains open.

## Progress compatibility

A title-only change or chapter reordering preserves progress because document and chapter IDs remain stable. When chapter source text is changed, merged, split or removed, saved answers would no longer refer to the same source unit. M2 detects affected chapter IDs and asks before deleting only those incompatible progress records. Progress belonging to untouched chapters remains.

## Preview metrics

The preview recalculates metrics for selected chapters:

- word and character counts;
- estimated sentence and paragraph units;
- estimated 45-unit batches for each lab.

These are planning estimates, not guarantees, because final unit boundaries depend on the selected Sentence Lab split mode and paragraph normalization.

## PDF quality signals

PDF.js still reads only existing text layers. M2 records low-text pages, median and average page characters, and likely two-column pages. The warnings are heuristic and the visitor should inspect extracted text before saving. OCR remains deferred to the optional local PaddleOCR-VL companion checkpoint.
