# Local OCR Companion protocol v1

Default endpoint: `http://127.0.0.1:8765`

## Endpoints

- `GET /api/status` — unauthenticated capability and backend state check.
- `GET /pair?origin=<origin>` — explicit local pairing confirmation page.
- `POST /api/ocr-page` — authenticated asynchronous single-page OCR submission.
- `GET /api/jobs/<id>` — authenticated job polling.
- `POST /api/jobs/<id>/cancel` — authenticated cancellation request.

OCR calls use `Authorization: Bearer <pairing token>`. Page images are submitted as base64-encoded PNG/JPEG in JSON. The server accepts at most three queued/running jobs and executes one inference at a time.

The service binds only to IPv4 loopback. CORS reflects only allowlisted origins and includes the older `Access-Control-Allow-Private-Network: true` compatibility response.
