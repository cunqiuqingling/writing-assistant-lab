#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR/.."

echo "Writing Assistant 0.8.1 Cloudflare 正式部署"
echo ""
echo "此操作会更新线上正式网站。部署前请确认："
echo "  1. 0.8.1本地政策页面与主功能回归通过"
echo "  2. GitHub Desktop已提交并推送"
echo "  3. 当前目录没有未确认的代码变更"
echo ""
read "answer?输入 DEPLOY 继续："
if [[ "$answer" != "DEPLOY" ]]; then
  echo "已取消。"
  exit 0
fi

npm run build:release
npx --yes wrangler@4.114.0 deploy

echo ""
echo "部署命令已完成。请检查首页版本与 /legal/ 政策中心。"
