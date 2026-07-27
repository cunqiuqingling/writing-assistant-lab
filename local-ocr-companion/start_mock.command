#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export WA_OCR_MOCK=1
export WA_OCR_OPEN_DASHBOARD=1
exec python3 "$SCRIPT_DIR/server.py"
