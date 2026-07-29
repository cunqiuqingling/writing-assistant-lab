# BYOK AI reference-text analysis / AI原文解析配置

Writing Assistant includes optional AI analysis for the reference sentence or paragraph currently being studied. It does not provide a shared AI account or a project-owned API key. Visitors connect their own provider account directly from the browser.

Writing Assistant 提供可选的参考原文AI解析，但不提供公共AI账号，也不内置由项目维护者承担费用的密钥。使用者需要从自己选择的服务商申请API Key，并由当前浏览器直接连接该服务商。

## What the AI can analyse / AI会解析什么

Sentence analysis can cover:

- meaning and communicative purpose;
- grammatical skeleton;
- clauses, phrases and modifiers;
- vocabulary and collocation;
- register and style;
- transferable writing patterns;
- imitation cautions.

Paragraph analysis can cover:

- likely genre and central purpose;
- sentence-function mapping;
- development chain;
- cohesion and coherence;
- high-value language;
- transferable paragraph structure;
- imitation cautions.

AI requests contain only the current reference sentence or paragraph. Learner imitation, independent writing, notes, labels, plans and progress are excluded from the intended request. Ordinary copy actions never append AI analysis output.

AI请求只包含当前参考句子或参考段落，不读取、不发送、不比较使用者的仿写、独立写作、笔记、标签、计划和进度。普通复制功能也不会附带AI解析结果。

## Supported presets / 服务商预设

The settings panel currently includes presets for:

- OpenAI;
- DeepSeek;
- SiliconFlow / 硅基流动;
- Google Gemini;
- Anthropic Claude;
- Custom OpenAI-compatible services.

A preset fills the adapter, Base URL, endpoint and a default model name. It does not guarantee that the model is still available, free, supported in the visitor's region or enabled for the visitor's account. Always verify the current model name, pricing and usage rules in the provider's official console or documentation.

预设只负责填充接口协议、Base URL、Endpoint和默认模型名，并不保证模型仍然可用、免费、适用于所在地区，或已经对当前账户开放。请以服务商官方控制台和最新文档为准。

## Free and paid API options / 免费与付费API方案

Users are not required to purchase an API specifically for Writing Assistant. They may choose a provider that offers a free API, free quota, free tier or free model, provided that the provider permits direct browser requests. A paid API can also be used when the visitor prefers a different model, larger quota or more stable availability.

Free plans can still have daily or monthly limits, restricted models, slower service, regional restrictions, account-verification requirements or changing availability. “Free” refers to the provider's current plan, not a promise made or funded by Writing Assistant.

使用者不一定需要为Writing Assistant购买付费API。只要服务商允许浏览器直连，就可以选择其提供的免费API、免费额度、免费套餐或免费模型；需要不同模型、更大额度或更稳定服务时，也可以自行使用付费API。

免费方案仍可能存在每日或每月调用上限、模型限制、速度限制、地区限制、账户验证要求或临时调整。“免费”指服务商当前提供的方案，并不是由Writing Assistant代付或保证长期存在。

## Quick setup / 快速设置

1. Open `https://writing-assistant.ccwu.cc/`.
2. Click **AI Settings** in the top bar.
3. Choose a provider preset. A free API, free-tier account or free model can be used when the provider supports browser access.
4. Paste an API key obtained from that provider's official console.
5. Confirm the Base URL, endpoint and model name.
6. Choose the analysis language.
7. Choose a key-storage mode.
8. Click **Test connection**.
9. After the connection succeeds, click **Save settings**.
10. Open a sentence or paragraph exercise and click **AI解析原文** in the right-side coach panel.

中文步骤：

1. 打开网站，点击顶部 **AI Settings**。
2. 选择服务商预设；服务商支持时，可以使用免费API、免费套餐或免费模型。
3. 粘贴从该服务商官方控制台申请的API Key。
4. 检查Base URL、Endpoint和模型名称。
5. 选择解析语言和密钥保存方式。
6. 点击 **测试连接**。
7. 连接成功后点击 **保存设置**。
8. 进入Sentence Lab或Paragraph Lab，选择练习材料。
9. 在右侧面板点击 **AI解析原文**。

## Key storage / 密钥保存方式

### Session only / 仅本次标签页

This is the default and recommended mode.

- The key is stored in the current tab's session storage.
- It normally disappears when that tab session ends.
- It is excluded from ordinary Writing Assistant JSON backups.

这是默认且更稳妥的方式。密钥只保存在当前标签页会话中，不进入普通JSON备份，标签页会话结束后通常会消失。

### Encrypted local storage / 本地加密保存

This mode encrypts the key in the browser with PBKDF2 and AES-GCM.

- The local password must contain at least eight characters.
- The password itself is not stored or uploaded.
- The project maintainer cannot recover a forgotten password.
- The encrypted key remains tied to the current browser profile and device storage.

该模式使用PBKDF2和AES-GCM在浏览器本地加密密钥。本地密码至少8个字符，密码本身不会保存或上传；遗忘后项目维护者也无法恢复。

## Recommended key hygiene / 密钥安全建议

- Create a dedicated, low-limit and revocable key for Writing Assistant.
- Do not use a high-value organisational or production key.
- Never commit a real key to GitHub.
- Never include a real key in screenshots, Issues, logs, practice materials or backups.
- Remove or revoke the key immediately if it is exposed.
- Review provider billing, free quotas and usage limits before testing.

建议创建低额度、可撤销、只用于本工具的专用密钥。不要使用组织级、生产环境或高价值密钥，也不要把密钥放入GitHub、截图、Issue、日志、练习材料或备份。测试前应确认服务商当前的免费额度、计费方式和调用上限。

## Troubleshooting / 故障排查

### “Please fill in Base URL” or “Please fill in model name”

Select the provider preset again, then verify the fields against the provider's current documentation.

重新选择一次服务商预设，并按照服务商最新文档确认Base URL、Endpoint和模型名称。

### Authentication or invalid-key error / 密钥无效

Check that:

- the key was copied completely;
- the key belongs to the selected provider;
- the account has API access rather than only a consumer chat subscription;
- the key has not expired or been revoked;
- the account has sufficient balance or remaining free quota.

### Model not found / 模型不存在

Provider model names can change. Replace the preset model with a model currently enabled for your account.

服务商可能调整模型名称。请在官方控制台中确认当前账户可调用的模型，并把设置中的模型名替换为准确值。

### Browser CORS error / 浏览器跨域错误

Writing Assistant sends requests directly from the browser. Some providers do not permit browser-origin requests and may reject them through CORS policy. This is a provider-side browser-access restriction rather than a Writing Assistant storage error.

Writing Assistant由浏览器直接请求服务商。部分服务商不允许网页跨域直连，因此会被CORS策略拒绝。这通常不是本地存储问题。

### Connection test succeeds but analysis fails

Possible causes include:

- the selected reference text is too long;
- temporary provider rate limits;
- insufficient balance or free quota;
- a provider response-format change;
- network or VPN routing problems;
- the configured output-token limit is too small.

Try a shorter sentence, confirm quota, check the model name and retry later.

### Encrypted key cannot be unlocked / 加密密钥无法解锁

The password is not recoverable. Use **移除本地密钥**, then enter and save a new API key. Removing local keys does not delete ordinary practice data.

密码无法找回。可以点击 **移除本地密钥**，重新填写并保存新的API Key。移除密钥不会删除普通练习数据。

## Privacy and cost boundary / 隐私与费用边界

The selected reference text and API key are sent directly to the chosen provider when a request is made. The project maintainer does not operate an AI proxy and does not receive the request body or key during normal operation.

Provider retention, training, billing, free quotas, regional availability and content policies are controlled by that provider. Depending on the selected plan, API use may be free within its quota or may incur charges. Visitors should review the provider's current privacy policy, pricing and terms before enabling the feature.

发起解析时，选中的参考原文和API Key会直接发送给所选服务商。项目维护者不运营AI代理服务器，正常情况下不会接收请求正文或密钥。数据保留、模型训练、免费额度、费用、地区限制和内容政策由服务商决定；根据所选方案，调用可能在免费额度内完成，也可能产生费用。

## Remove AI credentials / 移除AI凭据

Open **AI Settings** and click **移除本地密钥**. This removes both the current session key and any encrypted local key record. Provider-side keys remain active until they are revoked in the provider's own console.

在 **AI Settings** 中点击 **移除本地密钥**，可以删除当前标签页密钥和浏览器中的加密密钥记录。服务商侧的API Key仍需在对应官方控制台中单独撤销。

## 清除密钥与AI设置

- **移除API Key**：删除当前标签页密钥和本机加密密钥，但保留服务商、接口与模型设置。
- **清除全部AI配置与密钥**：删除密钥、服务商、Base URL、Endpoint、模型和其他AI参数，恢复为未配置状态。

两种操作都不会删除练习库、写作、笔记、文件夹、进度或已保存的AI原文解析结果。Writing Assistant不保存复制历史，因此没有“清除复制缓存”操作。

## Provider profiles and provider-specific keys / 服务商独立档案与密钥

Writing Assistant 0.8.2-R1 stores the Base URL, endpoint, model and API key separately for each provider. Switching from Zhipu GLM to Google Gemini restores the saved Gemini profile and never reuses the GLM key. The encrypted-key unlock action also applies only to the currently selected provider.

0.8.2-R1会分别保存各服务商的Base URL、Endpoint、模型和API Key。从智谱GLM切换到Google Gemini时，会恢复Gemini自己的档案，绝不会继续调用GLM密钥；输入本地密码时，也只会解锁当前所选服务商的密钥。

Zhipu GLM is now a built-in preset:

```text
Base URL: https://open.bigmodel.cn/api/paas/v4
Endpoint: /chat/completions
Model: glm-4.7-flash
```

The preset disables Thinking for connection tests and reference analysis so that the service returns final displayable text instead of consuming the short test response in reasoning output.

## Chinese-first analysis layout / 中文优先解析与排版

When “中文为主，英文随文释义” is selected, headings and explanations are written in Simplified Chinese. Necessary English quotations, terms and templates remain in English and are followed by Chinese meanings. The result panel uses a restricted Markdown renderer that supports headings, lists, quotations and code blocks without accepting arbitrary HTML or scripts.
