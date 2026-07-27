(function () {
  'use strict';

  var core = window.WritingAssistantCore;
  var workspace = window.WritingAssistantWorkspace;
  if (!core || !workspace) return;

  var h = core.helpers;
  var db = core.db;
  var actions = core.actions;
  var stores = core.stores;

  var IMPORT_VERSION = '0.8.0-m3';
  var MAX_TEXT_BYTES = 8 * 1024 * 1024;
  var MAX_DOCX_BYTES = 45 * 1024 * 1024;
  var MAX_EPUB_BYTES = 70 * 1024 * 1024;
  var MAX_PDF_BYTES = 90 * 1024 * 1024;
  var MAX_PDF_PAGES = 600;
  var MAX_CHAPTERS = 500;
  var MAX_TOTAL_CHARS = 6_000_000;
  var currentJob = null;
  var previewDocument = null;
  var editingOriginal = null;
  var chapterHistory = [];
  var currentChapterEditorIndex = -1;

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
  function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
  function fileLimitFor(format) {
    if (format === 'txt' || format === 'md') return MAX_TEXT_BYTES;
    if (format === 'docx') return MAX_DOCX_BYTES;
    if (format === 'epub') return MAX_EPUB_BYTES;
    if (format === 'pdf') return MAX_PDF_BYTES;
    return 0;
  }
  function selectedPreviewChapters() {
    return previewDocument && Array.isArray(previewDocument.chapters)
      ? previewDocument.chapters.filter(function (chapter) { return chapter.selected !== false && trimmed(chapter.text); })
      : [];
  }
  function previewMetrics() {
    var chapters = selectedPreviewChapters();
    var combined = chapters.map(function (chapter) { return chapter.text; }).join('\n\n');
    var characters = chapters.reduce(function (sum, chapter) { return sum + text(chapter.text).length; }, 0);
    var words = h.wordCount(combined);
    var sentenceUnits = h.sentenceSplit(combined).filter(Boolean).length;
    var paragraphUnits = h.paragraphSplit(combined).filter(Boolean).length;
    return {
      chapters: chapters.length,
      characters: characters,
      words: words,
      sentenceUnits: sentenceUnits,
      paragraphUnits: paragraphUnits,
      sentenceBatches: Math.ceil(sentenceUnits / 45),
      paragraphBatches: Math.ceil(paragraphUnits / 45)
    };
  }
  function rememberChapterState() {
    if (!previewDocument) return;
    chapterHistory.push(deepClone(previewDocument.chapters || []));
    if (chapterHistory.length > 10) chapterHistory.shift();
  }
  function undoChapterState() {
    if (!previewDocument || !chapterHistory.length) return;
    previewDocument.chapters = chapterHistory.pop();
    renderChapterList();
    actions.showToast('已撤销上一步章节修改');
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
      '    <div><h2 id="documentImportModalTitle">导入文档</h2><p class="import-modal-sub" id="documentImportModalSub">文件在当前浏览器中解析，不会上传到 Writing Assistant 服务器。</p></div>',
      '    <button class="btn small" id="closeDocumentImportModal" type="button">关闭</button>',
      '  </div>',
      '  <div class="modal-body">',
      '    <section id="documentImportChooser" class="document-import-chooser">',
      '      <button class="document-drop-zone" id="documentDropZone" type="button">',
      '        <span class="document-drop-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v11m0-11L7.8 7.2M12 3l4.2 4.2M5 14.5v3.2A2.3 2.3 0 0 0 7.3 20h9.4a2.3 2.3 0 0 0 2.3-2.3v-3.2"/></svg></span>',
      '        <strong>选择文件，或拖到这里</strong>',
      '        <span>支持 EPUB、DOCX、带文字层的 PDF、TXT 和 Markdown</span>',
      '        <small>文件只在当前浏览器中解析，不会上传。扫描 PDF 将在 M4 通过可选本地 OCR 处理。</small>',
      '      </button>',
      '      <div class="import-limit-chips"><span>TXT / MD ≤ 8 MB</span><span>DOCX ≤ 45 MB</span><span>EPUB ≤ 70 MB</span><span>PDF ≤ 90 MB · 600页</span></div>',
      '    </section>',
      '    <section id="documentImportProgress" hidden>',
      '      <div class="import-progress-card">',
      '        <div class="import-spinner" aria-hidden="true"></div>',
      '        <div><strong id="documentImportProgressTitle">正在解析文档</strong><p id="documentImportProgressText">准备读取……</p></div>',
      '      </div>',
      '      <button class="btn" id="cancelDocumentImportBtn" type="button">取消解析</button>',
      '    </section>',
      '    <section id="documentImportPreview" class="document-import-preview" hidden>',
      '      <section class="import-overview-panel">',
      '        <div class="import-section-heading"><div><span class="section-kicker">DOCUMENT OVERVIEW</span><h3>文档概览</h3></div><span class="local-processing-badge">仅本地处理</span></div>',
      '        <div class="import-summary" id="documentImportSummary"></div>',
      '        <div class="import-warning-list" id="documentImportWarnings"></div>',
      '      </section>',
      '      <section class="import-meta-panel">',
      '        <div class="import-section-heading"><div><span class="section-kicker">LIBRARY DETAILS</span><h3>材料信息</h3></div></div>',
      '        <div class="import-meta-grid">',
      '          <div class="field import-title-field"><label for="documentImportTitle">材料标题</label><input class="text-input" id="documentImportTitle" style="width:100%" maxlength="160" /></div>',
      '          <div class="field"><label for="documentImportFolder">保存到文件夹</label><select id="documentImportFolder" style="width:100%"></select></div>',
      '          <div class="field"><label for="documentImportSource">来源</label><input class="text-input" id="documentImportSource" style="width:100%" maxlength="240" /></div>',
      '          <div class="field"><label for="documentImportLicense">许可或用途</label><input class="text-input" id="documentImportLicense" style="width:100%" maxlength="240" /></div>',
      '          <div class="field import-tags-field"><label for="documentImportTags">标签（逗号分隔）</label><input class="text-input" id="documentImportTags" style="width:100%" maxlength="500" /></div>',
      '        </div>',
      '      </section>',
      '      <section class="import-chapters-panel">',
      '        <div class="import-chapter-toolbar">',
      '          <div><span class="section-kicker">CHAPTERS</span><strong>章节结构</strong><span id="documentImportChapterCount"></span></div>',
      '          <div class="chapter-toolbar-actions"><button class="btn small quiet" id="undoImportChapterChange" type="button" hidden>撤销</button><button class="btn small quiet" id="selectAllImportChapters" type="button">全选</button><button class="btn small quiet" id="clearAllImportChapters" type="button">全不选</button></div>',
      '        </div>',
      '        <div class="import-chapter-list" id="documentImportChapterList"></div>',
      '      </section>',
      '      <div class="modal-actions import-save-actions">',
      '        <button class="btn quiet" id="chooseAnotherDocumentBtn" type="button">重新选择</button>',
      '        <button class="btn primary" id="saveImportedDocumentBtn" type="button">保存到练习库</button>',
      '      </div>',
      '    </section>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    var editor = document.createElement('div');
    editor.id = 'chapterEditorModal';
    editor.className = 'modal-backdrop';
    editor.setAttribute('role', 'dialog');
    editor.setAttribute('aria-modal', 'true');
    editor.innerHTML = '<div class="modal chapter-editor-modal"><div class="modal-head"><div><h2>完整编辑章节</h2><p class="import-modal-sub">可以修改全文，或把光标放在分割位置后拆成两个章节。</p></div><button class="btn small" id="closeChapterEditorModal" type="button">关闭</button></div><div class="modal-body"><div class="field"><label for="chapterEditorTitle">章节标题</label><input class="text-input" id="chapterEditorTitle" style="width:100%" maxlength="160" /></div><textarea class="source-input chapter-editor-text" id="chapterEditorText"></textarea><div class="chapter-editor-stats" id="chapterEditorStats"></div><div class="modal-actions"><button class="btn" id="splitChapterAtCursorBtn" type="button">在光标处分成两章</button><button class="btn primary" id="saveChapterEditorBtn" type="button">保存章节</button></div></div></div>';
    document.body.appendChild(editor);
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
  function resetImportMode() {
    editingOriginal = null;
    chapterHistory = [];
    currentChapterEditorIndex = -1;
    if (byId('documentImportModalTitle')) byId('documentImportModalTitle').textContent = '导入文档';
    if (byId('documentImportModalSub')) byId('documentImportModalSub').textContent = '文件在当前浏览器中解析，不会上传到 Writing Assistant 服务器。';
    if (byId('chooseAnotherDocumentBtn')) byId('chooseAnotherDocumentBtn').hidden = false;
    if (byId('saveImportedDocumentBtn')) byId('saveImportedDocumentBtn').textContent = '保存到练习库';
  }
  function openImportModal() {
    previewDocument = null;
    if (currentJob) currentJob.cancelled = true;
    currentJob = null;
    resetImportMode();
    setImportView('documentImportChooser');
    byId('documentImportModal').classList.add('show');
  }
  function openPreparedDocument(data) {
    data = data || {};
    if (currentJob) currentJob.cancelled = true;
    currentJob = null;
    resetImportMode();
    var rawChapters = Array.isArray(data.chapters) ? data.chapters : [];
    var chapters = rawChapters.map(function (chapter, index) {
      return {
        id: chapter.id || safeChapterId(index),
        title: cleanTitle(chapter.title, 'Chapter ' + (index + 1)),
        text: cleanText(chapter.text),
        selected: chapter.selected !== false
      };
    }).filter(function (chapter) { return chapter.text; });
    if (!chapters.length) { actions.showToast('在线页面没有生成可导入的正文'); return false; }
    chapterHistory = [];
    previewDocument = {
      mode: 'import',
      format: cleanTitle(data.format || 'web', 'web').toLowerCase(),
      title: cleanTitle(data.title, 'Online resource'),
      source: trimmed(data.source),
      license: trimmed(data.license) || 'Verify the source page license before reuse',
      tags: unique(data.tags || []),
      folderId: data.folderId || currentFolderId(),
      fileName: data.fileName || cleanTitle(data.title, 'online-resource'),
      fileSize: Number(data.fileSize) || chapters.reduce(function (sum, chapter) { return sum + chapter.text.length; }, 0),
      warnings: unique(data.warnings || []),
      pdfStatus: null,
      remoteMeta: data.remoteMeta ? deepClone(data.remoteMeta) : null,
      stats: Object.assign({ characters: chapters.reduce(function (sum, chapter) { return sum + chapter.text.length; }, 0), pages: 0 }, data.stats || {}),
      chapters: chapters
    };
    byId('documentImportModalTitle').textContent = '预览在线资源';
    byId('documentImportModalSub').textContent = '页面正文刚刚从公开来源获取。保存前请检查章节、来源和许可信息。';
    byId('chooseAnotherDocumentBtn').hidden = true;
    byId('saveImportedDocumentBtn').textContent = '保存到本地练习库';
    renderPreview();
    setImportView('documentImportPreview');
    byId('documentImportModal').classList.add('show');
    return true;
  }

  async function openExistingItem(itemId) {
    if (currentJob) currentJob.cancelled = true;
    currentJob = null;
    var item = await db.get(stores.library, itemId);
    if (!item) { actions.showToast('只能编辑保存在本地的材料'); return; }
    var chapters = Array.isArray(item.chapters) && item.chapters.length
      ? item.chapters.map(function (chapter, index) { return { id: chapter.id || safeChapterId(index), title: cleanTitle(chapter.title, 'Chapter ' + (index + 1)), text: cleanText(chapter.text), selected: true }; })
      : workspace.parseChapters(item, item.chapterMode || 'auto').map(function (chapter, index) { return { id: chapter.id || safeChapterId(index), title: chapter.title, text: chapter.text, selected: true }; });
    editingOriginal = deepClone(item);
    chapterHistory = [];
    previewDocument = {
      mode: 'edit', itemId: item.id, format: item.importMeta && item.importMeta.format || 'text',
      title: item.title, source: item.source || '', license: item.license || '', tags: item.tags || [],
      folderId: item.folderId || defaultFolderForFormat(item.importMeta && item.importMeta.format || 'text'),
      fileName: item.importMeta && item.importMeta.fileName || item.title,
      fileSize: item.importMeta && item.importMeta.fileSize || 0,
      warnings: item.importMeta && item.importMeta.warnings || [], pdfStatus: item.importMeta && item.importMeta.pdfStatus || null,
      stats: { characters: chapters.reduce(function (sum, chapter) { return sum + chapter.text.length; }, 0), pages: item.importMeta && item.importMeta.pdfStatus && item.importMeta.pdfStatus.pages || 0 },
      chapters: chapters
    };
    byId('documentImportModalTitle').textContent = '编辑文档';
    byId('documentImportModalSub').textContent = '修改元数据和章节结构。材料ID保持不变；正文变化可能需要清除对应章节的旧进度。';
    byId('chooseAnotherDocumentBtn').hidden = true;
    byId('saveImportedDocumentBtn').textContent = '保存文档修改';
    renderPreview();
    setImportView('documentImportPreview');
    byId('documentImportModal').classList.add('show');
  }
  function closeImportModal() {
    if (currentJob) currentJob.cancelled = true;
    currentJob = null;
    byId('documentImportModal').classList.remove('show');
    byId('chapterEditorModal').classList.remove('show');
  }
  function chooseFile() { byId('documentImportFileInput').click(); }

  function validateFile(file) {
    if (!file) throw new Error('请选择文件');
    var ext = fileExtension(file.name);
    if (ext === 'markdown') ext = 'md';
    var limit = fileLimitFor(ext);
    if (!limit) throw new Error('暂不支持 .' + (ext || '未知') + ' 文件');
    if (file.size > limit) throw new Error('文件过大：' + formatBytes(file.size) + '，当前格式上限为 ' + formatBytes(limit));
    return ext;
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
  function analysePageItems(items, pageWidth) {
    var glyphs = (items || []).filter(function (item) {
      return item && typeof item.str === 'string' && trimmed(item.str);
    }).map(function (item) {
      var transform = item.transform || [1, 0, 0, 1, 0, 0];
      return { text: item.str, x: Number(transform[4]) || 0, y: Number(transform[5]) || 0, width: Number(item.width) || 0, height: Math.abs(Number(item.height) || Number(transform[3]) || 8) };
    });
    glyphs.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    glyphs.forEach(function (glyph) {
      var tolerance = Math.max(2.2, glyph.height * 0.38);
      var line = lines.find(function (candidate) { return Math.abs(candidate.y - glyph.y) <= tolerance; });
      if (!line) { line = { y: glyph.y, items: [], xMin: glyph.x, xMax: glyph.x + glyph.width, height: glyph.height }; lines.push(line); }
      line.items.push(glyph); line.xMin = Math.min(line.xMin, glyph.x); line.xMax = Math.max(line.xMax, glyph.x + glyph.width); line.height = Math.max(line.height, glyph.height);
    });
    lines.forEach(function (line) { line.text = joinLineItems(line.items); line.center = (line.xMin + line.xMax) / 2; line.span = Math.max(0, line.xMax - line.xMin); });
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
      lines = topWide.concat(left.sort(function (a, b) { return b.y - a.y; })).concat(middleWide).concat(right.sort(function (a, b) { return b.y - a.y; })).concat(bottomWide);
    }
    return { text: cleanText(lines.map(function (line) { return line.text; }).join('\n')), isTwoColumn: isTwoColumn, lineCount: lines.length, glyphCount: glyphs.length };
  }
  function pageItemsToText(items, pageWidth) { return analysePageItems(items, pageWidth).text; }

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
    var twoColumnPages = 0;
    var pageCharCounts = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      assertNotCancelled(job);
      setProgress('正在提取 PDF 文字层', '第 ' + i + ' / ' + pdf.numPages + ' 页');
      var page = await pdf.getPage(i);
      var content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
      var viewport = page.getViewport({ scale: 1 });
      var pageAnalysis = analysePageItems(content.items || [], viewport.width);
      var pageText = pageAnalysis.text;
      if (pageText.length < 20) lowTextPages++;
      if (pageAnalysis.isTwoColumn) twoColumnPages++;
      pageCharCounts.push(pageText.length);
      pages.push({ page: i, text: pageText, twoColumn: pageAnalysis.isTwoColumn, lineCount: pageAnalysis.lineCount });
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
    if (twoColumnPages) warnings.push('检测到 ' + twoColumnPages + ' 页可能采用双栏排版；已尝试按左栏后右栏排序，但保存前仍应抽查正文。');
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
        lowTextRatio: Number((lowTextPages / Math.max(1, pages.length)).toFixed(3)),
        averageChars: Math.round(averageChars),
        medianChars: Math.round(median(pageCharCounts)),
        twoColumnPages: twoColumnPages,
        scannedLikely: scannedLikely,
        quality: scannedLikely ? 'scan-likely' : (twoColumnPages ? 'complex-layout' : (lowTextPages ? 'mixed' : 'text-layer'))
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
    var softLimit = fileLimitFor(format);
    if (softLimit && file.size > softLimit * 0.75 && !window.confirm('这个文件接近当前浏览器解析上限（' + formatBytes(file.size) + ' / ' + formatBytes(softLimit) + '）。解析可能较慢或占用较多内存，是否继续？')) return;
    resetImportMode();
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

  function pdfQualityLabel(status) {
    if (!status) return '';
    if (status.quality === 'scan-likely') return '疑似扫描件';
    if (status.quality === 'complex-layout') return '复杂/双栏';
    if (status.quality === 'mixed') return '混合文字层';
    return '文字层良好';
  }
  function renderPreviewSummary() {
    if (!previewDocument) return;
    var metrics = previewMetrics();
    var stats = previewDocument.stats || {};
    var summary = [
      '<div><span>格式</span><strong>' + h.escapeHtml(String(previewDocument.format || 'text').toUpperCase()) + '</strong></div>',
      '<div><span>文件大小</span><strong>' + h.escapeHtml(formatBytes(previewDocument.fileSize || stats.bytes)) + '</strong></div>',
      '<div><span>已选章节</span><strong>' + metrics.chapters + '</strong></div>',
      '<div><span>词数</span><strong>' + metrics.words.toLocaleString() + '</strong></div>',
      '<div><span>字符</span><strong>' + metrics.characters.toLocaleString() + '</strong></div>',
      '<div><span>句子单元</span><strong>约 ' + metrics.sentenceUnits.toLocaleString() + '</strong></div>',
      '<div><span>段落单元</span><strong>约 ' + metrics.paragraphUnits.toLocaleString() + '</strong></div>',
      '<div><span>45单元批次</span><strong>句 ' + metrics.sentenceBatches + ' / 段 ' + metrics.paragraphBatches + '</strong></div>'
    ];
    if (stats.pages) summary.push('<div><span>PDF页数</span><strong>' + stats.pages + '</strong></div>');
    if (previewDocument.pdfStatus) summary.push('<div><span>PDF质量</span><strong>' + h.escapeHtml(pdfQualityLabel(previewDocument.pdfStatus)) + '</strong></div>');
    byId('documentImportSummary').innerHTML = summary.join('');
    var selectedCount = selectedPreviewChapters().length;
    byId('documentImportChapterCount').textContent = selectedCount + ' / ' + (previewDocument.chapters || []).length + ' 已选择';
    byId('undoImportChapterChange').hidden = !chapterHistory.length;
  }
  function renderPreview() {
    var documentData = previewDocument;
    if (!documentData) return;
    var selectedFolder = documentData.folderId || defaultFolderForFormat(documentData.format);
    var warnings = unique(documentData.warnings || []);
    byId('documentImportWarnings').innerHTML = warnings.length ? warnings.map(function (warning) { return '<div class="import-warning">⚠ ' + h.escapeHtml(warning) + '</div>'; }).join('') : '<div class="import-success">✓ 文档已在本地完成解析。保存前可继续调整章节结构。</div>';
    byId('documentImportTitle').value = documentData.title || removeExtension(documentData.fileName);
    byId('documentImportFolder').innerHTML = folderOptions(selectedFolder);
    byId('documentImportSource').value = documentData.source || 'Local file · ' + documentData.fileName;
    byId('documentImportLicense').value = documentData.license || 'Personal study';
    byId('documentImportTags').value = unique(documentData.tags || []).join(', ');
    renderChapterList();
  }
  function renderChapterList() {
    var chapters = previewDocument && previewDocument.chapters || [];
    byId('documentImportChapterList').innerHTML = chapters.map(function (chapter, index) {
      var words = h.wordCount(chapter.text);
      var characters = text(chapter.text).length;
      var snippet = cleanText(chapter.text).slice(0, 520);
      return [
        '<article class="import-chapter-card" data-import-chapter="' + index + '">',
        '  <div class="import-chapter-head">',
        '    <label class="import-chapter-check"><input type="checkbox" data-chapter-selected="' + index + '"' + (chapter.selected !== false ? ' checked' : '') + ' /><span>' + (previewDocument && previewDocument.mode === 'edit' ? '保留' : '导入') + '</span></label>',
        '    <div class="import-chapter-title-block">',
        '      <input class="text-input import-chapter-title" data-chapter-title="' + index + '" value="' + escapeAttribute(chapter.title) + '" maxlength="160" />',
        '      <div class="import-chapter-stats"><span>' + words + ' 词</span><span>' + characters.toLocaleString() + ' 字符</span></div>',
        '    </div>',
        '    <button class="btn small soft chapter-edit-primary" type="button" data-chapter-edit="' + index + '">编辑正文</button>',
        '  </div>',
        '  <div class="import-chapter-snippet">' + h.escapeHtml(snippet) + (chapter.text.length > snippet.length ? '…' : '') + '</div>',
        '  <details class="chapter-structure-menu">',
        '    <summary>结构操作</summary>',
        '    <div class="chapter-structure-actions">',
        '      <button class="btn small quiet" type="button" data-chapter-merge-prev="' + index + '"' + (index === 0 ? ' disabled' : '') + '>并入上一章</button>',
        '      <button class="btn small quiet" type="button" data-chapter-merge-next="' + index + '"' + (index === chapters.length - 1 ? ' disabled' : '') + '>合并下一章</button>',
        '      <button class="btn small quiet icon-only-action" type="button" data-chapter-up="' + index + '"' + (index === 0 ? ' disabled' : '') + ' aria-label="上移章节" title="上移章节">↑</button>',
        '      <button class="btn small quiet icon-only-action" type="button" data-chapter-down="' + index + '"' + (index === chapters.length - 1 ? ' disabled' : '') + ' aria-label="下移章节" title="下移章节">↓</button>',
        '      <button class="btn small quiet danger-text-button" type="button" data-chapter-remove="' + index + '">移除章节</button>',
        '    </div>',
        '  </details>',
        '</article>'
      ].join('');
    }).join('');
    renderPreviewSummary();
  }
  function updateChapterCount() { renderPreviewSummary(); }
  function syncPreviewFields() {
    if (!previewDocument) return;
    all('[data-chapter-selected]').forEach(function (input) { var chapter = previewDocument.chapters[Number(input.dataset.chapterSelected)]; if (chapter) chapter.selected = input.checked; });
    all('[data-chapter-title]').forEach(function (input) { var chapter = previewDocument.chapters[Number(input.dataset.chapterTitle)]; if (chapter) chapter.title = cleanTitle(input.value, chapter.title); });
  }
  function moveChapter(index, delta) {
    syncPreviewFields();
    var target = index + delta;
    if (!previewDocument || target < 0 || target >= previewDocument.chapters.length) return;
    rememberChapterState();
    var item = previewDocument.chapters.splice(index, 1)[0];
    previewDocument.chapters.splice(target, 0, item);
    renderChapterList();
  }
  function removeChapter(index) {
    syncPreviewFields();
    if (!previewDocument || !previewDocument.chapters[index]) return;
    rememberChapterState();
    previewDocument.chapters.splice(index, 1);
    renderChapterList();
  }
  function mergeChapter(index, delta) {
    syncPreviewFields();
    if (!previewDocument) return;
    var other = index + delta;
    if (other < 0 || other >= previewDocument.chapters.length) return;
    rememberChapterState();
    if (delta < 0) {
      previewDocument.chapters[other].text = cleanText(previewDocument.chapters[other].text + '\n\n' + previewDocument.chapters[index].text);
      previewDocument.chapters.splice(index, 1);
    } else {
      previewDocument.chapters[index].text = cleanText(previewDocument.chapters[index].text + '\n\n' + previewDocument.chapters[other].text);
      previewDocument.chapters.splice(other, 1);
    }
    renderChapterList();
    actions.showToast('章节已合并，可点击撤销');
  }
  function openChapterEditor(index) {
    syncPreviewFields();
    var chapter = previewDocument && previewDocument.chapters[index];
    if (!chapter) return;
    currentChapterEditorIndex = index;
    byId('chapterEditorTitle').value = chapter.title || '';
    byId('chapterEditorText').value = chapter.text || '';
    updateChapterEditorStats();
    byId('chapterEditorModal').classList.add('show');
    window.setTimeout(function () { byId('chapterEditorText').focus(); }, 0);
  }
  function closeChapterEditor() { byId('chapterEditorModal').classList.remove('show'); currentChapterEditorIndex = -1; }
  function updateChapterEditorStats() {
    var value = byId('chapterEditorText').value || '';
    byId('chapterEditorStats').textContent = h.wordCount(value).toLocaleString() + '词 · ' + value.length.toLocaleString() + '字符 · 约 ' + h.sentenceSplit(value).length + '个句子单元';
  }
  function saveChapterEditor() {
    var chapter = previewDocument && previewDocument.chapters[currentChapterEditorIndex];
    if (!chapter) return;
    var value = cleanText(byId('chapterEditorText').value);
    if (!value) { actions.showToast('章节正文不能为空'); return; }
    rememberChapterState();
    chapter.title = cleanTitle(byId('chapterEditorTitle').value, chapter.title);
    chapter.text = value;
    closeChapterEditor();
    renderChapterList();
  }
  function splitChapterAtCursor() {
    var chapter = previewDocument && previewDocument.chapters[currentChapterEditorIndex];
    if (!chapter) return;
    var area = byId('chapterEditorText');
    var value = area.value || '';
    var cursor = Number(area.selectionStart);
    if (!Number.isFinite(cursor) || cursor < 40 || value.length - cursor < 40) { actions.showToast('请把光标放在两段有效正文之间，每一部分至少保留约40个字符'); return; }
    var left = cleanText(value.slice(0, cursor));
    var right = cleanText(value.slice(cursor));
    if (!left || !right) { actions.showToast('分割位置无效'); return; }
    rememberChapterState();
    var baseTitle = cleanTitle(byId('chapterEditorTitle').value, chapter.title);
    chapter.title = baseTitle;
    chapter.text = left;
    previewDocument.chapters.splice(currentChapterEditorIndex + 1, 0, { id: safeChapterId(currentChapterEditorIndex + 1), title: cleanTitle(baseTitle + ' · Part 2', 'Chapter'), text: right, selected: chapter.selected !== false });
    closeChapterEditor();
    renderChapterList();
    actions.showToast('章节已拆分，可点击撤销');
  }
  function chapterMap(chapters) { var result = {}; (chapters || []).forEach(function (chapter) { result[chapter.id] = chapter; }); return result; }
  async function reconcileProgress(documentId, originalItem, nextItem) {
    var originalChapters = Array.isArray(originalItem && originalItem.chapters) ? originalItem.chapters : workspace.parseChapters(originalItem || {}, originalItem && originalItem.chapterMode || 'auto');
    var original = chapterMap(originalChapters);
    var next = chapterMap(nextItem.chapters);
    var affected = {};
    Object.keys(original).forEach(function (id) { if (!next[id] || cleanText(original[id].text) !== cleanText(next[id].text)) affected[id] = true; });
    var records = await db.getAll(stores.progress);
    var relevant = records.filter(function (record) { return record.documentId === documentId; });
    var affectedRecords = relevant.filter(function (record) { return affected[record.chapterId]; });
    if (affectedRecords.length && !window.confirm('章节正文、合并、拆分或删除会使 ' + affectedRecords.length + ' 条已保存章节进度与新原文不再对应。继续后只会清除受影响章节的进度，其他章节保留。是否继续？')) return false;
    for (var i = 0; i < relevant.length; i++) {
      var record = relevant[i];
      if (affected[record.chapterId]) { await db.delete(stores.progress, record.id); continue; }
      if (!record.snapshot) continue;
      record.snapshot.title = nextItem.title;
      record.snapshot.documentTitle = nextItem.title;
      if (next[record.chapterId]) record.snapshot.chapterTitle = next[record.chapterId].title;
      record.updatedAt = new Date().toISOString();
      await db.put(stores.progress, record);
    }
    var appState = core.getState();
    ['sentence', 'paragraph'].forEach(function (lab) {
      var current = appState[lab];
      if (!current || current.documentId !== documentId) return;
      if (affected[current.chapterId]) {
        if (lab === 'sentence') appState.sentence = { materialId:'',title:'',text:'',source:'',license:'',tags:[],splitMode:current.splitMode||'sentence',targetWords:current.targetWords||45,segments:[],answers:[],notes:[],current:0,mode:current.mode||'imitate' };
        else appState.paragraph = { materialId:'',title:'',text:'',source:'',license:'',tags:[],paragraphs:[],records:[],current:0,mode:current.mode||'breakdown' };
      } else {
        current.title = nextItem.title; current.documentTitle = nextItem.title;
        if (next[current.chapterId]) current.chapterTitle = next[current.chapterId].title;
      }
    });
    actions.persistNow();
    return true;
  }
  async function savePreviewDocument() {
    if (!previewDocument) return;
    syncPreviewFields();
    var chapters = selectedPreviewChapters();
    if (!chapters.length) { actions.showToast('请至少选择一个包含正文的章节'); return; }
    var title = cleanTitle(byId('documentImportTitle').value, previewDocument.title);
    var folderId = byId('documentImportFolder').value || defaultFolderForFormat(previewDocument.format);
    var tags = unique(byId('documentImportTags').value.split(',').map(trimmed).concat([previewDocument.format]));
    var now = new Date().toISOString();
    var isEdit = previewDocument.mode === 'edit' && editingOriginal;
    var item = isEdit ? Object.assign({}, editingOriginal) : { id: h.uid(), builtin: false, createdAt: now };
    Object.assign(item, {
      builtin: false, title: title, category: categoryForFolder(folderId), folderId: folderId,
      source: trimmed(byId('documentImportSource').value) || 'Local file · ' + previewDocument.fileName,
      license: trimmed(byId('documentImportLicense').value) || 'Personal study', tags: tags, chapterMode: 'auto',
      chapters: chapters.map(function (chapter, index) { return { id: chapter.id || safeChapterId(index), title: cleanTitle(chapter.title, 'Chapter ' + (index + 1)), text: cleanText(chapter.text), order: index }; }),
      text: chapters.map(function (chapter) { return '# ' + cleanTitle(chapter.title, 'Chapter') + '\n\n' + cleanText(chapter.text); }).join('\n\n'),
      updatedAt: now
    });
    item.importMeta = Object.assign({}, item.importMeta || {}, {
      version: IMPORT_VERSION, format: previewDocument.format, fileName: previewDocument.fileName,
      fileSize: previewDocument.fileSize, importedAt: item.importMeta && item.importMeta.importedAt || now,
      editedAt: isEdit ? now : null, pdfStatus: previewDocument.pdfStatus || null, warnings: unique(previewDocument.warnings || []),
      remote: previewDocument.remoteMeta ? deepClone(previewDocument.remoteMeta) : (item.importMeta && item.importMeta.remote || null)
    });
    if (typeof workspace.prepareImportedItem === 'function') item = workspace.prepareImportedItem(item, item) || item;
    if (isEdit && !(await reconcileProgress(item.id, editingOriginal, item))) return;
    await db.put(stores.library, item);
    await actions.refreshLibrary();
    if (typeof workspace.selectFolder === 'function') workspace.selectFolder(folderId);
    closeImportModal();
    actions.renderAll();
    actions.showToast(isEdit ? '文档修改已保存：' + title : '已导入 ' + chapters.length + ' 个章节：' + title);
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
    byId('closeChapterEditorModal').addEventListener('click', closeChapterEditor);
    byId('chapterEditorModal').addEventListener('click', function (event) { if (event.target === this) closeChapterEditor(); });
    byId('chapterEditorText').addEventListener('input', updateChapterEditorStats);
    byId('saveChapterEditorBtn').addEventListener('click', saveChapterEditor);
    byId('splitChapterAtCursorBtn').addEventListener('click', splitChapterAtCursor);
    byId('undoImportChapterChange').addEventListener('click', undoChapterState);
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
      if (button.dataset.chapterEdit != null) openChapterEditor(Number(button.dataset.chapterEdit));
      if (button.dataset.chapterMergePrev != null) mergeChapter(Number(button.dataset.chapterMergePrev), -1);
      if (button.dataset.chapterMergeNext != null) mergeChapter(Number(button.dataset.chapterMergeNext), 1);
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
      if (event.key === 'Escape' && byId('chapterEditorModal').classList.contains('show')) closeChapterEditor();
      else if (event.key === 'Escape' && byId('documentImportModal').classList.contains('show')) closeImportModal();
    });
  }

  window.WritingAssistantDocumentImport = {
    version: IMPORT_VERSION,
    open: openImportModal,
    openPrepared: openPreparedDocument,
    editItem: function (id) { openExistingItem(id).catch(function (error) { console.error(error); actions.showToast('文档编辑器打开失败'); }); },
    parseText: chaptersFromText,
    pageItemsToText: pageItemsToText,
    analysePageItems: analysePageItems,
    metrics: previewMetrics
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { window.setTimeout(bindEvents, 0); });
  else window.setTimeout(bindEvents, 0);
})();
