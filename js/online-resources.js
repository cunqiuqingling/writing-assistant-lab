(function () {
  'use strict';

  var core = window.WritingAssistantCore;
  if (!core) return;
  var h = core.helpers;
  var actions = core.actions;
  var workspace = window.WritingAssistantWorkspace;
  var catalog = Array.isArray(window.WRITING_ASSISTANT_ONLINE_RESOURCE_CATALOG) ? window.WRITING_ASSISTANT_ONLINE_RESOURCE_CATALOG : [];
  var VERSION = '0.8.0-m4';
  var MAX_RESULTS = 10;
  var MAX_HTML_CHARS = 5000000;
  var MAX_TEXT_CHARS = 350000;
  var REQUEST_TIMEOUT_MS = 20000;
  var currentResults = [];
  var activeController = null;
  var suggestedFolderId = '';
  var suggestedTags = [];

  var SOURCES = {
    wikipedia: {
      id: 'wikipedia', label: 'Wikipedia', endpoint: 'https://en.wikipedia.org/w/api.php',
      base: 'https://en.wikipedia.org/wiki/',
      license: 'CC BY-SA 4.0 · attribution and share-alike apply; verify the source page.',
      notice: 'Wikipedia页面文本通常按CC BY-SA许可提供；保存前仍应查看原页面的许可和署名要求。'
    },
    wikisource: {
      id: 'wikisource', label: 'Wikisource', endpoint: 'https://en.wikisource.org/w/api.php',
      base: 'https://en.wikisource.org/wiki/',
      license: 'Copyright status varies by work and jurisdiction; verify the source page before reuse.',
      notice: 'Wikisource作品的公版状态因作品和地区而异；请以原页面版权标记为准。'
    }
  };

  function byId(id) { return h.byId(id); }
  function all(selector) { return h.all(selector); }
  function text(value) { return String(value == null ? '' : value); }
  function clean(value) {
    return text(value).replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{4,}/g, '\n\n\n').trim();
  }
  function cleanTitle(value) { return clean(value).replace(/\n+/g, ' ').replace(/\[edit\]/gi, '').slice(0, 160).trim(); }
  function unique(values) {
    var seen = {};
    return (values || []).filter(function (value) { var key = clean(value).toLowerCase(); if (!key || seen[key]) return false; seen[key] = true; return true; });
  }
  function sourceConfig(id) { return SOURCES[id] || SOURCES.wikipedia; }
  function pageUrl(sourceId, title) { return sourceConfig(sourceId).base + encodeURIComponent(text(title).replace(/ /g, '_')).replace(/%2F/g, '/'); }
  function stripSnippet(html) {
    var box = document.createElement('div');
    box.innerHTML = text(html);
    return clean(box.textContent || box.innerText || '').slice(0, 360);
  }
  function currentSelectedFolder() {
    var state = core.getState();
    var folderId = state.library && state.library.selectedFolderId;
    return folderId && folderId !== 'folder-all' ? folderId : 'folder-my-custom';
  }
  function groupForFolder(folderId) {
    if (text(folderId).indexOf('folder-ielts') === 0) return 'IELTS Writing';
    if (text(folderId).indexOf('folder-academic') === 0) return 'Academic Writing';
    if (text(folderId).indexOf('folder-pharmacy') === 0) return 'Pharmacy & Biomedicine';
    if (text(folderId).indexOf('folder-literature') === 0 || folderId === 'folder-my-books') return 'Literature';
    return 'IELTS Writing';
  }
  function apiUrl(sourceId, params) {
    var url = new URL(sourceConfig(sourceId).endpoint);
    Object.keys(params).forEach(function (key) { url.searchParams.set(key, params[key]); });
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    url.searchParams.set('origin', '*');
    return url.toString();
  }
  async function fetchJson(url) {
    if (activeController) activeController.abort();
    var controller = new AbortController();
    activeController = controller;
    var timer = window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var response = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal, headers: { 'accept': 'application/json' } });
      if (!response.ok) throw new Error('公开资源请求失败（HTTP ' + response.status + '）');
      return await response.json();
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('请求已取消或超时，请稍后重试');
      throw error;
    } finally {
      window.clearTimeout(timer);
      if (activeController === controller) activeController = null;
    }
  }
  async function searchMediaWiki(sourceId, query) {
    var url = apiUrl(sourceId, {
      action: 'query', list: 'search', srsearch: query, srnamespace: '0', srlimit: String(MAX_RESULTS),
      srprop: 'snippet|titlesnippet|size|wordcount|timestamp'
    });
    var data = await fetchJson(url);
    var rows = data && data.query && Array.isArray(data.query.search) ? data.query.search : [];
    return rows.map(function (row) {
      return {
        sourceId: sourceId,
        pageId: row.pageid,
        title: row.title,
        snippet: stripSnippet(row.snippet || row.titlesnippet),
        words: Number(row.wordcount) || 0,
        bytes: Number(row.size) || 0,
        timestamp: row.timestamp || '',
        url: pageUrl(sourceId, row.title)
      };
    });
  }

  function removeNoise(root) {
    var selectors = [
      'script','style','noscript','table','figure','audio','video','form','button','nav','footer',
      '.mw-editsection','.navbox','.vertical-navbox','.metadata','.infobox','.hatnote','.shortdescription',
      '.toc','.reflist','.references','ol.references','sup.reference','.mw-empty-elt','.noprint','.printfooter',
      '.sistersitebox','.portal','.authority-control','.ws-noexport','.licenseContainer','.mw-indicators'
    ];
    root.querySelectorAll(selectors.join(',')).forEach(function (node) { node.remove(); });
  }
  function cleanedNodeText(node) {
    return clean(node.textContent || '').replace(/\s*\[(?:\d+|citation needed|note \d+)\]\s*/gi, ' ').trim();
  }
  function splitLongChapter(chapter, warnings) {
    var paragraphs = clean(chapter.text).split(/\n\s*\n+/).map(clean).filter(Boolean);
    if (paragraphs.length <= 45 && h.wordCount(chapter.text) <= 5000) return [chapter];
    var parts = [], bucket = [], words = 0;
    paragraphs.forEach(function (paragraph) {
      var count = h.wordCount(paragraph);
      if (bucket.length && (bucket.length >= 45 || words + count > 5000)) {
        parts.push({ title: chapter.title + ' · Part ' + (parts.length + 1), text: bucket.join('\n\n') });
        bucket = []; words = 0;
      }
      bucket.push(paragraph); words += count;
    });
    if (bucket.length) parts.push({ title: chapter.title + ' · Part ' + (parts.length + 1), text: bucket.join('\n\n') });
    warnings.push('较长章节已自动分成多个练习章节；保存前可以重新合并或调整。');
    return parts;
  }
  function htmlToChapters(html, fallbackTitle) {
    if (text(html).length > MAX_HTML_CHARS) throw new Error('页面结构过大，暂不适合直接在浏览器中解析');
    var documentNode = new DOMParser().parseFromString(text(html), 'text/html');
    var root = documentNode.querySelector('.mw-parser-output') || documentNode.body;
    removeNoise(root);
    var chapters = [];
    var current = { title: 'Introduction', parts: [] };
    var total = 0;
    var truncated = false;
    function flush() {
      var body = clean(current.parts.join('\n\n'));
      if (body.length >= 40) chapters.push({ title: cleanTitle(current.title) || fallbackTitle || 'Full text', text: body });
      current = { title: '', parts: [] };
    }
    Array.from(root.querySelectorAll('h2,h3,p,blockquote,li')).forEach(function (node) {
      if (truncated) return;
      var value = cleanedNodeText(node);
      if (!value) return;
      var tag = node.tagName.toLowerCase();
      if (tag === 'h2') {
        flush(); current.title = value;
      } else if (tag === 'h3') {
        if (current.parts.length) current.parts.push('## ' + value);
        else current.title = value;
      } else {
        if (value.length < 18 && tag !== 'blockquote') return;
        if (total + value.length > MAX_TEXT_CHARS) { truncated = true; return; }
        current.parts.push(value); total += value.length;
      }
    });
    flush();
    if (!chapters.length) {
      var fallback = clean(root.textContent || '').slice(0, MAX_TEXT_CHARS);
      if (fallback.length >= 80) chapters = [{ title: fallbackTitle || 'Full text', text: fallback }];
    }
    var warnings = [];
    if (truncated) warnings.push('页面正文超过本地导入上限，只保留了前 ' + MAX_TEXT_CHARS.toLocaleString() + ' 个字符。');
    var expanded = [];
    chapters.slice(0, 160).forEach(function (chapter) { expanded = expanded.concat(splitLongChapter(chapter, warnings)); });
    if (chapters.length > 160) warnings.push('页面章节过多，只保留前160个章节。');
    return { chapters: expanded.slice(0, 180), warnings: unique(warnings) };
  }
  async function fetchPage(sourceId, title) {
    var url = apiUrl(sourceId, { action: 'parse', page: title, redirects: '1', prop: 'text|displaytitle|revid', disabletoc: '1' });
    var data = await fetchJson(url);
    if (!data || !data.parse || !data.parse.text) throw new Error('没有取得该页面的正文');
    var parsed = htmlToChapters(data.parse.text, data.parse.title || title);
    if (!parsed.chapters.length) throw new Error('该页面没有可导入的正文');
    return {
      title: cleanTitle(data.parse.title || title),
      displayTitle: stripSnippet(data.parse.displaytitle || data.parse.title || title),
      pageId: data.parse.pageid || 0,
      revisionId: data.parse.revid || 0,
      chapters: parsed.chapters,
      warnings: parsed.warnings
    };
  }

  function injectButton() {
    var controls = document.querySelector('#libraryView .library-hero .controls');
    if (!controls || byId('onlineResourceBtn')) return;
    var button = document.createElement('button');
    button.id = 'onlineResourceBtn'; button.className = 'btn soft'; button.type = 'button';
    button.innerHTML = '<span aria-hidden="true">◎</span> 在线公共资源';
    var importButton = byId('importDocumentBtn');
    controls.insertBefore(button, importButton || controls.firstChild);

    var menu = byId('dataMenu');
    if (menu && !byId('onlineResourceMenuBtn')) {
      var action = document.createElement('button');
      action.className = 'menu-action'; action.id = 'onlineResourceMenuBtn'; action.setAttribute('role', 'menuitem');
      action.innerHTML = '<span>◎</span><span><strong>在线公共资源</strong><small>主动搜索Wikipedia与Wikisource</small></span>';
      var divider = menu.querySelector('.menu-divider');
      menu.insertBefore(action, divider || null);
    }
  }
  function injectModal() {
    if (byId('onlineResourceModal')) return;
    var modal = document.createElement('div');
    modal.id = 'onlineResourceModal'; modal.className = 'modal-backdrop'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
    modal.innerHTML = [
      '<div class="modal online-resource-modal">',
      '  <div class="modal-head"><div><h2>在线公共资源</h2><p class="modal-helper">打开此窗口不会联网。只有点击搜索或预览页面时，浏览器才会向所选Wikimedia站点发送请求。</p></div><button class="icon-close-button" id="closeOnlineResourceModal" type="button" aria-label="关闭">×</button></div>',
      '  <div class="modal-body">',
      '    <div class="online-privacy-note"><span>Local-first</span><p>查询词会发送给Wikipedia或Wikisource；你的仿写、笔记、AI密钥和练习进度不会发送。页面只有在你确认保存后才进入本地练习库。</p></div>',
      '    <section class="online-search-panel">',
      '      <div class="online-search-row"><select id="onlineResourceSource" aria-label="资源来源"><option value="wikipedia">Wikipedia</option><option value="wikisource">Wikisource</option></select><input class="text-input" id="onlineResourceQuery" placeholder="搜索英文主题、文章或作品……" maxlength="180" /><button class="btn primary" id="searchOnlineResourceBtn" type="button">搜索</button></div>',
      '      <div class="online-search-help" id="onlineResourceSourceNotice"></div>',
      '    </section>',
      '    <section class="online-curated-section"><div class="online-section-head"><div><span class="section-kicker">CURATED STARTERS</span><h3>精选练习入口</h3></div><select id="onlineCatalogGroup" aria-label="精选资源类别"><option>IELTS Writing</option><option>Academic Writing</option><option>Pharmacy &amp; Biomedicine</option><option>Literature</option></select></div><div class="online-catalog-grid" id="onlineCatalogGrid"></div></section>',
      '    <section class="online-results-section" id="onlineResultsSection" hidden><div class="online-section-head"><div><span class="section-kicker">SEARCH RESULTS</span><h3 id="onlineResultsTitle">搜索结果</h3></div><span class="online-result-count" id="onlineResultCount"></span></div><div class="online-status" id="onlineResourceStatus"></div><div class="online-result-list" id="onlineResourceResults"></div></section>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
  }
  function setSourceNotice() {
    var source = sourceConfig(byId('onlineResourceSource').value);
    byId('onlineResourceSourceNotice').textContent = source.notice;
  }
  function renderCatalog() {
    var group = byId('onlineCatalogGroup').value;
    var items = catalog.filter(function (item) { return item.group === group; });
    byId('onlineCatalogGrid').innerHTML = items.map(function (item) {
      var source = sourceConfig(item.source);
      return '<article class="online-catalog-card"><div class="online-card-top"><span class="online-source-chip ' + h.escapeHtml(item.source) + '">' + h.escapeHtml(source.label) + '</span><span>' + h.escapeHtml(item.group) + '</span></div><h4>' + h.escapeHtml(item.title) + '</h4><p>' + h.escapeHtml(item.description) + '</p><div class="online-card-tags">' + (item.tags || []).slice(0,3).map(function (tag) { return '<span>' + h.escapeHtml(tag) + '</span>'; }).join('') + '</div><button class="btn small soft" type="button" data-catalog-search="' + h.escapeHtml(item.id) + '">查找页面</button></article>';
    }).join('');
  }
  function renderResults(results, query) {
    currentResults = results;
    byId('onlineResultsSection').hidden = false;
    byId('onlineResultsTitle').textContent = '“' + query + '”的搜索结果';
    byId('onlineResultCount').textContent = results.length + ' 项';
    byId('onlineResourceStatus').textContent = results.length ? '选择页面后会先进入本地导入预览，不会立即保存。' : '没有找到匹配页面，可以更换关键词。';
    byId('onlineResourceResults').innerHTML = results.map(function (item, index) {
      var source = sourceConfig(item.sourceId);
      return '<article class="online-result-card"><div class="online-result-main"><div class="online-result-heading"><span class="online-source-chip ' + h.escapeHtml(item.sourceId) + '">' + h.escapeHtml(source.label) + '</span><h4>' + h.escapeHtml(item.title) + '</h4></div><p>' + h.escapeHtml(item.snippet || '该结果没有提供摘要。') + '</p><div class="online-result-meta"><span>' + (item.words ? item.words.toLocaleString() + ' 词' : '词数未知') + '</span><span>' + (item.timestamp ? '更新 ' + h.escapeHtml(item.timestamp.slice(0,10)) : '') + '</span></div></div><div class="online-result-actions"><a class="btn small quiet" href="' + h.escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer">查看原页</a><button class="btn small primary" type="button" data-online-preview="' + index + '">预览并保存</button></div></article>';
    }).join('');
    byId('onlineResultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function runSearch(query, sourceId) {
    query = clean(query);
    if (!query) { actions.showToast('请输入搜索关键词'); return; }
    byId('onlineResultsSection').hidden = false;
    byId('onlineResourceResults').innerHTML = '';
    byId('onlineResourceStatus').innerHTML = '<span class="online-loading-dot"></span> 正在搜索 ' + h.escapeHtml(sourceConfig(sourceId).label) + '…';
    byId('onlineResultsTitle').textContent = '搜索中';
    byId('onlineResultCount').textContent = '';
    byId('searchOnlineResourceBtn').disabled = true;
    try {
      var results = await searchMediaWiki(sourceId, query);
      renderResults(results, query);
    } catch (error) {
      console.error(error);
      byId('onlineResourceStatus').textContent = error.message || '搜索失败';
      actions.showToast(error.message || '在线资源搜索失败');
    } finally {
      byId('searchOnlineResourceBtn').disabled = false;
    }
  }
  async function previewResult(index, button) {
    var result = currentResults[index];
    if (!result) return;
    var importApi = window.WritingAssistantDocumentImport;
    if (!importApi || typeof importApi.openPrepared !== 'function') { actions.showToast('文档预览器尚未载入'); return; }
    var originalText = button.textContent;
    button.disabled = true; button.textContent = '获取正文…';
    try {
      var page = await fetchPage(result.sourceId, result.title);
      var source = sourceConfig(result.sourceId);
      var url = pageUrl(result.sourceId, page.title);
      var warnings = page.warnings.slice();
      warnings.push('正文来自' + source.label + '，请在保存和再次传播前检查原页面的署名与版权状态。');
      var totalChars = page.chapters.reduce(function (sum, chapter) { return sum + chapter.text.length; }, 0);
      byId('onlineResourceModal').classList.remove('show');
      importApi.openPrepared({
        format: result.sourceId,
        title: page.displayTitle || page.title,
        source: source.label + ' · ' + page.title + ' · ' + url,
        license: source.license,
        tags: unique([result.sourceId, byId('onlineResourceQuery').value].concat(suggestedTags)),
        folderId: suggestedFolderId || currentSelectedFolder(),
        fileName: page.title,
        fileSize: totalChars,
        warnings: warnings,
        chapters: page.chapters,
        remoteMeta: { provider: result.sourceId, pageTitle: page.title, pageId: page.pageId, revisionId: page.revisionId, url: url, fetchedAt: new Date().toISOString() }
      });
    } catch (error) {
      console.error(error);
      actions.showToast(error.message || '页面正文获取失败');
    } finally {
      button.disabled = false; button.textContent = originalText;
    }
  }
  function openModal() {
    injectButton(); injectModal();
    var folderId = currentSelectedFolder();
    byId('onlineCatalogGroup').value = groupForFolder(folderId);
    suggestedFolderId = folderId;
    suggestedTags = [];
    currentResults = [];
    byId('onlineResultsSection').hidden = true;
    byId('onlineResourceResults').innerHTML = '';
    byId('onlineResourceStatus').textContent = '';
    renderCatalog(); setSourceNotice();
    byId('onlineResourceModal').classList.add('show');
    setTimeout(function () { byId('onlineResourceQuery').focus(); }, 30);
  }
  function closeModal() {
    if (activeController) activeController.abort();
    byId('onlineResourceModal').classList.remove('show');
  }
  function bindEvents() {
    injectButton(); injectModal();
    byId('onlineResourceBtn').addEventListener('click', openModal);
    if (byId('onlineResourceMenuBtn')) byId('onlineResourceMenuBtn').addEventListener('click', function () { if (byId('dataMenu')) byId('dataMenu').hidden = true; openModal(); });
    byId('closeOnlineResourceModal').addEventListener('click', closeModal);
    byId('onlineResourceModal').addEventListener('click', function (event) { if (event.target === this) closeModal(); });
    byId('onlineResourceSource').addEventListener('change', setSourceNotice);
    byId('onlineCatalogGroup').addEventListener('change', renderCatalog);
    byId('searchOnlineResourceBtn').addEventListener('click', function () { suggestedFolderId = currentSelectedFolder(); suggestedTags = []; runSearch(byId('onlineResourceQuery').value, byId('onlineResourceSource').value); });
    byId('onlineResourceQuery').addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); byId('searchOnlineResourceBtn').click(); } });
    byId('onlineCatalogGrid').addEventListener('click', function (event) {
      var button = event.target.closest('[data-catalog-search]');
      if (!button) return;
      var item = catalog.find(function (entry) { return entry.id === button.dataset.catalogSearch; });
      if (!item) return;
      suggestedFolderId = item.folderId;
      suggestedTags = item.tags || [];
      byId('onlineResourceSource').value = item.source;
      byId('onlineResourceQuery').value = item.query;
      setSourceNotice();
      runSearch(item.query, item.source);
    });
    byId('onlineResourceResults').addEventListener('click', function (event) {
      var button = event.target.closest('[data-online-preview]');
      if (button) previewResult(Number(button.dataset.onlinePreview), button);
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && byId('onlineResourceModal').classList.contains('show')) closeModal(); });
  }

  window.WritingAssistantOnlineResources = {
    version: VERSION,
    open: openModal,
    search: searchMediaWiki,
    fetchPage: fetchPage,
    catalogCount: catalog.length
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { window.setTimeout(bindEvents, 0); });
  else window.setTimeout(bindEvents, 0);
})();
