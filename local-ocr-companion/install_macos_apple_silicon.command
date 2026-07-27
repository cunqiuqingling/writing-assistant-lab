#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_HOME="$HOME/Library/Application Support/WritingAssistantOCR"
VENV="$APP_HOME/venv"
APP_BUNDLE="$HOME/Applications/Writing Assistant Local OCR.app"
LOG_FILE="$APP_HOME/install.log"
PYTHON_BIN="${WA_OCR_PYTHON:-python3}"

pause() { echo; read "REPLY?按回车键关闭窗口..."; }
on_exit() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    echo
    echo "安装未完成（错误代码 $exit_code）。"
    echo "日志：$LOG_FILE"
    echo "可以运行 cleanup_incomplete_install.command 清理不完整环境。"
    pause
  fi
}
trap on_exit EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then echo "此安装器只适用于macOS。"; exit 1; fi
if [[ "$(uname -m)" != "arm64" ]]; then echo "此安装器只适用于Apple Silicon（arm64）。"; exit 1; fi
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then echo "没有找到Python 3.10–3.12。建议安装Python 3.12后重试。"; exit 1; fi

PY_VERSION="$($PYTHON_BIN - <<'PY_VERSION_CHECK'
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}")
if sys.version_info.major != 3 or not (10 <= sys.version_info.minor <= 12):
    raise SystemExit(1)
PY_VERSION_CHECK
)" || { echo "当前Python版本不受此安装器支持。请使用Python 3.10、3.11或3.12；不要使用Python 3.13。"; exit 1; }

MEM_GB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1024 / 1024 / 1024 ))
FREE_KB=$(df -Pk "$HOME" | awk 'NR==2 {print $4}')
FREE_GB=$(( FREE_KB / 1024 / 1024 ))

echo "Writing Assistant 高级本地OCR安装器 · M4-R1"
echo "Python：$PYTHON_BIN ($PY_VERSION)"
echo "内存：约 ${MEM_GB} GB"
echo "可用磁盘：约 ${FREE_GB} GB"
echo "安装位置：$APP_HOME"
echo
echo "重要提醒："
echo "  • 普通扫描文字应优先使用网页中的浏览器OCR，无需安装。"
echo "  • 此高级组件会安装独立Python环境和PaddleOCR-VL。"
echo "  • 下载、安装和首次模型准备可能耗时较长。"
echo "  • 会占用较多磁盘、内存和处理器资源。"
echo "  • 安装失败不会影响Writing Assistant其他功能。"
echo
if (( MEM_GB > 0 && MEM_GB < 8 )); then echo "当前内存低于8 GB，不建议安装高级组件。"; fi
if (( FREE_GB > 0 && FREE_GB < 8 )); then echo "可用磁盘低于8 GB，停止安装。"; exit 1; fi
read "ANSWER?确认继续安装高级OCR？请输入 INSTALL："
if [[ "$ANSWER" != "INSTALL" ]]; then echo "已取消。请返回网站使用浏览器OCR。"; trap - EXIT; exit 0; fi

echo
echo "选择模型下载源："
echo "  1) BOS（中国大陆通常更合适，默认）"
echo "  2) ModelScope"
echo "  3) Hugging Face"
echo "  4) AIStudio"
read "SOURCE_CHOICE?请输入 1–4 [1]："
case "${SOURCE_CHOICE:-1}" in
  2) MODEL_SOURCE="modelscope" ;;
  3) MODEL_SOURCE="huggingface" ;;
  4) MODEL_SOURCE="aistudio" ;;
  *) MODEL_SOURCE="bos" ;;
esac

mkdir -p "$APP_HOME" "$HOME/Applications"
chmod 700 "$APP_HOME" || true
exec > >(tee -a "$LOG_FILE") 2>&1
cp "$SCRIPT_DIR/server.py" "$APP_HOME/server.py"
cp "$SCRIPT_DIR/README.zh-CN.md" "$APP_HOME/README.zh-CN.md"
echo "$MODEL_SOURCE" > "$APP_HOME/model-source.txt"

retry() {
  local attempts=3
  local count=1
  until "$@"; do
    local exit_code=$?
    if (( count >= attempts )); then return $exit_code; fi
    echo "下载或安装中断，15秒后重试（$count/$attempts）..."
    sleep 15
    count=$((count + 1))
  done
}

if [[ ! -x "$VENV/bin/python" ]]; then "$PYTHON_BIN" -m venv "$VENV"; fi
PIP=("$VENV/bin/python" -m pip --disable-pip-version-check --retries 8 --timeout 180)
retry "${PIP[@]}" install --upgrade pip wheel setuptools
retry "${PIP[@]}" install paddlepaddle==3.2.1 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
retry "${PIP[@]}" install -U "paddleocr[doc-parser]==3.7.0"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
cat > "$APP_BUNDLE/Contents/Info.plist" <<'APP_PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Writing Assistant Local OCR</string>
  <key>CFBundleIdentifier</key><string>ccwu.writing-assistant.local-ocr</string>
  <key>CFBundleVersion</key><string>0.8.0.1</string>
  <key>CFBundleShortVersionString</key><string>0.8.0 M4-R1</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>
APP_PLIST
cat > "$APP_BUNDLE/Contents/MacOS/WritingAssistantOCR" <<'APP_LAUNCHER'
#!/bin/zsh
APP_HOME="$HOME/Library/Application Support/WritingAssistantOCR"
SOURCE="$(cat "$APP_HOME/model-source.txt" 2>/dev/null || echo bos)"
export PADDLE_PDX_MODEL_SOURCE="$SOURCE"
export WA_OCR_OPEN_DASHBOARD=1
exec "$APP_HOME/venv/bin/python" "$APP_HOME/server.py"
APP_LAUNCHER
chmod +x "$APP_BUNDLE/Contents/MacOS/WritingAssistantOCR"
xattr -dr com.apple.quarantine "$APP_BUNDLE" 2>/dev/null || true

echo
echo "高级OCR运行环境安装完成。"
echo "应用：$APP_BUNDLE"
echo "模型尚未必已下载；第一次真实识别仍可能需要较长时间准备。"
echo "模型源：$MODEL_SOURCE"
open "$APP_BUNDLE"
trap - EXIT
pause
