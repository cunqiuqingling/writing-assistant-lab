# Writing Assistant

> **Sentence → Paragraph → Independent Writing**

一个本地优先的英语写作练习工具，帮助学习者从句子仿写逐步进入段落论证和独立写作。无需账号、后端数据库或 AI API。

**在线体验：** https://writing-assistant.ccwu.cc/

[English README](README.md)

![Writing Assistant 界面](assets/screenshot.png)

## 为什么做这个项目

很多学习者还没有接受句子和段落训练，就被要求直接完成整篇作文。Writing Assistant 将英文写作拆成一条渐进路径：

1. 观察并仿写有用的句子结构；
2. 判断每一句在段落中承担什么功能；
3. 从观点、原因、机制、例子和限定搭建段落；
4. 逐渐撤掉辅助，进入独立写作；
5. 将自己的练习一键复制到 GPT 对话中接受反馈和重写。

## 主要功能

- **Sentence Lab**：精准跟写、结构仿写、自动拆分、纯前端规则分析，以及适合粘贴给 GPT 的反馈格式。
- **Paragraph Lab**：逐句功能标注、引导式段落搭建、骨架迁移和独立段落训练。
- **Practice Library**：内置原创材料，并支持导入 TXT、Markdown 和练习库 JSON。
- **本地优先**：每位访问者的练习、笔记和自建材料保存在自己的浏览器中；支持 JSON 备份与恢复。
- **不需要 AI 密钥**：网页负责训练流程，GPT 负责更深入的反馈。
- **不需要注册账号**：每位访问者获得相互独立的本地练习空间。

## 隐私与安全模型

公开网站只包含程序代码和内置练习材料。

- 练习原文、答案、笔记和自建材料通过 `localStorage` 与 `IndexedDB` 保存在访问者自己的浏览器中。
- 不同访问者无法读取彼此的本地练习数据。
- 项目没有云端数据库、统计脚本或用于修改线上代码的公开接口。
- 访问者通过浏览器开发者工具修改页面，只会影响他自己的当前页面或本地存储。
- GitHub 仓库公开后，普通访问者不会因此获得 Cloudflare 账户权限。
- 只有维护者主动部署新 Worker，或以后明确配置了可信 CI/CD 自动部署，线上网站才会发生变化。

详见 [PRIVACY.md](PRIVACY.md) 与 [SECURITY.md](SECURITY.md)。

## 本地运行

建议通过本地服务器打开：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 发布到 GitHub Pages

1. 将本项目上传到 GitHub 仓库。
2. 打开 **Settings → Pages**。
3. Source 选择 **Deploy from a branch**。
4. 选择 `main` 分支和 `/ (root)`。
5. 保存后访问 GitHub Pages 生成的网址。

GitHub Pages 不是必须的。仓库完全可以继续把现有 Cloudflare 网站作为主要在线演示。

## 继续部署到 Cloudflare Worker

项目包含可直接部署的单文件版本：

```text
dist/writing-assistant-worker.js
```

修改源代码后可重新构建：

```bash
npm run build:worker
```

## 推荐的仓库信息

- 仓库名：`writing-assistant-lab`
- Description：`Local-first English writing practice: Sentence → Paragraph → Independent Writing`
- Website：`https://writing-assistant.ccwu.cc/`
- Topics：`english-writing`、`ielts`、`writing-practice`、`local-first`、`vanilla-javascript`、`cloudflare-workers`

## 素材与版权

内置 IELTS 风格文本均为原创练习材料，不是 IELTS 官方范文。用户导入第三方文章或书籍前，应自行确认版权和许可状态。请勿未经许可公开再发布受版权保护的完整范文或作品。

## 参与贡献

欢迎提交 Bug 和边界清晰的改进。请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。外部贡献者提交 Pull Request 并不会自动改变线上网站，必须由维护者审查、合并并重新部署。

## 许可证

代码使用 [MIT License](LICENSE)。内置原创练习材料可随本项目用于学习和二次开发，建议保留来源说明；用户自行导入的第三方材料仍受原版权和许可约束。
