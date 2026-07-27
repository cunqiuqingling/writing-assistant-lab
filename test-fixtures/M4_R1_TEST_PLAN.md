# M4-R1历史检查点测试计划

> 该文件记录开发阶段验收。0.8.0正式版已经移除URL模拟OCR入口，请使用`RELEASE_0_8_0_TEST_PLAN.md`进行发布测试。

# M4-R1人工测试计划

## A. 版本与回归

1. 左上角显示`0.8.0 M4-R1`。
2. EPUB、DOCX、TXT、Markdown和带文字层PDF仍正常导入。
3. AI隐私边界、文件夹收缩、M2标题与章节编辑不回退。

## B. 无下载模拟链路

打开：

```text
http://127.0.0.1:8080/index.html?v=m4r1&browserOcrMock=1
```

导入`sample-scanned-image-only.pdf`，点击浏览器OCR并识别第1页。应产生模拟文字并进入M2预览，不需要安装Python或模型。

## C. 真实浏览器OCR

去掉`browserOcrMock=1`，强制刷新后只测试第1页。第一次会加载SDK和轻量模型，速度取决于网络；后续应可使用浏览器缓存。检查：

- 页面未上传到Writing Assistant服务器；
- UI保持响应；
- 可取消；
- 结果只保留文字；
- 可在预览里修正页眉页脚和段落顺序。

## D. 低配置保护

开发者工具模拟或实机检查单次页数上限。低配置应为1页，中等3页，标准5页。

## E. 高级安装提醒

展开高级本地OCR，点击“安装前须知”。未勾选确认时不能继续。提醒应明确安装耗时、性能要求、实验性以及失败不影响网站。

## F. 安装器修复

只做语法检查可运行：

```bash
zsh -n local-ocr-companion/install_macos_apple_silicon.command
```

真实安装前先确认使用Python 3.10–3.12。旧的Python 3.13不应继续安装。网络中断时应重试并保留日志，不再出现`read-only variable: status`。
