(function () {
  'use strict';

  var core = window.WritingAssistantCore;
  if (!core) return;
  var h = core.helpers;
  var actions = core.actions;
  var MAX_WORKER_IDLE_MS = 10 * 60 * 1000;
  var worker = null;
  var workerReady = false;
  var workerSequence = 0;
  var pending = new Map();
  var currentRun = null;
  var lastContextKey = '';
  var idleTimer = null;

  function byId(id) { return h.byId(id); }
  function text(value) { return String(value == null ? '' : value); }
  function escapeAttribute(value) { return h.escapeHtml(value).replace(/`/g, '&#96;'); }
  function context() {
    var importer = window.WritingAssistantDocumentImport;
    return importer && typeof importer.getOcrContext === 'function' ? importer.getOcrContext() : null;
  }
  function compressPages(pages) {
    var sorted = Array.from(new Set((pages || []).map(Number).filter(function (value) { return value > 0; }))).sort(function (a, b) { return a - b; });
    if (!sorted.length) return '';
    var ranges = [];
    var start = sorted[0];
    var previous = sorted[0];
    for (var i = 1; i <= sorted.length; i++) {
      var value = sorted[i];
      if (value === previous + 1) { previous = value; continue; }
      ranges.push(start === previous ? String(start) : start + '–' + previous);
      start = previous = value;
    }
    return ranges.join(', ');
  }
  function parsePageRange(value, totalPages, maxPages) {
    var raw = text(value).replace(/[—–]/g, '-').trim();
    if (!raw) return [];
    var pages = [];
    raw.split(/[，,\s]+/).filter(Boolean).forEach(function (part) {
      var match = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!match) throw new Error('页码格式不正确：' + part);
      var first = Number(match[1]);
      var last = Number(match[2] || match[1]);
      if (first > last) { var swap = first; first = last; last = swap; }
      if (first < 1 || last > totalPages) throw new Error('页码必须在 1–' + totalPages + ' 之间');
      for (var page = first; page <= last; page++) pages.push(page);
    });
    pages = Array.from(new Set(pages)).sort(function (a, b) { return a - b; });
    if (pages.length > maxPages) throw new Error('当前设备单次建议最多识别 ' + maxPages + ' 页，请分批处理');
    return pages;
  }
  function deviceProfile() {
    var memory = Number(navigator.deviceMemory || 0);
    var cores = Number(navigator.hardwareConcurrency || 0);
    if ((memory && memory <= 4) || (cores && cores <= 4)) return { name: '节能', maxPages: 1, maxDimension: 1700, maxPixels: 2600000, detail: '检测到较低配置：单次1页，降低图像分辨率。' };
    if ((memory && memory <= 8) || (cores && cores <= 6)) return { name: '均衡', maxPages: 3, maxDimension: 2000, maxPixels: 3500000, detail: '单次最多3页，逐页处理。' };
    return { name: '标准', maxPages: 5, maxDimension: 2200, maxPixels: 4200000, detail: '单次最多5页，逐页处理。' };
  }
  function mockMode() { return new URLSearchParams(window.location.search).get('browserOcrMock') === '1'; }
  function resetIdleTimer() {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(stopWorker, MAX_WORKER_IDLE_MS);
  }
  function stopWorker() {
    if (worker) worker.terminate();
    worker = null;
    workerReady = false;
    pending.forEach(function (entry) { entry.reject(new Error('浏览器OCR工作线程已停止')); });
    pending.clear();
  }
  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker('js/browser-ocr-worker.mjs', { type: 'module', name: 'writing-assistant-browser-ocr' });
    worker.addEventListener('message', function (event) {
      var data = event.data || {};
      if (data.type === 'ready') workerReady = true;
      if (data.requestId && pending.has(data.requestId)) {
        var entry = pending.get(data.requestId);
        pending.delete(data.requestId);
        if (data.type === 'error') entry.reject(new Error(data.error || '浏览器OCR失败'));
        else entry.resolve(data);
      }
      if (data.type === 'model-progress' && currentRun) updateProgress(data.title || '正在准备浏览器OCR模型', data.detail || '', currentRun.percent);
    });
    worker.addEventListener('error', function (event) {
      var error = new Error(event.message || '浏览器OCR工作线程加载失败');
      pending.forEach(function (entry) { entry.reject(error); });
      pending.clear();
      stopWorker();
    });
    resetIdleTimer();
    return worker;
  }
  function requestWorker(type, payload, transfer) {
    var active = ensureWorker();
    var requestId = 'ocr-' + Date.now() + '-' + (++workerSequence);
    return new Promise(function (resolve, reject) {
      pending.set(requestId, { resolve: resolve, reject: reject });
      active.postMessage(Object.assign({ type: type, requestId: requestId }, payload || {}), transfer || []);
      resetIdleTimer();
    });
  }
  function updateProgress(title, detail, percent) {
    if (!currentRun) return;
    currentRun.title = title || currentRun.title;
    currentRun.detail = detail || '';
    currentRun.percent = Math.max(0, Math.min(100, Number(percent) || 0));
    if (byId('browserOcrProgress')) byId('browserOcrProgress').hidden = false;
    if (byId('browserOcrProgressTitle')) byId('browserOcrProgressTitle').textContent = currentRun.title;
    if (byId('browserOcrProgressDetail')) byId('browserOcrProgressDetail').textContent = currentRun.detail;
    if (byId('browserOcrProgressBar')) byId('browserOcrProgressBar').style.width = currentRun.percent + '%';
  }
  async function startBrowserOcr() {
    if (currentRun) return;
    var importer = window.WritingAssistantDocumentImport;
    var ocrContext = context();
    if (!importer || !ocrContext) return;
    var profile = deviceProfile();
    var pages;
    try { pages = parsePageRange(byId('browserOcrPageRange').value, ocrContext.pages, profile.maxPages); }
    catch (error) { actions.showToast(error.message); return; }
    if (!pages.length) { actions.showToast('请输入需要识别的页码'); return; }
    currentRun = { cancelled: false, title: '准备浏览器OCR', detail: '', percent: 0, pages: pages };
    render(ocrContext);
    var results = [];
    try {
      await requestWorker('configure', { mock: mockMode(), language: 'ch', ocrVersion: 'PP-OCRv5' });
      for (var index = 0; index < pages.length; index++) {
        if (!currentRun || currentRun.cancelled) throw new DOMException('OCR cancelled', 'AbortError');
        var pageNumber = pages[index];
        var basePercent = Math.round(index / pages.length * 100);
        updateProgress('正在渲染第 ' + pageNumber + ' 页', (index + 1) + ' / ' + pages.length + ' · 文件仍在当前浏览器', basePercent);
        var image = await importer.renderPdfPageForOcr(pageNumber, { profile: 'browser', maxDimension: profile.maxDimension, maxPixels: profile.maxPixels, quality: 0.86 });
        if (!currentRun || currentRun.cancelled) throw new DOMException('OCR cancelled', 'AbortError');
        updateProgress('正在识别第 ' + pageNumber + ' 页', 'PP-OCRv5移动模型 · ' + (index + 1) + ' / ' + pages.length, basePercent + Math.round(55 / pages.length));
        var response = await requestWorker('recognize', { pageNumber: pageNumber, blob: image.blob });
        results.push({ page: pageNumber, text: response.text || '', engine: response.engine || 'PP-OCRv5 Mobile' });
        updateProgress('第 ' + pageNumber + ' 页识别完成', (index + 1) + ' / ' + pages.length, Math.round((index + 1) / pages.length * 100));
      }
      await importer.applyOcrResults(results, { mode: 'browser', engine: results[0] && results[0].engine || 'PP-OCRv5 Mobile', serviceVersion: '0.8.0-m4-r1', processedAt: new Date().toISOString() });
      actions.showToast('浏览器OCR完成：' + results.length + ' 页');
    } catch (error) {
      if ((currentRun && currentRun.cancelled) || (error && error.name === 'AbortError')) actions.showToast('浏览器OCR已取消');
      else { console.error(error); actions.showToast(error && error.message ? error.message : '浏览器OCR失败'); }
    } finally {
      currentRun = null;
      render(context());
    }
  }
  function cancelBrowserOcr() {
    if (!currentRun) return;
    currentRun.cancelled = true;
    updateProgress('正在取消', '停止浏览器OCR工作线程。', currentRun.percent);
    stopWorker();
  }
  function render(documentData) {
    var panel = byId('localOcrPanel');
    if (!panel) return;
    var ocrContext = documentData || context();
    if (!ocrContext || !ocrContext.available || !ocrContext.pdfStatus) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    var recommended = ocrContext.recommendedPages || [];
    if (!recommended.length && !ocrContext.pdfStatus.scannedLikely) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    var profile = deviceProfile();
    var defaults = recommended.slice(0, profile.maxPages);
    var contextKey = [ocrContext.fileName, ocrContext.pages, compressPages(defaults)].join('|');
    var oldInput = byId('browserOcrPageRange');
    var rangeValue = oldInput && contextKey === lastContextKey ? oldInput.value : compressPages(defaults);
    lastContextKey = contextKey;
    var running = Boolean(currentRun);
    var summary = ocrContext.pdfStatus.scannedLikely ? '该PDF缺少可用文字层。优先在浏览器中提取普通中英文文字，无需安装软件。' : '部分页面文字很少，可只对这些页面补充浏览器OCR。';
    panel.hidden = false;
    panel.innerHTML = [
      '<div class="browser-ocr-card">',
      '  <div class="browser-ocr-head"><div class="browser-ocr-icon" aria-hidden="true">Aa</div><div><span class="section-kicker">BROWSER-FIRST TEXT OCR</span><h3>浏览器文字识别</h3><p>' + h.escapeHtml(summary) + '</p></div><span class="browser-ocr-recommended">推荐</span></div>',
      '  <div class="browser-ocr-note"><strong>只提取文字</strong><span>忽略图片、表格和公式；结果会进入文档预览，可自行修正标题、页眉页脚和段落顺序。</span></div>',
      '  <div class="browser-ocr-device"><span>设备策略：' + h.escapeHtml(profile.name) + '</span><small>' + h.escapeHtml(profile.detail) + '</small></div>',
      '  <div class="local-ocr-run-grid"><div class="field"><label for="browserOcrPageRange">识别页码</label><input class="text-input" id="browserOcrPageRange" value="' + escapeAttribute(rangeValue) + '" placeholder="例如：1–3"' + (running ? ' disabled' : '') + ' /></div><div class="local-ocr-run-action"><button class="btn primary" id="runBrowserOcrBtn" type="button"' + (running || !recommended.length ? ' disabled' : '') + '>使用浏览器OCR</button></div></div>',
      '  <div class="local-ocr-page-hint">建议页面：' + h.escapeHtml(compressPages(recommended.slice(0, 30)) || '无') + ' · 当前设备单次最多 ' + profile.maxPages + ' 页 · 第一次使用会按需加载SDK与轻量模型</div>',
      '  <div class="local-ocr-progress" id="browserOcrProgress"' + (running ? '' : ' hidden') + '><div class="local-ocr-progress-line"><span id="browserOcrProgressBar" style="width:' + (currentRun ? currentRun.percent : 0) + '%"></span></div><div class="local-ocr-progress-copy"><strong id="browserOcrProgressTitle">' + h.escapeHtml(currentRun ? currentRun.title : '') + '</strong><span id="browserOcrProgressDetail">' + h.escapeHtml(currentRun ? currentRun.detail : '') + '</span></div><button class="btn small quiet danger-text-button" id="cancelBrowserOcrBtn" type="button">取消</button></div>',
      '  <p class="local-ocr-privacy">页面图像和识别计算停留在当前浏览器。只有用户主动点击后才加载OCR资源；普通访问网站不会自动下载模型。</p>',
      '  <details class="advanced-ocr-details"><summary><span><strong>高级本地OCR</strong><small>可选 · 实验性 · 安装和首次模型准备耗时较长</small></span><span aria-hidden="true">⌄</span></summary><div id="advancedLocalOcrPanel"></div></details>',
      '</div>'
    ].join('');
    byId('runBrowserOcrBtn').addEventListener('click', startBrowserOcr);
    if (byId('cancelBrowserOcrBtn')) byId('cancelBrowserOcrBtn').addEventListener('click', cancelBrowserOcr);
    if (window.WritingAssistantAdvancedOCR && typeof window.WritingAssistantAdvancedOCR.render === 'function') window.WritingAssistantAdvancedOCR.render(ocrContext);
  }
  function reset() {
    if (currentRun) cancelBrowserOcr();
    currentRun = null;
    lastContextKey = '';
    if (window.WritingAssistantAdvancedOCR && typeof window.WritingAssistantAdvancedOCR.reset === 'function') window.WritingAssistantAdvancedOCR.reset();
  }
  window.WritingAssistantLocalOCR = {
    version: '0.8.0-m4-r1',
    render: render,
    reset: reset,
    start: startBrowserOcr,
    cancel: cancelBrowserOcr,
    parsePageRange: parsePageRange,
    compressPages: compressPages,
    deviceProfile: deviceProfile,
    mockMode: mockMode
  };
})();
