# Writing Assistant 0.8.0正式发布检查清单

## A. 发布收口

- [ ] 左上角只显示`0.8.0`
- [ ] `APP_VERSION`、导入器、OCR客户端和连接器均为`0.8.0`
- [ ] 正式网页不接受`browserOcrMock`测试参数
- [ ] EPUB、DOCX、PDF解析器全部从`vendor/`本地路径加载
- [ ] `_headers`已进入`dist/site`
- [ ] `npm run build:release`通过
- [ ] `npm run package:release`生成发布附件

## B. 本地完整回归

- [ ] Sentence Lab原有练习与保存正常
- [ ] Paragraph Lab原有练习与保存正常
- [ ] 0.7.0旧数据能够恢复
- [ ] JSON备份和恢复正常
- [ ] BYOK只发送当前参考原文
- [ ] TXT、Markdown、EPUB、DOCX、文字层PDF导入正常
- [ ] 扫描PDF浏览器OCR正常
- [ ] OCR取消和失败恢复正常
- [ ] 卡片标题修改不丢进度
- [ ] 章节结构编辑只清理受影响进度
- [ ] 文件夹展开/收起和刷新记忆正常
- [ ] Wikipedia与Wikisource用户主动搜索正常

## C. 正式部署

- [ ] 正式版收口提交已Commit并Push
- [ ] Cloudflare登录账号和Worker项目确认无误
- [ ] 运行`scripts/deploy_cloudflare_0_8_0.command`
- [ ] 部署输出无错误
- [ ] 正式域名显示`0.8.0`

## D. 上线后冒烟测试

- [ ] 首页、Sentence Lab、Paragraph Lab和Practice Library可打开
- [ ] 浏览器控制台无持续红色错误
- [ ] 导入一份TXT
- [ ] 导入一份DOCX
- [ ] 导入一份文字层PDF
- [ ] 扫描PDF识别第1页
- [ ] 在线公共资源搜索一次
- [ ] 导出一份JSON备份
- [ ] 刷新页面后本地进度仍存在

## E. GitHub Release

- [ ] 标签使用`v0.8.0`
- [ ] 标题使用`Writing Assistant 0.8.0`
- [ ] 正文使用`RELEASE_NOTES_0.8.0.md`
- [ ] 上传`release-assets`中的静态站点ZIP
- [ ] 上传可选高级OCR连接器ZIP
- [ ] 上传`SHA256SUMS.txt`
