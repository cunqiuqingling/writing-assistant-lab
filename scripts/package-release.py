#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "release-assets"
SITE = ROOT / "dist" / "site"
COMPANION = ROOT / "local-ocr-companion"

def zip_folder(folder: Path, output: Path, top_name: str) -> None:
    if output.exists():
        output.unlink()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(folder.rglob("*")):
            if not path.is_file() or "__pycache__" in path.parts or path.suffix == ".pyc":
                continue
            info = zipfile.ZipInfo.from_file(
                path,
                arcname=str(Path(top_name) / path.relative_to(folder)),
            )
            info.compress_type = zipfile.ZIP_DEFLATED
            with path.open("rb") as source:
                archive.writestr(info, source.read())

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

if not (SITE / "index.html").exists():
    raise SystemExit("dist/site is missing. Run npm run build:release first.")

OUT.mkdir(parents=True, exist_ok=True)
site_zip = OUT / "writing-assistant-0.8.2-r1-static-site.zip"
companion_zip = OUT / "WritingAssistant-Advanced-Local-OCR-macOS-Apple-Silicon-0.8.0.zip"

zip_folder(SITE, site_zip, "writing-assistant-0.8.2-r1-static-site")
zip_folder(COMPANION, companion_zip, "WritingAssistant-Advanced-Local-OCR-macOS-Apple-Silicon-0.8.0")

notes = ROOT / "RELEASE_NOTES_0.8.2-r1.md"
if notes.exists():
    shutil.copy2(notes, OUT / notes.name)

artifacts = [site_zip, companion_zip]
if (OUT / notes.name).exists():
    artifacts.append(OUT / notes.name)

(OUT / "SHA256SUMS.txt").write_text(
    "\n".join(f"{sha256(path)}  {path.name}" for path in artifacts) + "\n",
    encoding="utf-8",
)

manifest = {
    "version": "0.8.2-r1",
    "advancedOcrCompanionVersion": "0.8.0",
    "artifacts": [
        {"file": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)}
        for path in artifacts
    ],
}
(OUT / "release-manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(f"Prepared release assets in {OUT}")
