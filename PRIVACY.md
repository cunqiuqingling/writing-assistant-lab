# Privacy Policy / 隐私政策

Effective date: 2026-07-28  
Last updated: 2026-07-28

Writing Assistant is a local-first static web application. This policy describes the official public site and current `0.8.1` behavior.

## Local browser data

The application may store practice, learner writing, notes, imported documents, progress, interface preferences, optional provider settings, locally encrypted key material and the optional loopback pairing token in the current browser. The project maintainer normally cannot access or restore this data.

## Network behavior

Writing Assistant does not operate a user-account system, shared practice database, advertising tracker or first-party behavior analytics service. Ordinary delivery through Cloudflare may involve IP addresses, request time and HTTP headers for content delivery, security and abuse prevention.

| Feature | Information sent | Recipient |
| --- | --- | --- |
| BYOK reference analysis | selected reference text, request parameters and the visitor's API key | provider selected by the visitor |
| Wikipedia/Wikisource | search term, selected page title and ordinary request metadata | Wikimedia |
| Browser OCR | OCR runtime and English data are downloaded; page images and results remain local | official static site |
| Advanced OCR | explicitly selected temporary page images | loopback service at `127.0.0.1:8765` |

## BYOK boundary

AI is disabled until a visitor configures a provider and starts a request. The intended request contains only selected reference text. Learner writing, notes, labels, plans and progress are excluded. The maintainer does not operate an AI proxy or receive the key through normal operation.

## Documents, deletion and minors

TXT, Markdown, EPUB, DOCX and PDF are parsed in the browser. Use **Data & Backup → Clear local practice data** or browser settings to delete local data. Important work should be backed up. Minors should use external services with guardian guidance and should not submit sensitive personal information.

## Contact

General non-sensitive questions may use public Issues. Vulnerabilities, credentials, identity documents or copyright evidence must use the private channels in [CONTACT.md](CONTACT.md).

Public HTML: `/legal/privacy.html`.

---

## 中文摘要

练习、笔记、导入文档和进度默认保存在当前浏览器。Cloudflare可能处理普通连接与安全日志信息。BYOK请求由浏览器直接发送给使用者选择的AI提供商，只包含主动选择的参考文本；学习者仿写与进度不应进入请求。Wikimedia请求只在主动搜索或预览后发生。浏览器OCR保持本地；高级OCR只访问使用者本机回环服务。
