# Writing Assistant

> **Sentence → Paragraph → Independent Writing**

一个本地优先的英语写作练习工具，帮助学习者从句子仿写逐步进入段落论证和独立写作。无需账号、后端数据库或 AI API。

**在线体验：** https://writing-assistant.ccwu.cc/

[English README](README.md)

## Interface

### 句子练习

![Sentence Lab](assets/sentence-lab.png)

### 段落练习

![Paragraph Lab](assets/paragraph-lab.png)

### 练习库

![Practice Library](assets/practice-library.png)

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
- **Practice Library**：采用本地虚拟文件夹分类，同时保留现有材料卡片，并支持TXT、Markdown和练习库JSON导入。
- **长文本工作区**：材料按文档、章节和每批最多45个练习单元组织，Sentence Lab与Paragraph Lab分别保存章节进度。
- **本地优先**：每位访问者的练习、笔记和自建材料保存在自己的浏览器中；支持 JSON 备份与恢复。
- **可选的BYOK原文解析**：AI只解析选中的范文、小说节选、论文或其他参考文本，不发送或评价使用者的仿写内容。
- **不需要注册账号**：每位访问者获得相互独立的本地练习空间。

## 隐私与安全模型

公开网站只包含程序代码和内置练习材料。

- 练习原文、答案、笔记和自建材料通过 `localStorage` 与 `IndexedDB` 保存在访问者自己的浏览器中。
- 不同访问者无法读取彼此的本地练习数据。
- 项目没有云端数据库、统计脚本或用于修改线上代码的公开接口。
- 访问者通过浏览器开发者工具修改页面，只会影响他自己的当前页面或本地存储。
- GitHub 仓库公开后，普通访问者不会因此获得 Cloudflare 账户权限。
- 只有维护者主动部署新 Worker，或以后明确配置了可信 CI/CD 自动部署，线上网站才会发生变化。

详见 [PRIVACY.md](PRIVACY.md)、[SECURITY.md](SECURITY.md)、[BYOK AI配置说明](docs/AI_CONFIGURATION.md) 与 [文件夹和长文本说明](docs/LONG_TEXT_AND_FOLDERS.md)。

## 本地运行

建议通过本地服务器打开：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。



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

## AI原文解析边界

启用后，AI只解析当前选中的参考句子或参考段落，例如范文、小说节选、论文或其他练习文本。使用者的仿写、笔记、标签、写作计划和练习进度不会发送给服务商，也不会被AI评价。

网页原有的练习复制功能不会附带AI解析结果。解析内容独立显示并缓存在当前浏览器中。

## 0.7.0格式边界

本版继续支持纯文本、TXT、Markdown和练习库JSON。联网获取Wikipedia/Wikisource资源，以及EPUB、DOCX和PDF解析，不属于0.7.0范围。
