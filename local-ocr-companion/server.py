#!/usr/bin/env python3
"""Writing Assistant Local OCR Companion.

A loopback-only bridge between the Writing Assistant web UI and a locally
installed PaddleOCR-VL pipeline. The server intentionally uses only Python's
standard library so the only heavy optional dependency is PaddleOCR itself.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import html
import json
import mimetypes
import os
import re
import secrets
import shutil
import signal
import sys
import tempfile
import threading
import time
import traceback
import urllib.parse
import uuid
import webbrowser
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterable

SERVICE_NAME = "Writing Assistant Local OCR"
SERVICE_VERSION = "0.8.0"
HOST = "127.0.0.1"
DEFAULT_PORT = 8765
MAX_REQUEST_BYTES = 18 * 1024 * 1024
MAX_RESULT_CHARS = 2_000_000
JOB_RETENTION_SECONDS = 45 * 60
TOKEN_BYTES = 32

APP_HOME = Path(
    os.environ.get(
        "WA_OCR_HOME",
        Path.home() / "Library" / "Application Support" / "WritingAssistantOCR",
    )
).expanduser()
TOKEN_PATH = APP_HOME / "pairing-token.txt"
TEMP_ROOT = APP_HOME / "tmp"

PRODUCTION_ORIGINS = {
    "https://writing-assistant.ccwu.cc",
}
LOCAL_ORIGIN_RE = re.compile(
    r"^http://(?:127(?:\.\d{1,3}){3}|localhost|\[::1\])(?::\d{1,5})?$",
    re.IGNORECASE,
)


def _now() -> float:
    return time.time()


def _json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\x00", "").strip()


def _allowed_extra_origins() -> set[str]:
    raw = os.environ.get("WA_OCR_ALLOWED_ORIGINS", "")
    return {item.strip().rstrip("/") for item in raw.split(",") if item.strip()}


def origin_allowed(origin: str | None) -> bool:
    if not origin:
        # Requests without Origin are allowed only because the service binds to
        # loopback. This supports curl, the local dashboard and health checks.
        return True
    normalized = origin.rstrip("/")
    return (
        normalized in PRODUCTION_ORIGINS
        or normalized in _allowed_extra_origins()
        or bool(LOCAL_ORIGIN_RE.fullmatch(normalized))
    )


def ensure_token() -> str:
    APP_HOME.mkdir(parents=True, exist_ok=True)
    TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(APP_HOME, 0o700)
        os.chmod(TEMP_ROOT, 0o700)
    except OSError:
        pass
    if TOKEN_PATH.exists():
        token = TOKEN_PATH.read_text(encoding="utf-8").strip()
        if len(token) >= 40:
            return token
    token = secrets.token_urlsafe(TOKEN_BYTES)
    TOKEN_PATH.write_text(token + "\n", encoding="utf-8")
    try:
        os.chmod(TOKEN_PATH, 0o600)
    except OSError:
        pass
    return token


PAIRING_TOKEN = ensure_token()


@dataclass
class Job:
    id: str
    page_number: int
    created_at: float = field(default_factory=_now)
    updated_at: float = field(default_factory=_now)
    status: str = "queued"
    stage: str = "queued"
    progress: int = 0
    error: str = ""
    text: str = ""
    markdown: str = ""
    engine: str = ""
    cancel_requested: bool = False
    image_path: str = ""

    def public(self, include_result: bool = True) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": self.id,
            "pageNumber": self.page_number,
            "status": self.status,
            "stage": self.stage,
            "progress": self.progress,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "cancelRequested": self.cancel_requested,
        }
        if self.error:
            payload["error"] = self.error
        if self.engine:
            payload["engine"] = self.engine
        if include_result and self.status == "done":
            payload["text"] = self.text
            payload["markdown"] = self.markdown
        return payload


JOBS: dict[str, Job] = {}
JOBS_LOCK = threading.RLock()
OCR_SEMAPHORE = threading.Semaphore(1)


class BackendState:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.pipeline: Any = None
        self.state = "not-loaded"
        self.error = ""
        self.engine = "PaddleOCR-VL"
        self.pipeline_version = os.environ.get("WA_OCR_PIPELINE_VERSION", "v1.6")
        self.mock = os.environ.get("WA_OCR_MOCK", "").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        if self.mock:
            self.state = "ready"
            self.engine = "Mock OCR"

    def status(self) -> dict[str, Any]:
        with self.lock:
            return {
                "state": self.state,
                "error": self.error,
                "engine": self.engine,
                "pipelineVersion": self.pipeline_version,
                "mock": self.mock,
            }

    def _load_pipeline(self) -> Any:
        if self.mock:
            return None
        with self.lock:
            if self.pipeline is not None:
                return self.pipeline
            if self.state == "loading":
                # Another job should not reach this branch because OCR execution
                # is serialized, but keeping the state explicit helps diagnostics.
                raise RuntimeError("OCR model is already loading")
            self.state = "loading"
            self.error = ""
        try:
            from paddleocr import PaddleOCRVL  # type: ignore

            kwargs: dict[str, Any] = {
                "device": "cpu",
                "pipeline_version": self.pipeline_version,
            }
            try:
                pipeline = PaddleOCRVL(**kwargs)
            except TypeError:
                # Older compatible releases may not expose pipeline_version.
                pipeline = PaddleOCRVL(device="cpu")
            with self.lock:
                self.pipeline = pipeline
                self.state = "ready"
                self.engine = f"PaddleOCR-VL {self.pipeline_version}"
            return pipeline
        except Exception as exc:  # pragma: no cover - depends on local runtime
            with self.lock:
                self.state = "error"
                self.error = _safe_text(exc) or exc.__class__.__name__
            raise

    @staticmethod
    def _strings_from_object(value: Any, depth: int = 0) -> Iterable[str]:
        if depth > 5 or value is None:
            return []
        if isinstance(value, str):
            return [value]
        if isinstance(value, dict):
            priority = (
                "markdown",
                "text",
                "content",
                "rec_text",
                "block_content",
                "parsing_res_list",
                "layout_parsing_result",
            )
            found: list[str] = []
            for key in priority:
                if key in value:
                    found.extend(BackendState._strings_from_object(value[key], depth + 1))
            if found:
                return found
            for child in value.values():
                found.extend(BackendState._strings_from_object(child, depth + 1))
            return found
        if isinstance(value, (list, tuple)):
            found: list[str] = []
            for child in value:
                found.extend(BackendState._strings_from_object(child, depth + 1))
            return found
        for attr in ("json", "res", "result", "data", "markdown", "text"):
            try:
                child = getattr(value, attr)
            except Exception:
                continue
            if callable(child):
                try:
                    child = child()
                except Exception:
                    continue
            found = list(BackendState._strings_from_object(child, depth + 1))
            if found:
                return found
        return []

    @staticmethod
    def _read_markdown_files(output_dir: Path) -> str:
        parts: list[str] = []
        for path in sorted(output_dir.rglob("*.md")):
            try:
                value = path.read_text(encoding="utf-8", errors="replace").strip()
            except OSError:
                continue
            if value:
                parts.append(value)
        return "\n\n".join(parts).strip()

    def recognise(self, image_path: Path, page_number: int) -> tuple[str, str, str]:
        if self.mock:
            value = (
                f"# OCR Page {page_number}\n\n"
                "This is a local mock OCR result used to verify the Writing "
                "Assistant companion protocol."
            )
            return value.replace("# OCR Page %d\n\n" % page_number, ""), value, self.engine

        pipeline = self._load_pipeline()
        output_dir = Path(tempfile.mkdtemp(prefix="result-", dir=TEMP_ROOT))
        results: list[Any] = []
        try:
            prediction = pipeline.predict(str(image_path))
            for result in prediction:
                results.append(result)
                try:
                    result.save_to_markdown(save_path=output_dir)
                except Exception:
                    # Extraction below still tries structured result attributes.
                    pass

            markdown = self._read_markdown_files(output_dir)
            if not markdown:
                candidates: list[str] = []
                for result in results:
                    candidates.extend(self._strings_from_object(result))
                markdown = "\n\n".join(
                    item.strip() for item in candidates if _safe_text(item)
                ).strip()
            if not markdown:
                raise RuntimeError("PaddleOCR-VL returned no readable text")
            markdown = markdown[:MAX_RESULT_CHARS]
            plain = re.sub(r"```[\s\S]*?```", " ", markdown)
            plain = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", plain)
            plain = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", plain)
            plain = re.sub(r"^#{1,6}\s*", "", plain, flags=re.MULTILINE)
            plain = re.sub(r"[*_~`]+", "", plain)
            plain = re.sub(r"\n{3,}", "\n\n", plain).strip()
            if not plain:
                plain = markdown
            return plain[:MAX_RESULT_CHARS], markdown, self.engine
        finally:
            shutil.rmtree(output_dir, ignore_errors=True)


BACKEND = BackendState()


def _cleanup_jobs() -> None:
    cutoff = _now() - JOB_RETENTION_SECONDS
    with JOBS_LOCK:
        stale = [
            job_id
            for job_id, job in JOBS.items()
            if job.updated_at < cutoff and job.status in {"done", "error", "cancelled"}
        ]
        for job_id in stale:
            job = JOBS.pop(job_id, None)
            if job and job.image_path:
                try:
                    Path(job.image_path).unlink(missing_ok=True)
                except OSError:
                    pass


def _run_job(job_id: str) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        return
    try:
        with OCR_SEMAPHORE:
            with JOBS_LOCK:
                if job.cancel_requested:
                    job.status = "cancelled"
                    job.stage = "cancelled"
                    job.updated_at = _now()
                    return
                job.status = "running"
                job.stage = "loading-model"
                job.progress = 10
                job.updated_at = _now()
            text_value, markdown, engine = BACKEND.recognise(
                Path(job.image_path), job.page_number
            )
            with JOBS_LOCK:
                if job.cancel_requested:
                    job.status = "cancelled"
                    job.stage = "cancelled"
                    job.progress = 100
                else:
                    job.status = "done"
                    job.stage = "complete"
                    job.progress = 100
                    job.text = text_value
                    job.markdown = markdown
                    job.engine = engine
                job.updated_at = _now()
    except Exception as exc:  # pragma: no cover - depends on local inference
        traceback.print_exc()
        with JOBS_LOCK:
            job.status = "error"
            job.stage = "error"
            job.error = _safe_text(exc) or exc.__class__.__name__
            job.updated_at = _now()
    finally:
        if job.image_path:
            try:
                Path(job.image_path).unlink(missing_ok=True)
            except OSError:
                pass


def _decode_image(payload: dict[str, Any], job_id: str) -> Path:
    image_base64 = _safe_text(payload.get("imageBase64"))
    if not image_base64:
        raise ValueError("imageBase64 is required")
    if "," in image_base64 and image_base64.startswith("data:"):
        image_base64 = image_base64.split(",", 1)[1]
    try:
        raw = base64.b64decode(image_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 image") from exc
    if not raw or len(raw) > MAX_REQUEST_BYTES:
        raise ValueError("Image is empty or exceeds the per-page limit")
    mime_type = _safe_text(payload.get("mimeType")).lower()
    extension = mimetypes.guess_extension(mime_type) or ".png"
    if extension not in {".png", ".jpg", ".jpeg", ".webp"}:
        extension = ".png"
    digest = hashlib.sha256(raw).hexdigest()[:12]
    path = TEMP_ROOT / f"page-{job_id}-{digest}{extension}"
    path.write_bytes(raw)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return path


class CompanionHandler(BaseHTTPRequestHandler):
    server_version = "WritingAssistantOCR/0.8"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        # Do not log request bodies or extracted text.
        sys.stderr.write("[WA OCR] %s - %s\n" % (self.address_string(), fmt % args))

    def _origin(self) -> str:
        return self.headers.get("Origin", "").rstrip("/")

    def _cors_headers(self) -> dict[str, str]:
        origin = self._origin()
        headers = {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, X-WA-Client",
            "Access-Control-Max-Age": "600",
            # Kept for browsers that still implement the older PNA preflight.
            "Access-Control-Allow-Private-Network": "true",
            "Vary": "Origin",
        }
        if origin and origin_allowed(origin):
            headers["Access-Control-Allow-Origin"] = origin
        return headers

    def _send(
        self,
        status: int,
        body: bytes,
        content_type: str,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.send_response(status)
        headers = self._cors_headers()
        if extra_headers:
            headers.update(extra_headers)
        headers["Content-Type"] = content_type
        headers["Content-Length"] = str(len(body))
        headers["Connection"] = "close"
        for key, value in headers.items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _send_json(self, status: int, value: Any) -> None:
        self._send(status, _json_bytes(value), "application/json; charset=utf-8")

    def _send_error_json(self, status: int, message: str) -> None:
        self._send_json(status, {"ok": False, "error": message})

    def _origin_guard(self) -> bool:
        origin = self._origin()
        if origin and not origin_allowed(origin):
            self._send_error_json(HTTPStatus.FORBIDDEN, "Origin is not allowed")
            return False
        return True

    def _auth_guard(self) -> bool:
        if not self._origin_guard():
            return False
        header = self.headers.get("Authorization", "")
        scheme, _, supplied = header.partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(
            supplied.strip(), PAIRING_TOKEN
        ):
            self._send_error_json(HTTPStatus.UNAUTHORIZED, "Pairing token required")
            return False
        return True

    def _read_json(self) -> dict[str, Any]:
        raw_length = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_length)
        except ValueError as exc:
            raise ValueError("Invalid Content-Length") from exc
        if length <= 0 or length > MAX_REQUEST_BYTES * 2:
            raise ValueError("Request body is empty or too large")
        raw = self.rfile.read(length)
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("Invalid JSON body") from exc
        if not isinstance(value, dict):
            raise ValueError("JSON object required")
        return value

    def do_OPTIONS(self) -> None:  # noqa: N802
        if not self._origin_guard():
            return
        self._send(HTTPStatus.NO_CONTENT, b"", "text/plain; charset=utf-8")

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_GET(self) -> None:  # noqa: N802
        _cleanup_jobs()
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/":
            self._dashboard()
            return
        if path == "/pair":
            self._pair_page(parsed.query)
            return
        if path == "/api/status":
            if not self._origin_guard():
                return
            with JOBS_LOCK:
                busy = any(job.status in {"queued", "running"} for job in JOBS.values())
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": SERVICE_NAME,
                    "version": SERVICE_VERSION,
                    "host": HOST,
                    "port": self.server.server_port,
                    "loopbackOnly": True,
                    "busy": busy,
                    "backend": BACKEND.status(),
                    "capabilities": {
                        "ocrPage": True,
                        "asyncJobs": True,
                        "maxImageBytes": MAX_REQUEST_BYTES,
                    },
                },
            )
            return
        match = re.fullmatch(r"/api/jobs/([a-f0-9-]+)", path)
        if match:
            if not self._auth_guard():
                return
            with JOBS_LOCK:
                job = JOBS.get(match.group(1))
                if not job:
                    self._send_error_json(HTTPStatus.NOT_FOUND, "Job not found")
                    return
                payload = job.public(include_result=True)
            self._send_json(HTTPStatus.OK, {"ok": True, "job": payload})
            return
        self._send_error_json(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:  # noqa: N802
        _cleanup_jobs()
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/api/ocr-page":
            if not self._auth_guard():
                return
            try:
                payload = self._read_json()
                page_number = max(1, int(payload.get("pageNumber") or 1))
                job_id = str(uuid.uuid4())
                image_path = _decode_image(payload, job_id)
            except (ValueError, TypeError) as exc:
                self._send_error_json(HTTPStatus.BAD_REQUEST, _safe_text(exc))
                return
            job = Job(
                id=job_id,
                page_number=page_number,
                image_path=str(image_path),
            )
            with JOBS_LOCK:
                active = sum(
                    1 for existing in JOBS.values() if existing.status in {"queued", "running"}
                )
                if active >= 3:
                    image_path.unlink(missing_ok=True)
                    self._send_error_json(
                        HTTPStatus.TOO_MANY_REQUESTS,
                        "Too many OCR jobs are already queued",
                    )
                    return
                JOBS[job_id] = job
            thread = threading.Thread(
                target=_run_job,
                args=(job_id,),
                daemon=True,
                name=f"wa-ocr-{job_id[:8]}",
            )
            thread.start()
            self._send_json(
                HTTPStatus.ACCEPTED,
                {"ok": True, "job": job.public(include_result=False)},
            )
            return
        match = re.fullmatch(r"/api/jobs/([a-f0-9-]+)/cancel", path)
        if match:
            if not self._auth_guard():
                return
            with JOBS_LOCK:
                job = JOBS.get(match.group(1))
                if not job:
                    self._send_error_json(HTTPStatus.NOT_FOUND, "Job not found")
                    return
                job.cancel_requested = True
                if job.status == "queued":
                    job.status = "cancelled"
                    job.stage = "cancelled"
                    job.progress = 100
                job.updated_at = _now()
            self._send_json(HTTPStatus.OK, {"ok": True, "job": job.public(False)})
            return
        self._send_error_json(HTTPStatus.NOT_FOUND, "Not found")

    def _dashboard(self) -> None:
        status = BACKEND.status()
        state_label = {
            "ready": "Ready",
            "loading": "Loading model",
            "error": "Dependency or model error",
            "not-loaded": "Model loads on first OCR",
        }.get(status["state"], status["state"])
        body = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(SERVICE_NAME)}</title><style>
body{{margin:0;background:#f5f7fb;color:#182033;font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
main{{max-width:680px;margin:48px auto;padding:0 20px}}section{{background:white;border:1px solid #dce3ef;border-radius:18px;padding:24px;box-shadow:0 18px 50px rgba(28,45,80,.08)}}
h1{{font-size:24px;margin:0 0 8px}}p{{line-height:1.65;color:#5b6678}}.status{{display:flex;gap:10px;align-items:center;padding:14px;border-radius:12px;background:#f7f9fc}}.dot{{width:10px;height:10px;border-radius:50%;background:#30b86c}}code{{background:#eef2f8;padding:2px 6px;border-radius:6px}}small{{color:#8a94a6}}</style></head>
<body><main><section><h1>{html.escape(SERVICE_NAME)}</h1><p>This companion is running only on <code>127.0.0.1:{self.server.server_port}</code>. Return to Writing Assistant and use “Pair local OCR”.</p>
<div class="status"><span class="dot"></span><div><strong>{html.escape(state_label)}</strong><br><small>{html.escape(status['engine'])} · {html.escape(SERVICE_VERSION)}</small></div></div>
<p>No PDF or OCR text is uploaded to Cloudflare or GitHub. Closing this app stops the local service.</p></section></main></body></html>"""
        self._send(
            HTTPStatus.OK,
            body.encode("utf-8"),
            "text/html; charset=utf-8",
            {"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'"},
        )

    def _pair_page(self, query: str) -> None:
        values = urllib.parse.parse_qs(query)
        target_origin = (values.get("origin") or [""])[0].rstrip("/")
        if not target_origin or not origin_allowed(target_origin):
            self._send(
                HTTPStatus.FORBIDDEN,
                b"Pairing origin is not allowed.",
                "text/plain; charset=utf-8",
            )
            return
        token_json = json.dumps(PAIRING_TOKEN)
        origin_json = json.dumps(target_origin)
        service_json = json.dumps(f"http://{HOST}:{self.server.server_port}")
        body = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>连接 Writing Assistant 本地 OCR</title><style>
body{{margin:0;background:#f5f7fb;color:#182033;font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}main{{max-width:560px;margin:50px auto;padding:0 20px}}section{{background:#fff;border:1px solid #dce3ef;border-radius:20px;padding:28px;box-shadow:0 20px 55px rgba(28,45,80,.1)}}h1{{font-size:23px;margin:0 0 12px}}p{{line-height:1.65;color:#5b6678}}button{{width:100%;border:0;border-radius:12px;padding:13px;background:#3658e8;color:#fff;font:700 15px inherit;cursor:pointer}}small{{display:block;margin-top:14px;color:#8a94a6;line-height:1.55}}</style></head>
<body><main><section><h1>允许网页连接本地 OCR？</h1><p>连接仅授权给 <strong>{html.escape(target_origin)}</strong>。网页随后可以把你主动选择的扫描 PDF 页面发送到本机 PaddleOCR-VL；数据不会经过 Cloudflare。</p><button id="pair">允许并返回 Writing Assistant</button><small>配对令牌保存在本机和当前浏览器中，不会进入普通 JSON 备份。</small></section></main>
<script>document.getElementById('pair').addEventListener('click',function(){{if(!window.opener){{alert('请从 Writing Assistant 网页中的“配对连接器”按钮打开此页面。');return;}}window.opener.postMessage({{type:'writing-assistant-local-ocr-paired',token:{token_json},serviceUrl:{service_json}}},{origin_json});window.close();}});</script></body></html>"""
        self._send(
            HTTPStatus.OK,
            body.encode("utf-8"),
            "text/html; charset=utf-8",
            {
                "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
                "Cross-Origin-Opener-Policy": "unsafe-none",
            },
        )


class LoopbackServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> int:
    port = int(os.environ.get("WA_OCR_PORT", DEFAULT_PORT))
    if port < 1024 or port > 65535:
        raise SystemExit("WA_OCR_PORT must be between 1024 and 65535")
    server = LoopbackServer((HOST, port), CompanionHandler)

    def stop_server(_signum: int, _frame: Any) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop_server)
    signal.signal(signal.SIGINT, stop_server)
    print(f"{SERVICE_NAME} {SERVICE_VERSION}")
    print(f"Listening on http://{HOST}:{port}")
    print("Only loopback connections are accepted.")
    if BACKEND.mock:
        print("Mock OCR backend enabled.")
    if os.environ.get("WA_OCR_OPEN_DASHBOARD", "").lower() in {"1", "true", "yes"}:
        threading.Timer(0.8, lambda: webbrowser.open(f"http://{HOST}:{port}/")).start()
    try:
        server.serve_forever(poll_interval=0.25)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
