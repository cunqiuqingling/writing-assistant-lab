# Writing Assistant 高级本地OCR连接器

这是可选、实验性组件。普通扫描PDF请先使用网页中的浏览器OCR。

## 安装要求

- macOS Apple Silicon
- Python 3.10–3.12（不支持3.13）
- 建议至少8 GB内存
- 至少8 GB可用磁盘
- 可接受较长的依赖下载和首次模型准备时间

## 文件

- `start_mock.command`：不安装模型，验证网页到localhost的连接。
- `install_macos_apple_silicon.command`：安装真实高级OCR。
- `cleanup_incomplete_install.command`：清理失败或不完整安装。
- `uninstall_macos.command`：卸载已安装组件。

下载或安装失败不会影响Writing Assistant的浏览器OCR、PDF.js或其他练习功能。
