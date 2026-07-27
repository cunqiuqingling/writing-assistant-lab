# Writing Assistant 0.8.0正式版人工测试

正式版不再提供URL查询参数模拟OCR。浏览器OCR测试应使用真实第1页；工作线程的模拟协议只保留在开发脚本测试中。

## 最小测试组

1. 打开`dist/site`，确认版本为`0.8.0`。
2. 恢复一份0.7.0或更早的JSON备份。
3. 完成一个句子练习并刷新。
4. 完成一个段落练习并刷新。
5. 导入`sample-two-chapter.md`。
6. 导入`sample-heading-document.docx`。
7. 导入`sample-two-chapter.epub`。
8. 导入`sample-text-layer.pdf`。
9. 导入`sample-scanned-image-only.pdf`，只识别第1页；确认加载阶段显示真实百分比，且不再长期停在“正在加载浏览器OCR”。
10. 修改导入卡片标题，确认进度保留。
11. 修改一章正文，确认只提示清理受影响章节进度。
12. 收起“全部材料”和一个父文件夹，刷新后确认状态保留。
13. 搜索一次Wikipedia和Wikisource。
14. 导出JSON备份并重新恢复。
15. 检查普通复制内容不包含AI解析。
