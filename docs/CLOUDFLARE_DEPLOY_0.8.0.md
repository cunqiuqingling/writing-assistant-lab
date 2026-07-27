# Cloudflare正式部署：Writing Assistant 0.8.0

## 构建结构

正式网站使用：

```text
源文件
  ↓
本地固定版本JSZip / Mammoth / PDF.js
  ↓
dist/site
  ↓
Cloudflare Workers Static Assets
```

文档解析器不会在正式版中回退到临时CDN。浏览器OCR仍然只在用户主动触发时按需加载固定版本SDK和轻量模型。

## 第一次准备

```bash
cd ~/Documents/GitHub/writing-assistant-lab
npm install --omit=dev --no-audit --no-fund
npm run vendor
npm run build:release
npm run package:release
```

## 本地检查正式构建

```bash
cd ~/Documents/GitHub/writing-assistant-lab/dist/site
python3 -m http.server 8081 --bind 127.0.0.1
```

打开：

```text
http://127.0.0.1:8081/
```

这一步测试的是即将上传的`dist/site`，不是仓库根目录。

## 正式部署

回到仓库：

```bash
cd ~/Documents/GitHub/writing-assistant-lab
./scripts/deploy_cloudflare_0_8_0.command
```

脚本要求输入`DEPLOY`，随后重新执行正式构建并调用固定版本Wrangler。

## 发布后

立即打开正式域名，确认版本、文档导入、浏览器OCR和本地数据保存。出现异常时先停止继续操作，保留终端部署输出和Cloudflare部署版本信息。
