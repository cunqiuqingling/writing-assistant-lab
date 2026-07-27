# Writing Assistant

> **Sentence → Paragraph → Independent Writing**

一个本地优先的英语写作练习工具。核心练习无需账号、后端数据库或AI；可选BYOK只解析使用者主动选择的参考文本。

**在线体验：** https://writing-assistant.ccwu.cc/

[English README](README.md)

![Writing Assistant 界面](assets/screenshot.png)

## 主要功能

- Sentence Lab：精准跟写、结构仿写、自动拆分和纯前端规则分析。
- Paragraph Lab：逐句功能标注、引导式搭建、骨架迁移和独立段落训练。
- Practice Library：文件夹、长文本、章节进度和本地材料管理。
- 文档导入：浏览器内处理TXT、Markdown、EPUB、DOCX和PDF。
- 浏览器英文OCR：同源Tesseract.js资源按需加载。
- 可选BYOK参考文本解析：不发送学习者仿写、笔记、计划或进度。
- 公开资源中心：用户主动搜索Wikipedia和Wikisource。
- 本地优先：练习和自建材料保存在当前浏览器，支持JSON备份。

## 隐私、条款与安全

项目没有共享用户数据库、账号系统、广告追踪或第一方行为分析。普通访问会经过Cloudflare；AI、Wikimedia和高级本地OCR只在使用者主动操作后连接。

- [隐私政策](PRIVACY.md)
- [使用条款与免责声明](TERMS.md)
- [版权与下架请求](COPYRIGHT_AND_TAKEDOWN.md)
- [安全政策](SECURITY.md)
- [第三方组件说明](THIRD_PARTY_NOTICES.md)
- [联系方式](CONTACT.md)
- [公开政策中心](https://writing-assistant.ccwu.cc/legal/)

## 0.8.1 透明度补丁

0.8.1不改变本地存储结构和练习数据。它新增公开政策中心、网站页脚、隐私数据流说明、使用条款、版权通知流程、安全报告边界和联系方式。

## 文档与进度保护

所有文档先进入本地预览。只修改标题或顺序时尽量保留稳定ID；修改正文或章节结构时，只清理不再匹配的受影响进度并在保存前确认。普通PDF由PDF.js解析，扫描PDF默认使用浏览器英文OCR，高级PaddleOCR-VL连接器仍为可选实验功能。

## 本地运行

```bash
python3 -m http.server 8080
```

## 构建与部署

```bash
npm install --omit=dev --no-audit --no-fund
npm run vendor
npm run build:release
npm run deploy
```

`dist/site`通过Cloudflare Workers Static Assets部署。

## 素材、贡献与许可证

内置IELTS风格文本为原创练习材料，不是官方范文。用户应确认导入或发送给第三方服务的材料具有合法使用依据。欢迎阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 后提交改进。代码使用 [MIT License](LICENSE)。
