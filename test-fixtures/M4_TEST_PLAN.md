# Writing Assistant 0.8.0 M4 test plan

## A. Regression checks without installing OCR

1. Start the site from the repository with `python3 -m http.server 8080 --bind 127.0.0.1`.
2. Confirm the badge displays `0.8.0 M4`.
3. Import the M1 EPUB, DOCX and text-layer PDF fixtures.
4. Confirm they behave exactly as in M3 and do not show an unnecessary OCR panel.
5. Confirm folder collapse, public resources, title editing, chapter editing and saved progress remain intact.

## B. Scan detection

1. Import `sample-scanned-image-only.pdf`.
2. Confirm the importer no longer fails with “no text layer”.
3. Confirm the preview reports a scan-like PDF.
4. Confirm the **扫描PDF本地识别** panel appears.
5. Confirm **保存到练习库** remains disabled until readable text exists.

## C. Mock companion flow

Open another Terminal window:

```bash
cd ~/Documents/GitHub/writing-assistant-lab/local-ocr-companion
./start_mock.command
```

Then in the web page:

1. Click **检测连接器**.
2. Allow the browser's local-network/loopback permission if shown.
3. Click **配对连接器** and approve the local page.
4. Enter page `1` and start OCR.
5. Confirm progress moves through render, submit and completion.
6. Confirm the mock text appears as a chapter in the M2 preview.
7. Save it and open Sentence Lab and Paragraph Lab.
8. Confirm the page never sent a request to a non-loopback OCR endpoint.

## D. Authentication and origin boundaries

1. Clear the pairing token from site storage and confirm OCR cannot start.
2. Re-pair and confirm it works again.
3. Open `http://127.0.0.1:8765/` and confirm the dashboard says loopback-only.
4. Confirm a request without a bearer token cannot read an OCR job.
5. Confirm the pairing token is absent from a normal Writing Assistant JSON backup.

## E. Cancellation

1. Start mock OCR for several pages.
2. Click **取消** during processing.
3. Confirm the UI returns to an idle state and does not apply partial results after cancellation.

## F. Real PaddleOCR-VL acceptance on Apple Silicon

After mock mode passes:

1. Stop mock mode.
2. Run `install_macos_apple_silicon.command`.
3. Start the generated app.
4. Detect and pair it from the web page.
5. OCR only page 1 of the scanned fixture first.
6. Allow the first model download/preparation to finish.
7. Confirm real text, not the mock sentence, appears in preview.
8. Review recognition quality and memory/CPU use.
9. Repeat with a personally owned two- or three-page scanned PDF.

Record the Mac model, RAM, macOS version, Python version, install duration, first-load duration and per-page OCR duration. Official documentation currently validates Apple M4; results on M1/M2/M3 should be treated as compatibility feedback.

## G. Final release regression

- AI requests still include only reference text.
- Ordinary copy actions exclude AI analysis.
- Source PDF, rendered page images and OCR text never appear in Cloudflare requests.
- JSON backup contains imported text and local progress but not OCR pairing credentials.
- Static Assets build and the legacy Worker build both include `js/local-ocr.js`.
