# Third-party notices

Writing Assistant itself is released under the MIT License. Document import uses the following pinned open-source packages:

- **JSZip 3.10.1** — MIT or GPL-3.0-or-later. Writing Assistant uses it under the MIT option.
- **Mammoth 1.12.0** — BSD-2-Clause.
- **PDF.js / pdfjs-dist 6.1.200** — Apache-2.0.
- **Wrangler 4.114.0** — MIT or Apache-2.0; development and deployment tool only.

After `npm install && npm run vendor`, exact upstream license texts are copied into `vendor/licenses/`.

Do not remove those notices when redistributing a production build that includes the local parser files.

## Wikimedia content and APIs

M3 can retrieve user-selected pages from English Wikipedia and English Wikisource through the MediaWiki Action API. Retrieved page content is not bundled with this repository. Page-specific attribution, licence and public-domain status remain governed by the source page and applicable jurisdiction.

## Optional local OCR dependencies

The M4 companion installer can install PaddlePaddle 3.2.1 and PaddleOCR 3.7.0 with the `doc-parser` extra into an isolated local virtual environment. These packages, their transitive dependencies and downloaded model weights are not embedded in the Writing Assistant web bundle and remain governed by their respective licenses and notices. Review the PaddleOCR/PaddlePaddle project documentation before redistribution.


## PaddleOCR.js

- Package: `@paddleocr/paddleocr-js` 0.4.2
- Purpose: optional, on-demand PP-OCRv5 browser text recognition
- License: Apache License 2.0
- Runtime: Web Worker with ONNX Runtime Web and OpenCV.js managed by the SDK

The SDK and model resources are not loaded when the site first opens. M4-R1 requests them only after the user explicitly starts browser OCR.
