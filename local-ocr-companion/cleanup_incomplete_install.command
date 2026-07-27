#!/bin/zsh
set -euo pipefail
APP_HOME="$HOME/Library/Application Support/WritingAssistantOCR"
APP_BUNDLE="$HOME/Applications/Writing Assistant Local OCR.app"
echo "这会删除未完成或已安装的高级OCR环境，不会删除Writing Assistant练习数据。"
read "ANSWER?输入 REMOVE 确认清理："
if [[ "$ANSWER" != "REMOVE" ]]; then echo "已取消。"; exit 0; fi
pkill -f "$APP_HOME/server.py" 2>/dev/null || true
rm -rf "$APP_HOME" "$APP_BUNDLE"
echo "高级OCR环境已清理。"
