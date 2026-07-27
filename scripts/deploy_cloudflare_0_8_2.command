#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR/.."

echo "Writing Assistant 0.8.2 Cloudflare 正式部署"
echo ""
echo "部署前请确认："
echo "  1. 练习库卡片管理与删除测试通过"
echo "  2. AI设置中的两种清理操作测试通过"
echo "  3. GitHub Desktop已提交并推送"
echo "  4. 当前目录没有未确认的代码变更"
echo ""
read "answer?输入 DEPLOY 继续："
if [[ "$answer" != "DEPLOY" ]]; then
  echo "已取消。"
  exit 0
fi

npm run build:release
npx --yes wrangler@4.114.0 deploy

echo ""
echo "部署命令已完成。请检查首页版本、练习库管理和AI Settings。"
