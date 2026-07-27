#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR/.."

echo "Writing Assistant 0.8.0 Cloudflare 正式部署"
echo ""
echo "此操作会更新线上正式网站。部署前请确认："
echo "  1. GitHub Desktop 已提交并推送正式版收口提交"
echo "  2. 本地 dist/site 验收通过"
echo "  3. 当前目录没有未确认的代码变更"
echo ""
read "answer?输入 DEPLOY 继续："
if [[ "$answer" != "DEPLOY" ]]; then
  echo "已取消。"
  exit 0
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "缺少 Node.js 或 npm。"
  exit 1
fi

npm run build:release
npx --yes wrangler@4.114.0 deploy

echo ""
echo "部署命令已完成。请立即打开正式域名执行发布后冒烟测试。"
