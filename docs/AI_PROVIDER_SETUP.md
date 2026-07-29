# AI服务商、模型选择与调用说明

Writing Assistant 的站内AI功能采用BYOK（Bring Your Own Key）。网站不提供公共密钥；使用者从自己选择的服务商申请API Key，并由当前浏览器直接调用该服务商。

## 默认推荐模型

### 智谱 GLM

```text
Base URL: https://open.bigmodel.cn/api/paas/v4
Endpoint: /chat/completions
Model: glm-4-flash-250414
```

`glm-4-flash-250414`是智谱提供的免费文本模型，适合普通问答、摘要和文本处理。它不依赖GLM-4.5及以上模型所使用的Thinking参数，因而更适合作为浏览器直连的默认选择。

### Google Gemini

```text
Base URL: https://generativelanguage.googleapis.com/v1beta
Model: gemini-3.1-flash-lite
```

`gemini-3.1-flash-lite`是面向高频、轻量任务的低延迟模型。模型名称仍可自行修改为账户当前可用的其他Gemini模型ID。

## 模型名称可以自行选择

预设中的模型名称只是推荐值，不是锁定选项。使用者可以在“模型名称”中填写服务商官方控制台或API文档列出的精确模型ID。

选择时建议注意：

- 免费模型可能存在每日或每月额度、速度、地区和账户验证限制；
- 部分推理模型默认启用Thinking，或要求额外的Thinking参数；
- 同一服务商的不同模型可能使用不同的参数、接口或响应结构；
- 为提高Writing Assistant浏览器直连的稳定性，优先选择普通文本生成、无需额外Thinking配置的模型；
- 智谱GLM-4.5及以上系列可能支持Thinking参数，若出现只有思考内容、没有最终文本或参数不兼容，先改用`glm-4-flash-250414`等非Thinking默认模型；
- 服务商调整模型名称、免费政策或接口后，应以官方文档为准。

## 如何配置和调用

1. 打开服务商官方控制台，创建API Key。
2. 在Writing Assistant顶部点击 **AI Settings**。
3. 选择服务商预设。
4. 检查Base URL、Endpoint和模型名称；需要时按照官方文档修改模型ID。
5. 粘贴当前服务商的API Key。
6. 选择“仅本次标签页”或“使用本地密码加密保存”。
7. 点击 **测试连接**。
8. 测试成功后点击 **保存当前服务商**。
9. 在Practice Library选择材料，进入Sentence Lab或Paragraph Lab。
10. 在右侧 **AI Reference Analysis** 中点击 **AI解析原文**。

站内AI只发送当前参考原文，不会自动发送仿写、笔记或学习进度。需要让AI检查自己的写作时，请使用练习区的“复制……· AI反馈”，再主动粘贴到外部AI平台。

## 官方API文档

- 智谱HTTP API与API Key：https://docs.bigmodel.cn/cn/guide/develop/http/introduction
- 智谱对话补全接口：https://docs.bigmodel.cn/api-reference/模型-api/对话补全
- 智谱GLM-4-Flash-250414：https://docs.bigmodel.cn/cn/guide/models/free/glm-4-flash-250414
- Google Gemini API：https://ai.google.dev/gemini-api/docs
- Google Gemini API入门：https://ai.google.dev/gemini-api/docs/get-started
- Gemini 3.1 Flash-Lite：https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
- OpenAI API：https://platform.openai.com/docs/api-reference
- DeepSeek API：https://api-docs.deepseek.com/
- SiliconFlow API：https://docs.siliconflow.cn/
- Anthropic API：https://docs.anthropic.com/en/api/overview

对于Custom OpenAI-compatible服务，请以该服务商自己的API文档为准。
