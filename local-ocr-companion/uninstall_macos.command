#!/bin/zsh
set -euo pipefail
pkill -f "$HOME/Library/Application Support/WritingAssistantOCR/server.py" 2>/dev/null || true
rm -rf "$HOME/Library/Application Support/WritingAssistantOCR"
rm -rf "$HOME/Applications/Writing Assistant Local OCR.app"
echo "Writing Assistant Local OCR has been removed."
read "REPLY?Press Return to close..."
