(function () {
  'use strict';

  var core = window.WritingAssistantCore;
  var workspace = window.WritingAssistantWorkspace;
  if (!core || !workspace) return;

  var h = core.helpers;
  var db = core.db;
  var actions = core.actions;
  var stores = core.stores;

  var IMPORT_VERSION = '0.8.0-m1';
  var MAX_TEXT_BYTES = 8 * 1024 * 1024;
  var MAX_DOCX_BYTES = 45 * 1024 * 1024;
  var MAX_EPUB_BYTES = 70 * 1024 * 1024;
  var MAX_PDF_BYTES = 90 * 1024 * 1024;
  var MAX_PDF_PAGES = 600;
  var MAX_CHAPTERS = 500;
  var MAX_TOTAL_CHARS = 6_000_000;
  var currentJob = null;
  var previewDocument = null;

  var LIBRARIES = {
    jszip: {
      globalName: 'JSZip',
      local: 'vendor/jszip/jszip.min.js',
      remote: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
    },
    mammoth: {
      globalName: 'mammoth',
      local: 'vendor/mammoth/mammoth.browser.min.js',
      remote: 'https://cdn.jsdelivr.net/npm/mammoth@1.12.0/mammoth.browser.min.js'
    },
    pdf: {
      local: 'vendor/pdfjs/pdf.min.mjs',
      workerLocal: 'vendor/pdfjs/pdf.worker.min.mjs',
      remote: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.min.mjs',
      workerRemote: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs'
    }
  };

  function byId(id) { return h.byId(id); }
  function all(selector) { return h.all(selector); }
  function text(value) { return String(value == null ? '' : value); }
  function trimmed(value) { return text(value).trim(); }
  function fileExtension(name) {
    var match = text(name).toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }
  function removeExtension(name) { return text(name).replace(/\.[^.]+$/, ''); }
  function formatBytes(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
    return (value / 1024 / 1024).toFixed(1) + ' MB';
  }
  function cleanText(value) {
    return text(value)
      .replace(/\u0000/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }
  function cleanTitle(value, fallback) {
    var title = cleanText(value).replace(/\n+/g, ' ').slice(0, 160);
    return title || fallback || 'Untitled';
  }
  function unique(values) {
    var seen = {};
    return (values || []).filter(function (value) {
      var key = trimmed(value).toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  function safeChapterId(index) {
    return 'import-chapter-' + Date.now().toString(36) + '-' + index + '-' + Math.random().toString(36).slice(2, 7);
  }
  function escapeAttribute(value) { return h.escapeHtml(value).replace(/`/g, '&#96;'); }
  function currentFolderId() {
    var appState = core.getState();
    var selected = appState.library && appState.library.selectedFolderId;
    return selected && selected !== 'folder-all' ? selected : 'folder-my-custom';
  }
  function folderOptions(selectedId) {
    var folders = typeof workspace.getFolders === 'function' ? workspace.getFolders() : [
      { id: 'folder-my-books', name: 'Imported Books', parentId: 'folder-my-library' },
      { id: 'folder-my-papers', name: 'Imported Papers', parentId: 'folder-my-library' },
      { id: 'folder-my-custom', name: 'Custom Materials', parentId: 'folder-my-library' }
    ];
    var map = {};
    folders.forEach(function (folder) { map[folder.id] = folder; });
    function pathName(folder) {
      var parts = [folder.name];
      var parent = map[folder.parentId];
      var guard = 0;
      while (parent && parent.id !== 'folder-all' && guard < 20) {
        parts.unshift(parent.name);
        parent = map[parent.parentId];
        guard++;
      }
      return parts.join(' / ');
    }
    return folders.filter(function (folder) {
      return folder.id !== 'folder-all';
    }).map(function (folder) {
      return '<option value="' + escapeAttribute(folder.id) + '"' + (folder.id === selectedId ? ' selected' : '') + '>' + h.escapeHtml(pathName(folder)) + '</option>';
    }).join('');
  }
  function categoryForFolder(folderId) {
    if (folderId.indexOf('folder-ielts') === 0) return 'IELTS';
    if (folderId.indexOf('folder-academic') === 0 || folderId.indexOf('folder-pharmacy') === 0) return 'Academic';
    if (folderId.indexOf('folder-literature') === 0 || folderId === 'folder-my-books') return 'Literature';
    return 'Custom';
  }
  function defaultFolderForFormat(format) {
    if (format === 'epub') return 'folder-my-books';
    if (format === 'pdf' || format === 'docx') return 'folder-my-papers';
    return currentFolderId();
  }
  function assertNotCancelled(job) {
    if (!job || job.cancelled) {
      var error = new Error('Import cancelled');
      error.name = 'AbortError';
      throw error;
    }
  }
  function isAbort(error) { return error && error.name === 'AbortError'; }

  function ensureButtons() {
    var controls = document.querySelector('#libraryView .library-hero .controls');
    if (controls && !byId('importDocumentBtn')) {
      var button = document.createElement('button');
      button.className = 'btn primary';
      button.id = 'importDocumentBtn';
      button.type = 'button';
      button.textContent = '导入文档：EPUB / DOCX / PDF';
      controls.insertBefore(button, controls.firstChild);
    }
    var menu = byId('dataMenu');
    var firstAction = byId('addMaterialBtn');
    if (menu && firstAction && !byId('importDocumentMenuBtn')) {
      var menuButton = document.createElement('button');
      menuButton.className = 'menu-action';
      menuButton.id = 'importDocumentMenuBtn';
      menuButton.setAttribute('role', 'menuitem');
      menuButton.innerHTML = '<span>▣</span><span><strong>导入文档</strong><small>EPUB、DOCX、PDF、TXT 或 Markdown</small></span>';
      menu.insertBefore(menuButton, firstAction);
    }
    if (!byId('documentImportFileInput')) {
      var input = document.createElement('input');
      input.type = 'file';
      input.id = 'documentImportFileInput';
      input.accept = '.epub,.docx,.pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      input.hidden = true;
      document.body.appendChild(input);
    }
  }

  function injectModal() {
    if (byId('documentImportModal')) return;
    var modal = document.createElement('div');
    modal.id = 'documentImportModal';
    modal.className = 'modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = [
      '<div class="modal document-import-modal">',
      '  <div class="modal-head">',
      '    <div><h2>导入文档</h2><p class="import-modal-sub">文件在当前浏览器中解析，不会上传到 Writing Assistant 服务器。</p></div>',
      '    <button class="btn small" id="closeDocumentImportModal" type="button">关闭</button>',
      '  </div>',
      '  <div class="modal-body">',
      '    <section id="documentImportChooser">',
      '      <button class="document-drop-zone" id="documentDropZone" type="button">',
      '        <strong>拖入 EPUB、DOCX、PDF、TXT 或 Markdown</strong>',
      '        <span>也可以点击选择文件。扫描 PDF 暂不执行 OCR；本版会先检查是否存在文字层。</span>',
      '      </button>',
      '      <div class="import-limits">TXT/Markdown ≤ 8 MB · DOCX ≤ 45 MB · EPUB ≤ 70 MB · PDF ≤ 90 MB / 600页</div>',
      '    </section>',
      '    <section id="documentImportProgress" hidden>',
      '      <div class="import-progress-card">',
      '        <div class="import-spinner" aria-hidden="true"></div>',
      '        <div><strong id="documentImportProgressTitle">正在解析文档</strong><p id="documentImportProgressText">准备读取……</p></div>',
      '      </div>',
      '      <button class="btn" id="cancelDocumentImportBtn" type="button">取消解析</button>',
      '    </section>',
      '    <section id="documentImportPreview" hidden>',
      '      <div class="import-summary" id="documentImportSummary"></div>',
      '      <div class="import-warning-list" id="documentImportWarnings"></div>',
      '      <div class="split-row">',
      '        <div class="field"><label for="documentImportTitle">材料标题</label><input class="text-input" id="documentImportTitle" style="width:100%" maxlength="160" /></div>',
      '        <div class="field"><label for="documentImportFolder">保存到文件夹</label><select id="documentImportFolder" style="width:100%"></select></div>',
      '      </div>',
      '      <div class="split-row">',
      '        <div class="field"><label for="documentImportSource">来源</label><input class="text-input" id="documentImportSource" style="width:100%" maxlength="240" /></div>',
      '        <div class="field"><label for="documentImportLicense">许可或用途</label><input class="text-input" id="documentImportLicense" style="width:100%" maxlength="240" /></div>',
      '      </div>',
      '      <div class="field"><label for="documentImportTags">标签（逗号分隔）</label><input class="text-input" id="documentImportTags" style="width:100%" maxlength="500" /></div>',
      '      <div class="import-chapter-toolbar">',
      '        <div><strong>章节预览</strong><span id="documentImportChapterCount"></span></div>',
      '        <div><button class="btn small" id="selectAllImportChapters" type="button">全选</button><button class="btn small" id="clearAllImportChapters" type="button">全不选</button></div>',
      '      </div>',
      '      <div class="import-chapter-list" id="documentImportChapterList"></div>',
      '      <div class="modal-actions">',
      '        <button class="btn" id="chooseAnotherDocumentBtn" type="button">重新选择文件</button>',
      '        <button class="btn primary" id="saveImportedDocumentBtn" type="button">保存到练习库</button>',
      '      </div>',
      '    </section>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
  }

  function setImportView(name) {
    ['documentImportChooser', 'documentImportProgress', 'documentImportPreview'].forEach(function (id) {
      byId(id).hidden = id !== name;
    });
  }
  function setProgress(title, detail) {
    if (byId('documentImportProgressTitle')) byId('documentImportProgressTitle').textContent = title;
    if (byId('documentImportProgressText')) byId('documentImportProgressText').textContent = detail || '';
  }
  function openImportModal() {
    previewDocument = null;
    if (currentJob) currentJob.cancelled = true;
    currentJob = null;
    setImportView('documentImportChooser');
    byId('documentImportModal').classList.add('show');
  }
  function closeImportModal() {
    if (currentJob) currentJob.cancelled = true;
    currentJob = null;
    byId('documentImportModal').classList.remove('show');
  }
  function chooseFile() { byId('documentImportFileInput').click(); }

  function validateFile(file) {
    if (!file) throw new Error('请选择文件');
    var ext = fileExtension(file.name);
    var limit = 0;
    if (ext === 'txt' || ext === 'md' || ext === 'markdown') limit = MAX_TEXT_BYTES;
    else if (ext === 'docx') limit = MAX_DOCX_BYTES;
    else if (ext === 'epub') limit = MAX_EPUB_BYTES;
    else if (ext === 'pdf') limit = MAX_PDF_BYTES;
    else throw new Error('暂不支持 .' + (ext || '未知') + ' 文件');
    if (file.size > limit) throw new Error('文件过大：' + formatBytes(file.size) + '，当前格式上限为 ' + formatBytes(limit));
    return ext === 'markdown' ? 'md' : ext;
  }

  function loadClassicScript(config) {
    if (window[config.globalName]) return Promise.resolve(window[config.globalName]);
    function append(src) {
      return new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = function () {
          if (window[config.globalName]) resolve(window[config.globalName]);
          else reject(new Error(config.globalName + ' did not initialise'));
        };
        script.onerror = function () { reject(new Error('无法加载 ' + src)); };
        document.head.appendChild(script);
      });
    }
    return append(new URL(config.local, document.baseURI).href).catch(function () {
      return append(config.remote);
    });
  }

  async function loadPdfJs() {
    if (window.__WRITING_ASSISTANT_PDFJS) return window.__WRITING_ASSISTANT_PDFJS;
    var localModule = new URL(LIBRARIES.pdf.local, document.baseURI).href;
    var localWorker = new URL(LIBRARIES.pdf.workerLocal, document.baseURI).href;
    try {
      var local = await import(localModule);
      local.GlobalWorkerOptions.workerSrc = localWorker;
      window.__WRITING_ASSISTANT_PDFJS = { lib: local, source: 'local' };
      return window.__WRITING_ASSISTANT_PDFJS;
    } catch (localError) {
      var remote = await import(LIBRARIES.pdf.remote);
      remote.GlobalWorkerOptions.workerSrc = LIBRARIES.pdf.workerRemote;
      window.__WRITING_ASSISTANT_PDFJS = { lib: remote, source: 'cdn' };
      return window.__WRITING_ASSISTANT_PDFJS;
    }
  }

  function xmlElements(documentNode, localName) {
    if (!documentNode) return [];
    try { return Array.from(documentNode.getElementsByTagNameNS('*', localName)); }
    catch (error) { return Array.from(documentNode.getElementsByTagName(localName)); }
  }
  function xmlText(documentNode, localName) {
    var element = xmlElements(documentNode, localName)[0];
    return element ? trimmed(element.textContent) : '';
  }
  function parseXml(value, label) {
    var documentNode = new DOMParser().parseFromString(value, 'application/xml');
    if (documentNode.querySelector('parsererror')) throw new Error((label || 'XML') + ' 无法解析');
    return documentNode;
  }
  function normalizeArchivePath(basePath, relativePath) {
    var raw = text(relativePath).split('#')[0].split('?')[0];
    try { raw = decodeURIComponent(raw); } catch (error) {}
    var base = basePath ? basePath.split('/').slice(0, -1) : [];
    var parts = raw.charAt(0) === '/' ? [] : base;
    raw.split('/').forEach(function (part) {
      if (!part || part === '.') return;
      if (part === '..') { if (parts.length) parts.pop(); return; }
      parts.push(part);
    });
    return parts.join('/');
  }
  function extractStructuredTextFromHtml(html, fallbackTitle) {
    var documentNode = new DOMParser().parseFromString(html, 'text/html');
    allFrom(documentNode, 'script,style,noscript,svg,canvas,form,iframe,object,embed').forEach(function (node) { node.remove(); });
    var body = documentNode.body || documentNode.documentElement;
    var titleNode = body && body.querySelector('h1,h2,h3');
    var title = cleanTitle(titleNode && titleNode.textContent || documentNode.title, fallbackTitle);
    var blocks = [];
    if (body) {
      Array.from(body.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre,dt,dd,figcaption')).forEach(function (node) {
        var value = cleanText(node.textContent);
        if (!value) return;
        if (/^H[1-4]$/.test(node.tagName)) blocks.push('#'.repeat(Math.min(4, Number(node.tagName.slice(1)))) + ' ' + value);
        else blocks.push(value);
      });
    }
    if (!blocks.length && body) blocks.push(cleanText(body.textContent));
    return { title: title, text: cleanText(blocks.join('\n\n')) };
  }
  function allFrom(root, selector) { return root ? Array.from(root.querySelectorAll(selector)) : []; }

  function capChapters(chapters, warnings) {
    var totalChars = 0;
    var accepted = [];
    (chapters || []).forEach(function (chapter, index) {
      if (accepted.length >= MAX_CHAPTERS) return;
      var content = cleanText(chapter && chapter.text);
      if (!content) return;
      if (totalChars + content.length > MAX_TOTAL_CHARS) {
        var remaining = Math.max(0, MAX_TOTAL_CHARS - totalChars);
        if (remaining > 500) {
          content = content.slice(0, remaining);
          accepted.push({
            id: chapter.id || safeChapterId(index),
            title: cleanTitle(chapter.title, 'Chapter ' + (index + 1)),
            text: content,
            selected: chapter.selected !== false
          });
        }
        totalChars = MAX_TOTAL_CHARS;
        return;
      }
      accepted.push({
        id: chapter.id || safeChapterId(index),
        title: cleanTitle(chapter.title, 'Chapter ' + (index + 1)),
        text: content,
        selected: chapter.selected !== false
      });
      totalChars += content.length;
    });
    if ((chapters || []).length > MAX_CHAPTERS) warnings.push('章节数超过 ' + MAX_CHAPTERS + '，后续章节未载入。');
    if (totalChars >= MAX_TOTAL_CHARS) warnings.push('正文超过 ' + MAX_TOTAL_CHARS.toLocaleString() + ' 个字符，已按本地性能上限截断。');
    return accepted;
  }

  function chaptersFromText(rawText, title) {
    var item = { id: 'import-preview', title: title || 'Imported text', text: cleanText(rawText) };
    var chapters = workspace.parseChapters(item, 'auto');
    return chapters.map(function (chapter, index) {
      return { id: safeChapterId(index), title: chapter.title, text: chapter.text, selected: true };
    });
  }

  async function parseTextFile(file, format, job) {
    setProgress('正在读取文本', file.name);
    var value = await file.text();
    assertNotCancelled(job);
    value = cleanText(value.replace(/^\uFEFF/, ''));
    if (!value) throw new Error('文件中没有可用文本');
    return {
      format: format,
      title: removeExtension(file.name),
      source: 'Local file · ' + file.name,
      license: 'Personal study',
      tags: [format],
      warnings: [],
      chapters: chaptersFromText(value, removeExtension(file.name)),
      stats: { bytes: file.size, characters: value.length }
    };
  }

  async function parseEpub(file, job) {
    setProgress('正在载入 EPUB 解析器', '首次使用时可能需要下载约 100 KB 的解析库。');
    var JSZip = await loadClassicScript(LIBRARIES.jszip);
    assertNotCancelled(job);
    setProgress('正在解压 EPUB', file.name);
    var zip = await JSZip.loadAsync(await file.arrayBuffer(), { createFolders: false });
    assertNotCancelled(job);
    var warnings = [];
    var containerEntry = zip.file('META-INF/container.xml');
    var rootPath = '';
    if (containerEntry) {
      var containerXml = parseXml(await containerEntry.async('text'), 'EPUB container.xml');
      var rootfile = xmlElements(containerXml, 'rootfile')[0];
      rootPath = rootfile ? rootfile.getAttribute('full-path') || '' : '';
    }
    var chapters = [];
    var title = removeExtension(file.name);
    var author = '';
    if (rootPath && zip.file(rootPath)) {
      var opfXml = parseXml(await zip.file(rootPath).async('text'), 'EPUB OPF');
      title = xmlText(opfXml, 'title') || title;
      author = xmlText(opfXml, 'creator');
      var manifest = {};
      xmlElements(opfXml, 'item').forEach(function (item) {
        var id = item.getAttribute('id');
        if (!id) return;
        manifest[id] = {
          href: item.getAttribute('href') || '',
          mediaType: item.getAttribute('media-type') || '',
          properties: item.getAttribute('properties') || ''
        };
      });
      var spine = xmlElements(opfXml, 'itemref');
      for (var i = 0; i < spine.length; i++) {
        assertNotCancelled(job);
        setProgress('正在读取 EPUB 章节', (i + 1) + ' / ' + spine.length);
        var manifestItem = manifest[spine[i].getAttribute('idref')];
        if (!manifestItem) continue;
        var path = normalizeArchivePath(rootPath, manifestItem.href);
        var entry = zip.file(path);
        if (!entry) { warnings.push('未找到 EPUB 章节文件：' + path); continue; }
        if (!/xhtml|html/i.test(manifestItem.mediaType) && !/\.(xhtml?|html?)$/i.test(path)) continue;
        var parsed = extractStructuredTextFromHtml(await entry.async('text'), 'Chapter ' + (chapters.length + 1));
        if (parsed.text) chapters.push({ id: safeChapterId(chapters.length), title: parsed.title, text: parsed.text, selected: true });
      }
    }
    if (!chapters.length) {
      warnings.push('未找到标准 EPUB spine，已按压缩包中的 HTML 文件顺序尝试读取。');
      var candidates = Object.keys(zip.files).filter(function (name) { return /\.(xhtml?|html?)$/i.test(name) && !zip.files[name].dir; }).sort();
      for (var c = 0; c < candidates.length; c++) {
        assertNotCancelled(job);
        setProgress('正在读取 EPUB 内容', (c + 1) + ' / ' + candidates.length);
        var fallback = extractStructuredTextFromHtml(await zip.file(candidates[c]).async('text'), 'Chapter ' + (chapters.length + 1));
        if (fallback.text) chapters.push({ id: safeChapterId(chapters.length), title: fallback.title, text: fallback.text, selected: true });
      }
    }
    chapters = capChapters(chapters, warnings);
    if (!chapters.length) throw new Error('EPUB 中没有提取到可用正文；受 DRM 保护的电子书无法解析。');
    return {
      format: 'epub',
      title: title,
      source: author ? author + ' · Local EPUB' : 'Local EPUB · ' + file.name,
      license: 'Personal study; verify source copyright',
      tags: unique(['epub', 'book', author]),
      warnings: warnings,
      chapters: chapters,
      stats: { bytes: file.size, characters: chapters.reduce(function (sum, chapter) { return sum + chapter.text.length; }, 0) }
    };
  }

  function htmlToChapters(html, fallbackTitle) {
    var documentNode = new DOMParser().parseFromString(html, 'text/html');
    allFrom(documentNode, 'script,style,noscript,svg,canvas,form,iframe,object,embed,img').forEach(function (node) { node.remove(); });
    var blocks = Array.from((documentNode.body || documentNode.documentElement).querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre,table'));
    var chapters = [];
    var currentTitle = fallbackTitle || 'Full text';
    var bucket = [];
    function flush() {
      var content = cleanText(bucket.join('\n\n'));
      if (content) chapters.push({ id: safeChapterId(chapters.length), title: cleanTitle(currentTitle, 'Chapter ' + (chapters.length + 1)), text: content, selected: true });
      bucket = [];
    }
    blocks.forEach(function (node) {
      var value = cleanText(node.textContent);
      if (!value) return;
      if ((node.tagName === 'H1' || node.tagName === 'H2') && bucket.length) {
        flush();
        currentTitle = value;
      } else if (node.tagName === 'H1' || node.tagName === 'H2') {
        currentTitle = value;
      } else if (node.tagName === 'H3' || node.tagName === 'H4') {
        bucket.push('### ' + value);
      } else {
        bucket.push(value);
      }
    });
    flush();
    if (!chapters.length) {
      var plain = cleanText(documentNode.body && documentNode.body.textContent);
      chapters = chaptersFromText(plain, fallbackTitle);
    }
    return chapters;
  }

  async function parseDocx(file, job) {
    setProgress('正在载入 DOCX 解析器', '首次使用时可能需要下载约 620 KB 的解析库。');
    var mammoth = await loadClassicScript(LIBRARIES.mammoth);
    assertNotCancelled(job);
    setProgress('正在解析 DOCX', file.name);
    var result = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      {
        externalFileAccess: false,
        includeDefaultStyleMap: true,
        ignoreEmptyParagraphs: true,
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading'] => h2:fresh"
        ]
      }
    );
    assertNotCancelled(job);
    var warnings = (result.messages || []).slice(0, 20).map(function (message) { return cleanText(message.message || message); });
    var chapters = capChapters(htmlToChapters(result.value || '', removeExtension(file.name)), warnings);
    if (!chapters.length) throw new Error('DOCX 中没有提取到可用正文');
    return {
      format: 'docx',
      title: removeExtension(file.name),
      source: 'Local DOCX · ' + file.name,
      license: 'Personal study',
      tags: ['docx', 'document'],
      warnings: warnings,
      chapters: chapters,
      stats: { bytes: file.size, characters: chapters.reduce(function (sum, chapter) { return sum + chapter.text.length; }, 0) }
    };
  }

  function median(values) {
    var sorted = values.filter(Number.isFinite).slice().sort(function (a, b) { return a - b; });
    if (!sorted.length) return 0;
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function joinLineItems(items) {
    items.sort(function (a, b) { return a.x - b.x; });
    var result = '';
    var previousEnd = null;
    items.forEach(function (item) {
      if (!item.text) return;
      var gap = previousEnd == null ? 0 : item.x - previousEnd;
      var threshold = Math.max(1.5, (item.height || 8) * 0.18);
      if (result && gap > threshold && !/[\s([{—-]$/.test(result) && !/^[,.;:!?%)\]}]/.test(item.text)) result += ' ';
      result += item.text;
      previousEnd = Math.max(previousEnd == null ? -Infinity : previousEnd, item.x + Math.max(0, item.width || 0));
    });
    return cleanText(result);
  }
  function pageItemsToText(items, pageWidth) {
    var glyphs = (items || []).filter(function (item) {
      return item && typeof item.str === 'string' && trimmed(item.str);
    }).map(function (item) {
      var transform = item.transform || [1, 0, 0, 1, 0, 0];
      return {
        text: item.str,
        x: Number(transform[4]) || 0,
        y: Number(transform[5]) || 0,
        width: Number(item.width) || 0,
        height: Math.abs(Number(item.height) || Number(transform[3]) || 8)
      };
    });
    glyphs.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    glyphs.forEach(function (glyph) {
      var tolerance = Math.max(2.2, glyph.height * 0.38);
      var line = lines.find(function (candidate) { return Math.abs(candidate.y - glyph.y) <= tolerance; });
      if (!line) {
        line = { y: glyph.y, items: [], xMin: glyph.x, xMax: glyph.x + glyph.width, height: glyph.height };
        lines.push(line);
      }
      line.items.push(glyph);
      line.xMin = Math.min(line.xMin, glyph.x);
      line.xMax = Math.max(line.xMax, glyph.x + glyph.width);
      line.height = Math.max(line.height, glyph.height);
    });
    lines.forEach(function (line) {
      line.text = joinLineItems(line.items);
      line.center = (line.xMin + line.xMax) / 2;
      line.span = Math.max(0, line.xMax - line.xMin);
    });
    lines = lines.filter(function (line) { return line.text; }).sort(function (a, b) { return b.y - a.y || a.xMin - b.xMin; });
    var width = Number(pageWidth) || Math.max.apply(null, lines.map(function (line) { return line.xMax; }).concat([1]));
    var left = lines.filter(function (line) { return line.center < width * 0.49 && line.span < width * 0.72; });
    var right = lines.filter(function (line) { return line.center >= width * 0.51 && line.span < width * 0.72; });
    var isTwoColumn = left.length >= 6 && right.length >= 6;
    if (isTwoColumn) {
      var wide = lines.filter(function (line) { return line.span >= width * 0.72 || (line.center >= width * 0.49 && line.center < width * 0.51); });
      var topY = Math.max.apply(null, left.concat(right).map(function (line) { return line.y; }));
      var bottomY = Math.min.apply(null, left.concat(right).map(function (line) { return line.y; }));
      var topWide = wide.filter(function (line) { return line.y >= topY - 8; }).sort(function (a, b) { return b.y - a.y; });
      var middleWide = wide.filter(function (line) { return line.y < topY - 8 && line.y > bottomY + 8; }).sort(function (a, b) { return b.y - a.y; });
      var bottomWide = wide.filter(function (line) { return line.y <= bottomY + 8; }).sort(function (a, b) { return b.y - a.y; });
      lines = topWide
        .concat(left.sort(function (a, b) { return b.y - a.y; }))
        .concat(middleWide)
        .concat(right.sort(function (a, b) { return b.y - a.y; }))
        .concat(bottomWide);
    }
    return cleanText(lines.map(function (line) { return line.text; }).join('\n'));
  }

  async function parsePdf(file, job) {
    setProgress('正在载入 PDF.js', '首次使用时需要载入 PDF 解析模块。');
    var loaded = await loadPdfJs();
    var pdfjs = loaded.lib;
    assertNotCancelled(job);
    setProgress('正在打开 PDF', file.name);
    var loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      useSystemFonts: true,
      stopAtErrors: false
    });
    var pdf = await loadingTask.promise;
    assertNotCancelled(job);
    if (pdf.numPages > MAX_PDF_PAGES) {
      try { await pdf.destroy(); } catch (error) {}
      throw new Error('PDF 共 ' + pdf.numPages + ' 页，超过当前 ' + MAX_PDF_PAGES + ' 页上限');
    }
    var metadata = {};
    try {
      var meta = await pdf.getMetadata();
      metadata = meta && meta.info || {};
    } catch (error) {}
    var pages = [];
    var lowTextPages = 0;
    for (var i = 1; i <= pdf.numPages; i++) {
      assertNotCancelled(job);
      setProgress('正在提取 PDF 文字层', '第 ' + i + ' / ' + pdf.numPages + ' 页');
      var page = await pdf.getPage(i);
      var content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
      var viewport = page.getViewport({ scale: 1 });
      var pageText = pageItemsToText(content.items || [], viewport.width);
      if (pageText.length < 20) lowTextPages++;
      pages.push({ page: i, text: pageText });
      try { page.cleanup(); } catch (error) {}
    }
    try { await pdf.destroy(); } catch (error) {}
    var warnings = [];
    if (loaded.source === 'cdn') warnings.push('本地 PDF.js 资源尚未安装，本次从固定版本 CDN 载入了解析器；PDF 文件本身没有发送到 CDN。');
    var nonEmpty = pages.filter(function (page) { return page.text.length >= 20; });
    var totalText = pages.map(function (page) { return page.text; }).join('\n\n');
    var averageChars = pdf.numPages ? totalText.length / pdf.numPages : 0;
    var scannedLikely = !nonEmpty.length || averageChars < 35 || lowTextPages / Math.max(1, pdf.numPages) > 0.65;
    if (scannedLikely) warnings.push('该 PDF 很可能是扫描件或缺少可用文字层。0.8.0 M1 暂不执行 OCR，后续将提供 PaddleOCR-VL 本地连接器。');
    else if (lowTextPages) warnings.push(lowTextPages + ' 页提取到的文字很少，可能包含扫描页、图片页或复杂排版。');
    if (!trimmed(totalText)) throw new Error('PDF 中没有提取到文字。扫描版 PDF 请等待后续本地 OCR 连接器。');
    var chapters = chaptersFromText(totalText, removeExtension(file.name));
    if (chapters.length <= 1 && pages.length > 12) {
      chapters = [];
      for (var start = 0; start < pages.length; start += 10) {
        var group = pages.slice(start, start + 10);
        var groupText = cleanText(group.map(function (page) { return page.text; }).join('\n\n'));
        if (groupText) chapters.push({
          id: safeChapterId(chapters.length),
          title: 'Pages ' + (start + 1) + '–' + Math.min(pages.length, start + 10),
          text: groupText,
          selected: true
        });
      }
    }
    chapters = capChapters(chapters, warnings);
    return {
      format: 'pdf',
      title: cleanTitle(metadata.Title, removeExtension(file.name)),
      source: cleanTitle(metadata.Author, '') ? cleanTitle(metadata.Author, '') + ' · Local PDF' : 'Local PDF · ' + file.name,
      license: 'Personal study; verify source copyright',
      tags: ['pdf', scannedLikely ? 'possible-scan' : 'text-layer'],
      warnings: warnings,
      chapters: chapters,
      pdfStatus: {
        pages: pages.length,
        lowTextPages: lowTextPages,
        averageChars: Math.round(averageChars),
        scannedLikely: scannedLikely
      },
      stats: { bytes: file.size, characters: totalText.length, pages: pages.length }
    };
  }

  async function parseFile(file, format, job) {
    if (format === 'txt' || format === 'md') return parseTextFile(file, format, job);
    if (format === 'epub') return parseEpub(file, job);
    if (format === 'docx') return parseDocx(file, job);
    if (format === 'pdf') return parsePdf(file, job);
    throw new Error('Unsupported format');
  }

  async function beginImport(file) {
    var format;
    try { format = validateFile(file); }
    catch (error) { actions.showToast(error.message); return; }
    if (currentJob) currentJob.cancelled = true;
    var job = { id: Date.now(), cancelled: false, file: file };
    currentJob = job;
    setImportView('documentImportProgress');
    setProgress('正在准备解析', file.name + ' · ' + formatBytes(file.size));
    try {
      var result = await parseFile(file, format, job);
      assertNotCancelled(job);
      result.fileName = file.name;
      result.fileSize = file.size;
      result.chapters = capChapters(result.chapters, result.warnings || []);
      if (!result.chapters.length) throw new Error('没有生成可保存的章节');
      previewDocument = result;
      renderPreview();
      setImportView('documentImportPreview');
    } catch (error) {
      if (isAbort(error)) {
        setImportView('documentImportChooser');
        actions.showToast('文档解析已取消');
      } else {
        console.error(error);
        setImportView('documentImportChooser');
        actions.showToast(error && error.message ? error.message : '文档解析失败');
      }
    } finally {
      if (currentJob === job) currentJob = null;
    }
  }

  function renderPreview() {
    var documentData = previewDocument;
    if (!documentData) return;
    var selectedFolder = defaultFolderForFormat(documentData.format);
    var stats = documentData.stats || {};
    var summary = [
      '<div><span>格式</span><strong>' + h.escapeHtml(documentData.format.toUpperCase()) + '</strong></div>',
      '<div><span>文件大小</span><strong>' + h.escapeHtml(formatBytes(documentData.fileSize || stats.bytes)) + '</strong></div>',
      '<div><span>章节</span><strong>' + documentData.chapters.length + '</strong></div>',
      '<div><span>字符</span><strong>' + Number(stats.characters || 0).toLocaleString() + '</strong></div>'
    ];
    if (stats.pages) summary.push('<div><span>PDF页数</span><strong>' + stats.pages + '</strong></div>');
    if (documentData.pdfStatus) summary.push('<div><span>文字层</span><strong>' + (documentData.pdfStatus.scannedLikely ? '疑似扫描件' : '已提取') + '</strong></div>');
    byId('documentImportSummary').innerHTML = summary.join('');
    var warnings = unique(documentData.warnings || []);
    byId('documentImportWarnings').innerHTML = warnings.length ? warnings.map(function (warning) {
      return '<div class="import-warning">⚠ ' + h.escapeHtml(warning) + '</div>';
    }).join('') : '<div class="import-success">✓ 文档已在本地完成基础解析，请检查章节后保存。</div>';
    byId('documentImportTitle').value = documentData.title || removeExtension(documentData.fileName);
    byId('documentImportFolder').innerHTML = folderOptions(selectedFolder);
    byId('documentImportSource').value = documentData.source || 'Local file · ' + documentData.fileName;
    byId('documentImportLicense').value = documentData.license || 'Personal study';
    byId('documentImportTags').value = unique(documentData.tags || []).join(', ');
    renderChapterList();
  }

  function renderChapterList() {
    var chapters = previewDocument && previewDocument.chapters || [];
    var selectedCount = chapters.filter(function (chapter) { return chapter.selected !== false; }).length;
    byId('documentImportChapterCount').textContent = selectedCount + ' / ' + chapters.length + ' 已选择';
    byId('documentImportChapterList').innerHTML = chapters.map(function (chapter, index) {
      var words = h.wordCount(chapter.text);
      var preview = chapter.text.slice(0, 2200);
      return [
        '<article class="import-chapter-card" data-import-chapter="' + index + '">',
        '  <div class="import-chapter-head">',
        '    <label class="import-chapter-check"><input type="checkbox" data-chapter-selected="' + index + '"' + (chapter.selected !== false ? ' checked' : '') + ' /><span>导入</span></label>',
        '    <input class="text-input import-chapter-title" data-chapter-title="' + index + '" value="' + escapeAttribute(chapter.title) + '" maxlength="160" />',
        '    <span class="chip neutral">' + words + '词</span>',
        '    <button class="btn small" type="button" data-chapter-up="' + index + '"' + (index === 0 ? ' disabled' : '') + '>↑</button>',
        '    <button class="btn small" type="button" data-chapter-down="' + index + '"' + (index === chapters.length - 1 ? ' disabled' : '') + '>↓</button>',
        '    <button class="btn small danger" type="button" data-chapter-remove="' + index + '">移除</button>',
        '  </div>',
        '  <details>',
        '    <summary>查看并修正文段</summary>',
        '    <textarea class="source-input import-chapter-text" data-chapter-text="' + index + '">' + h.escapeHtml(preview) + (chapter.text.length > preview.length ? '\n\n[预览区域仅显示前 2,200 字符；保存时仍保留完整正文。需要完整编辑将在 M2 提供。]' : '') + '</textarea>',
        '  </details>',
        '</article>'
      ].join('');
    }).join('');
  }

  function updateChapterCount() {
    var chapters = previewDocument && previewDocument.chapters || [];
    var selectedCount = chapters.filter(function (chapter) { return chapter.selected !== false; }).length;
    if (byId('documentImportChapterCount')) byId('documentImportChapterCount').textContent = selectedCount + ' / ' + chapters.length + ' 已选择';
  }

  function syncPreviewFields() {
    if (!previewDocument) return;
    all('[data-chapter-selected]').forEach(function (input) {
      var chapter = previewDocument.chapters[Number(input.dataset.chapterSelected)];
      if (chapter) chapter.selected = input.checked;
    });
    all('[data-chapter-title]').forEach(function (input) {
      var chapter = previewDocument.chapters[Number(input.dataset.chapterTitle)];
      if (chapter) chapter.title = cleanTitle(input.value, chapter.title);
    });
    all('[data-chapter-text]').forEach(function (area) {
      var chapter = previewDocument.chapters[Number(area.dataset.chapterText)];
      if (!chapter) return;
      if (chapter.text.length <= 2200 || area.value.indexOf('[预览区域仅显示前 2,200 字符') < 0) chapter.text = cleanText(area.value);
    });
  }

  function moveChapter(index, delta) {
    syncPreviewFields();
    var target = index + delta;
    if (!previewDocument || target < 0 || target >= previewDocument.chapters.length) return;
    var chapters = previewDocument.chapters;
    var item = chapters.splice(index, 1)[0];
    chapters.splice(target, 0, item);
    renderChapterList();
  }
  function removeChapter(index) {
    syncPreviewFields();
    if (!previewDocument) return;
    previewDocument.chapters.splice(index, 1);
    renderChapterList();
  }

  async function savePreviewDocument() {
    if (!previewDocument) return;
    syncPreviewFields();
    var chapters = previewDocument.chapters.filter(function (chapter) { return chapter.selected !== false && trimmed(chapter.text); });
    if (!chapters.length) { actions.showToast('请至少选择一个包含正文的章节'); return; }
    var title = cleanTitle(byId('documentImportTitle').value, previewDocument.title);
    var folderId = byId('documentImportFolder').value || defaultFolderForFormat(previewDocument.format);
    var tags = unique(byId('documentImportTags').value.split(',').map(trimmed).concat([previewDocument.format]));
    var item = {
      id: h.uid(),
      builtin: false,
      title: title,
      category: categoryForFolder(folderId),
      folderId: folderId,
      source: trimmed(byId('documentImportSource').value) || 'Local file · ' + previewDocument.fileName,
      license: trimmed(byId('documentImportLicense').value) || 'Personal study',
      tags: tags,
      chapterMode: 'auto',
      chapters: chapters.map(function (chapter, index) {
        return { id: chapter.id || safeChapterId(index), title: cleanTitle(chapter.title, 'Chapter ' + (index + 1)), text: cleanText(chapter.text), order: index };
      }),
      text: chapters.map(function (chapter) { return '# ' + cleanTitle(chapter.title, 'Chapter') + '\n\n' + cleanText(chapter.text); }).join('\n\n'),
      importMeta: {
        version: IMPORT_VERSION,
        format: previewDocument.format,
        fileName: previewDocument.fileName,
        fileSize: previewDocument.fileSize,
        importedAt: new Date().toISOString(),
        pdfStatus: previewDocument.pdfStatus || null,
        warnings: unique(previewDocument.warnings || [])
      },
      createdAt: new Date().toISOString()
    };
    if (typeof workspace.prepareImportedItem === 'function') item = workspace.prepareImportedItem(item, item) || item;
    await db.put(stores.library, item);
    await actions.refreshLibrary();
    if (typeof workspace.selectFolder === 'function') workspace.selectFolder(folderId);
    else {
      var appState = core.getState();
      appState.library = appState.library || {};
      appState.library.selectedFolderId = folderId;
      appState.activeLab = 'library';
      actions.persistNow();
      actions.renderAll();
    }
    closeImportModal();
    actions.showToast('已导入 ' + chapters.length + ' 个章节：' + title);
  }

  function bindEvents() {
    ensureButtons();
    injectModal();
    byId('importDocumentBtn').addEventListener('click', openImportModal);
    byId('importDocumentMenuBtn').addEventListener('click', function () {
      var dataMenu = byId('dataMenu');
      if (dataMenu) dataMenu.hidden = true;
      openImportModal();
    });
    var switchButton = byId('switchToDocumentImportBtn');
    if (switchButton) {
      switchButton.addEventListener('click', function () {
        var textModal = byId('materialModal');
        if (textModal) textModal.classList.remove('show');
        openImportModal();
      });
    }
    byId('closeDocumentImportModal').addEventListener('click', closeImportModal);
    byId('documentImportModal').addEventListener('click', function (event) { if (event.target === this) closeImportModal(); });
    byId('documentDropZone').addEventListener('click', chooseFile);
    byId('documentImportFileInput').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (file) beginImport(file);
    });
    ['dragenter', 'dragover'].forEach(function (name) {
      byId('documentDropZone').addEventListener(name, function (event) {
        event.preventDefault();
        event.stopPropagation();
        this.classList.add('dragging');
      });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      byId('documentDropZone').addEventListener(name, function (event) {
        event.preventDefault();
        event.stopPropagation();
        this.classList.remove('dragging');
      });
    });
    byId('documentDropZone').addEventListener('drop', function (event) {
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) beginImport(file);
    });
    var libraryView = byId('libraryView');
    if (libraryView) {
      libraryView.addEventListener('dragover', function (event) {
        if (event.dataTransfer && event.dataTransfer.types && Array.from(event.dataTransfer.types).indexOf('Files') >= 0) event.preventDefault();
      });
      libraryView.addEventListener('drop', function (event) {
        var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (!file || event.target.closest('#documentImportModal')) return;
        event.preventDefault();
        openImportModal();
        beginImport(file);
      });
    }
    byId('cancelDocumentImportBtn').addEventListener('click', function () {
      if (currentJob) currentJob.cancelled = true;
      setProgress('正在取消', '已停止继续处理；当前页完成后会返回。');
    });
    byId('chooseAnotherDocumentBtn').addEventListener('click', function () {
      previewDocument = null;
      setImportView('documentImportChooser');
    });
    byId('selectAllImportChapters').addEventListener('click', function () {
      if (!previewDocument) return;
      previewDocument.chapters.forEach(function (chapter) { chapter.selected = true; });
      renderChapterList();
    });
    byId('clearAllImportChapters').addEventListener('click', function () {
      if (!previewDocument) return;
      previewDocument.chapters.forEach(function (chapter) { chapter.selected = false; });
      renderChapterList();
    });
    byId('documentImportChapterList').addEventListener('change', function (event) {
      if (event.target.matches('[data-chapter-selected]')) {
        var chapter = previewDocument && previewDocument.chapters[Number(event.target.dataset.chapterSelected)];
        if (chapter) chapter.selected = event.target.checked;
        updateChapterCount();
      } else if (event.target.matches('[data-chapter-title]')) {
        var titleChapter = previewDocument && previewDocument.chapters[Number(event.target.dataset.chapterTitle)];
        if (titleChapter) titleChapter.title = cleanTitle(event.target.value, titleChapter.title);
      }
    });
    byId('documentImportChapterList').addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.chapterUp != null) moveChapter(Number(button.dataset.chapterUp), -1);
      if (button.dataset.chapterDown != null) moveChapter(Number(button.dataset.chapterDown), 1);
      if (button.dataset.chapterRemove != null) removeChapter(Number(button.dataset.chapterRemove));
    });
    byId('saveImportedDocumentBtn').addEventListener('click', function () {
      savePreviewDocument().catch(function (error) {
        console.error(error);
        actions.showToast('文档保存失败');
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && byId('documentImportModal').classList.contains('show')) closeImportModal();
    });
  }

  window.WritingAssistantDocumentImport = {
    version: IMPORT_VERSION,
    open: openImportModal,
    parseText: chaptersFromText,
    pageItemsToText: pageItemsToText
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { window.setTimeout(bindEvents, 0); });
  else window.setTimeout(bindEvents, 0);
})();
