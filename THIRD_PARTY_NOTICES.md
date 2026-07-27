# Third-party notices

Writing Assistant itself is released under the MIT License. Document import uses the following pinned open-source packages:

- **JSZip 3.10.1** — MIT or GPL-3.0-or-later. Writing Assistant uses it under the MIT option.
- **Mammoth 1.12.0** — BSD-2-Clause.
- **PDF.js / pdfjs-dist 6.1.200** — Apache-2.0.
- **Wrangler 4.114.0** — MIT or Apache-2.0; development and deployment tool only.

After `npm install && npm run vendor`, exact upstream license texts are copied into `vendor/licenses/`.

Do not remove those notices when redistributing a production build that includes the local parser files.
