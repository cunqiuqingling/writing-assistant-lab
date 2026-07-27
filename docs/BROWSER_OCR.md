# Browser-first English OCR（0.8.0 Release R1）

## 为什么改用英文专用快速OCR

Writing Assistant的核心材料是英文句子、段落、论文和文学文本。正式发布测试发现，原来的PaddleOCR.js浏览器路径需要从多个外部地址临时加载SDK、OpenCV、ONNX Runtime和模型，首次等待时间不可预测，也无法显示真实下载阶段。

Release R1改用Tesseract.js 7与英文快速识别数据：

- 只服务英文写作材料；
- OCR核心、Worker、WASM和英文数据全部进入`vendor/tesseract/`；
- 正式运行时不再向OCR CDN请求SDK或模型；
- 第一次使用从Writing Assistant自己的Cloudflare静态资源加载；
- Tesseract logger用于显示真实初始化与识别进度；
- 初始化超过90秒会停止并给出错误，不再无限等待；
- 后续由浏览器缓存相关静态资源。

## 数据流

```text
用户选择扫描PDF页面
  → PDF.js在浏览器渲染页面
  → 同源Tesseract.js Worker
  → 英文文字结果
  → M2文档预览
```

页面图像、识别文字和练习内容不会发送给项目维护者。

## 能力边界

适合：

- 清晰的印刷英文；
- 英文论文、书籍和练习材料扫描页；
- 简单单栏或可人工修正的双栏页面。

不负责：

- 中文等其他语言；
- 表格和公式结构恢复；
- 图片说明；
- 出版级版面重建。

识别结果进入文档预览，用户可以删除页眉页脚、调整段落顺序和修改错字。

## 发布资产

发布维护者运行`npm run vendor`时会：

1. 复制Tesseract.js浏览器API和Worker；
2. 复制Tesseract WebAssembly核心；
3. 从`@tesseract.js-data/eng`中选择体积最小的`eng.traineddata.gz`；
4. 写入`vendor/manifest.json`；
5. 将全部资源随`dist/site`部署到Cloudflare。
