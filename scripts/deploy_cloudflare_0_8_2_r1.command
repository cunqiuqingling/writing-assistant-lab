#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR/.."

echo "Writing Assistant 0.8.2-R1 Cloudflare 正式部署"
echo ""
echo "部署前请确认："
echo "  1. 多服务商配置和密钥隔离测试通过"
echo "  2. 智谱GLM连接与解析测试通过"
echo "  3. 中文解析和窄栏排版测试通过"
echo "  4. 外部AI反馈复制说明与内容测试通过"
echo "  5. GitHub Desktop已提交并推送，工作区干净"
echo ""
read "answer?输入 DEPLOY 继续："
if [[ "$answer" != "DEPLOY" ]]; then
  echo "已取消。"
  exit 0
fi

npm run build:release
npx --yes wrangler@4.114.0 deploy

echo ""
echo "部署完成。请在线复查版本号0.8.2-R1和四组验收项目。"
