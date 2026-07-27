(function () {
  'use strict';

  var core = window.WritingAssistantCore;
  if (!core) return;

  var h = core.helpers;
  var actions = core.actions;
  var SERVICE_URL = 'http://127.0.0.1:8765';
  var TOKEN_KEY = 'writing-assistant-local-ocr-token-v1';
  var INSTALL_URL = 'https://github.com/cunqiuqingling/writing-assistant-lab/releases/latest';
  var GUIDE_URL = 'https://github.com/cunqiuqingling/writing-assistant-lab/blob/main/docs/LOCAL_OCR.md';
  var MAX_PAGES_PER_RUN = 50;
  var POLL_INTERVAL_MS = 1100;
  var STATUS_TIMEOUT_MS = 5000;
  var currentStatus = null;
  var currentRun = null;
  var lastContextKey = '';

  function byId(id) { return h.byId(id); }
  function text(value) { return String(value == null ? '' : value); }
  function escapeAttribute(value) { return h.escapeHtml(value).replace(/`/g, '&#96;'); }
  function token() {
    try { return window.localStorage.getItem(TOKEN_KEY) || ''; }
    catch (error) { return ''; }
  }
  function saveToken(value) {
    try {
      if (value) window.localStorage.setItem(TOKEN_KEY, value);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch (error) {}
  }
  function sleep(ms) { return new Promise(function (resolve) { window.setTimeout(resolve, ms); }); }

  function loopbackRequest(path, options) {
    options = Object.assign({
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error'
    }, options || {});
    var url = SERVICE_URL + path;
    try {
      return new Request(url, Object.assign({}, options, { targetAddressSpace: 'loopback' }));
    } catch (error) {
      return new Request(url, options);
    }
  }

  async function fetchLoopback(path, options, timeoutMs) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, timeoutMs || 120000);
    options = Object.assign({}, options || {}, { signal: controller.signal });
    try {
      return await fetch(loopbackRequest(path, options));
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function api(path, options, timeoutMs) {
    options = Object.assign({}, options || {});
    var headers = Object.assign({ 'X-WA-Client': 'WritingAssistant/0.8.0-m4-r1' }, options.headers || {});
    var pairedToken = token();
    if (pairedToken) headers.Authorization = 'Bearer ' + pairedToken;
    options.headers = headers;
    var response = await fetchLoopback(path, options, timeoutMs);
    var payload = null;
    try { payload = await response.json(); }
    catch (error) { payload = { ok: false, error: '连接器返回了无法读取的响应' }; }
    if (!response.ok || !payload || payload.ok === false) {
      var message = payload && payload.error || ('本地连接器请求失败（' + response.status + '）');
      var requestError = new Error(message);
      requestError.status = response.status;
      throw requestError;
    }
    return payload;
  }

  function statusLabel(status) {
    if (!status) return { tone: 'idle', title: '尚未检测', detail: '先启动本地OCR连接器，然后点击检测。' };
    if (status.disconnected) return { tone: 'error', title: '未检测到连接器', detail: status.error || '请先安装并启动 Writing Assistant Local OCR。' };
    var backend = status.backend || {};
    if (backend.state === 'ready') return { tone: 'ready', title: '连接器已就绪', detail: (backend.engine || 'PaddleOCR-VL') + (backend.mock ? ' · 模拟模式' : '') };
    if (backend.state === 'loading') return { tone: 'working', title: '模型正在准备', detail: '首次使用可能需要下载模型，请保持连接器运行。' };
    if (backend.state === 'error') return { tone: 'error', title: 'OCR环境需要修复', detail: backend.error || 'PaddleOCR-VL加载失败。' };
    return { tone: 'connected', title: '连接器已启动', detail: '模型将在第一次OCR时自动载入。' };
  }

  async function detectConnector(showToast) {
    try {
      var payload = await api('/api/status', {}, STATUS_TIMEOUT_MS);
      currentStatus = payload;
      if (showToast) actions.showToast('已检测到本地OCR连接器');
    } catch (error) {
      currentStatus = { disconnected: true, error: error.name === 'AbortError' ? '连接超时' : error.message };
      if (showToast) actions.showToast('未检测到本地OCR连接器');
    }
    renderCurrent();
    return currentStatus;
  }

  function pairConnector() {
    var expectedOrigin = SERVICE_URL;
    var popup = null;
    var finished = false;
    function cleanup() {
      window.removeEventListener('message', onMessage);
      finished = true;
    }
    function onMessage(event) {
      if (event.origin !== expectedOrigin) return;
      var data = event.data || {};
      if (data.type !== 'writing-assistant-local-ocr-paired' || !data.token) return;
      saveToken(String(data.token));
      cleanup();
      detectConnector(true);
    }
    window.addEventListener('message', onMessage);
    var pairUrl = SERVICE_URL + '/pair?origin=' + encodeURIComponent(window.location.origin);
    popup = window.open(pairUrl, 'writing-assistant-ocr-pair', 'popup,width=620,height=560');
    if (!popup) {
      cleanup();
      actions.showToast('浏览器阻止了配对窗口，请允许弹出窗口后重试');
      return;
    }
    window.setTimeout(function () {
      if (!finished) cleanup();
    }, 120000);
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

  function parsePageRange(value, totalPages) {
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
    if (pages.length > MAX_PAGES_PER_RUN) throw new Error('单次最多识别 ' + MAX_PAGES_PER_RUN + ' 页，请分批处理');
    return pages;
  }

  function context() {
    var importer = window.WritingAssistantDocumentImport;
    return importer && typeof importer.getOcrContext === 'function' ? importer.getOcrContext() : null;
  }

  function renderCurrent() {
    render(context());
  }

  function render(documentData) {
    var panel = byId('advancedLocalOcrPanel') || byId('localOcrPanel');
    if (!panel) return;
    var ocrContext = documentData || context();
    if (!ocrContext || !ocrContext.available || !ocrContext.pdfStatus) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    var status = statusLabel(currentStatus);
    var recommended = ocrContext.recommendedPages || [];
    if (!recommended.length && !ocrContext.pdfStatus.scannedLikely) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    var defaultRange = compressPages(recommended.length ? recommended.slice(0, MAX_PAGES_PER_RUN) : []);
    var contextKey = [ocrContext.fileName, ocrContext.pages, defaultRange].join('|');
    var existingRange = byId('localOcrPageRange');
    var rangeValue = existingRange && lastContextKey === contextKey ? existingRange.value : defaultRange;
    lastContextKey = contextKey;
    var isRunning = Boolean(currentRun);
    var paired = Boolean(token());
    var readyEnough = currentStatus && !currentStatus.disconnected;
    var summary = ocrContext.pdfStatus.scannedLikely
      ? 'PDF文字层不足，建议使用本机PaddleOCR-VL识别扫描页。'
      : '检测到部分页面文字很少，可只对这些页面补充OCR。';
    var pageHint = recommended.length
      ? '建议页面：' + compressPages(recommended.slice(0, 30)) + (recommended.length > 30 ? '…' : '')
      : '当前没有检测到需要OCR的页面。';
    panel.hidden = false;
    panel.innerHTML = [
      '<div class="local-ocr-card">',
      '  <div class="local-ocr-head">',
      '    <div class="local-ocr-icon" aria-hidden="true">OCR</div>',
      '    <div><span class="section-kicker">ADVANCED · OPTIONAL · EXPERIMENTAL</span><h3>高级本地OCR</h3><p>仅在浏览器OCR效果不足、且电脑配置较好时考虑。安装与首次模型准备可能耗时较长。</p></div>',
      '  </div>',
      '  <div class="local-ocr-status ' + escapeAttribute(status.tone) + '"><span class="local-ocr-status-dot"></span><div><strong>' + h.escapeHtml(status.title) + '</strong><small>' + h.escapeHtml(status.detail) + '</small></div></div>',
      '  <div class="local-ocr-connect-actions">',
      '    <button class="btn small" id="detectLocalOcrBtn" type="button"' + (isRunning ? ' disabled' : '') + '>检测连接器</button>',
      '    <button class="btn small soft" id="pairLocalOcrBtn" type="button"' + (isRunning ? ' disabled' : '') + '>' + (paired ? '重新配对' : '配对连接器') + '</button>',
      '    <button class="btn small quiet" id="installLocalOcrBtn" type="button">安装前须知</button>',
      '  </div>',
      '  <div class="local-ocr-run-grid">',
      '    <div class="field"><label for="localOcrPageRange">识别页码</label><input class="text-input" id="localOcrPageRange" value="' + escapeAttribute(rangeValue) + '" placeholder="例如：1–8, 12, 15–20"' + (isRunning ? ' disabled' : '') + ' /></div>',
      '    <div class="local-ocr-run-action"><button class="btn primary" id="runLocalOcrBtn" type="button"' + (!readyEnough || !paired || isRunning || !recommended.length ? ' disabled' : '') + '>开始本地OCR</button></div>',
      '  </div>',
      '  <div class="local-ocr-page-hint">' + h.escapeHtml(pageHint) + ' · 单次最多 ' + MAX_PAGES_PER_RUN + ' 页</div>',
      '  <div class="local-ocr-progress" id="localOcrProgress"' + (isRunning ? '' : ' hidden') + '>',
      '    <div class="local-ocr-progress-line"><span id="localOcrProgressBar" style="width:' + (currentRun ? currentRun.percent : 0) + '%"></span></div>',
      '    <div class="local-ocr-progress-copy"><strong id="localOcrProgressTitle">' + h.escapeHtml(currentRun ? currentRun.title : '') + '</strong><span id="localOcrProgressDetail">' + h.escapeHtml(currentRun ? currentRun.detail : '') + '</span></div>',
      '    <button class="btn small quiet danger-text-button" id="cancelLocalOcrBtn" type="button">取消</button>',
      '  </div>',
      '  <p class="local-ocr-privacy">页面图片只发送到这台电脑的 <code>127.0.0.1</code>。OCR结果返回当前预览，不经过Cloudflare、GitHub或项目维护者服务器。</p>',
      '</div>'
    ].join('');

    byId('detectLocalOcrBtn').addEventListener('click', function () { detectConnector(true); });
    byId('pairLocalOcrBtn').addEventListener('click', pairConnector);
    byId('installLocalOcrBtn').addEventListener('click', function () {
      openInstallWarning();
    });
    byId('runLocalOcrBtn').addEventListener('click', startOcr);
    if (byId('cancelLocalOcrBtn')) byId('cancelLocalOcrBtn').addEventListener('click', cancelOcr);
  }


  function ensureInstallWarningModal() {
    var existing = byId('advancedOcrInstallWarning');
    if (existing) return existing;
    var modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'advancedOcrInstallWarning';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = [
      '<div class="modal compact-modal advanced-ocr-warning-modal">',
      '  <div class="modal-head"><div><span class="section-kicker">ADVANCED LOCAL OCR</span><h2>安装前请确认</h2></div><button class="icon-close-button" id="closeAdvancedOcrWarning" type="button" aria-label="关闭">×</button></div>',
      '  <div class="modal-body">',
      '    <div class="advanced-ocr-warning-box"><strong>普通扫描文字请优先使用浏览器OCR</strong><p>高级组件需要安装独立Python环境和PaddleOCR-VL模型。安装、下载和首次准备可能耗时较长，并会占用较多磁盘、内存和处理器资源。</p></div>',
      '    <ul class="advanced-ocr-warning-list"><li>不同Apple Silicon机型的兼容性和速度可能不同。</li><li>电脑配置不足、网络不稳定或Python版本不兼容时可能安装失败。</li><li>安装失败不会影响Writing Assistant的其他功能。</li><li>当前项目只提取文字，不要求恢复表格、公式或复杂版式。</li></ul>',
      '    <label class="advanced-ocr-ack"><input id="advancedOcrAcknowledge" type="checkbox" /> <span>我了解安装耗时和性能要求，仍希望查看高级安装说明。</span></label>',
      '    <div class="modal-actions"><button class="btn" id="useBrowserOcrInstead" type="button">返回并使用浏览器OCR</button><button class="btn primary" id="continueAdvancedOcrInstall" type="button" disabled>我了解风险，查看高级安装</button></div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
    byId('closeAdvancedOcrWarning').addEventListener('click', function () { modal.classList.remove('show'); });
    byId('useBrowserOcrInstead').addEventListener('click', function () { modal.classList.remove('show'); var input = byId('browserOcrPageRange'); if (input) input.focus(); });
    byId('advancedOcrAcknowledge').addEventListener('change', function (event) { byId('continueAdvancedOcrInstall').disabled = !event.target.checked; });
    byId('continueAdvancedOcrInstall').addEventListener('click', function () { window.open(GUIDE_URL || INSTALL_URL, '_blank', 'noopener,noreferrer'); });
    modal.addEventListener('click', function (event) { if (event.target === modal) modal.classList.remove('show'); });
    return modal;
  }

  function openInstallWarning() {
    var modal = ensureInstallWarningModal();
    var checkbox = byId('advancedOcrAcknowledge');
    if (checkbox) checkbox.checked = false;
    var button = byId('continueAdvancedOcrInstall');
    if (button) button.disabled = true;
    modal.classList.add('show');
  }

  function updateProgress(title, detail, percent) {
    if (!currentRun) return;
    currentRun.title = title || currentRun.title;
    currentRun.detail = detail || '';
    currentRun.percent = Math.max(0, Math.min(100, Number(percent) || 0));
    var panel = byId('localOcrProgress');
    if (panel) panel.hidden = false;
    if (byId('localOcrProgressTitle')) byId('localOcrProgressTitle').textContent = currentRun.title;
    if (byId('localOcrProgressDetail')) byId('localOcrProgressDetail').textContent = currentRun.detail;
    if (byId('localOcrProgressBar')) byId('localOcrProgressBar').style.width = currentRun.percent + '%';
  }

  async function submitPage(pageNumber, image) {
    var payload = await api('/api/ocr-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageNumber: pageNumber,
        mimeType: image.mimeType,
        imageBase64: image.base64,
        width: image.width,
        height: image.height
      })
    }, 30000);
    return payload.job;
  }

  async function pollJob(jobId) {
    while (true) {
      if (!currentRun || currentRun.cancelled) throw new DOMException('OCR cancelled', 'AbortError');
      var payload = await api('/api/jobs/' + encodeURIComponent(jobId), {}, 15000);
      var job = payload.job || {};
      currentRun.activeJobId = jobId;
      if (job.status === 'done') return job;
      if (job.status === 'error') throw new Error(job.error || '本地OCR失败');
      if (job.status === 'cancelled') throw new DOMException('OCR cancelled', 'AbortError');
      currentRun.jobStage = job.stage || 'running';
      await sleep(POLL_INTERVAL_MS);
    }
  }

  async function startOcr() {
    if (currentRun) return;
    var importer = window.WritingAssistantDocumentImport;
    var ocrContext = context();
    if (!importer || !ocrContext) return;
    var pages;
    try { pages = parsePageRange(byId('localOcrPageRange').value, ocrContext.pages); }
    catch (error) { actions.showToast(error.message); return; }
    if (!pages.length) { actions.showToast('请输入需要识别的页码'); return; }
    if (!token()) { actions.showToast('请先配对本地OCR连接器'); return; }
    currentRun = { cancelled: false, activeJobId: '', title: '准备本地OCR', detail: '', percent: 0, pages: pages };
    renderCurrent();
    var results = [];
    try {
      for (var index = 0; index < pages.length; index++) {
        var pageNumber = pages[index];
        if (currentRun.cancelled) throw new DOMException('OCR cancelled', 'AbortError');
        var basePercent = Math.round(index / pages.length * 100);
        updateProgress('正在渲染第 ' + pageNumber + ' 页', (index + 1) + ' / ' + pages.length, basePercent);
        var image = await importer.renderPdfPageForOcr(pageNumber, { profile: 'advanced' });
        updateProgress('正在识别第 ' + pageNumber + ' 页', 'PaddleOCR-VL在本机处理 · ' + (index + 1) + ' / ' + pages.length, basePercent + Math.round(45 / pages.length));
        var submitted = await submitPage(pageNumber, image);
        currentRun.activeJobId = submitted.id;
        var completed = await pollJob(submitted.id);
        results.push({ page: pageNumber, text: completed.text || '', markdown: completed.markdown || '', engine: completed.engine || '' });
        updateProgress('第 ' + pageNumber + ' 页识别完成', (index + 1) + ' / ' + pages.length, Math.round((index + 1) / pages.length * 100));
      }
      await importer.applyOcrResults(results, {
        mode: 'advanced',
        serviceVersion: currentStatus && currentStatus.version || '0.8.0-m4-r1',
        engine: results[0] && results[0].engine || (currentStatus && currentStatus.backend && currentStatus.backend.engine) || 'PaddleOCR-VL',
        processedAt: new Date().toISOString()
      });
      actions.showToast('本地OCR完成：' + results.length + ' 页');
    } catch (error) {
      if (error && error.name === 'AbortError') actions.showToast('本地OCR已取消');
      else {
        console.error(error);
        actions.showToast(error && error.message ? error.message : '本地OCR失败');
      }
    } finally {
      currentRun = null;
      renderCurrent();
    }
  }

  async function cancelOcr() {
    if (!currentRun) return;
    currentRun.cancelled = true;
    updateProgress('正在取消', '当前页面推理可能需要结束后才会停止。', currentRun.percent);
    if (currentRun.activeJobId) {
      try {
        await api('/api/jobs/' + encodeURIComponent(currentRun.activeJobId) + '/cancel', { method: 'POST' }, 10000);
      } catch (error) {}
    }
  }

  function reset() {
    if (currentRun) cancelOcr();
    currentRun = null;
    currentStatus = null;
    lastContextKey = '';
  }

  window.WritingAssistantAdvancedOCR = {
    version: '0.8.0-m4-r1',
    serviceUrl: SERVICE_URL,
    render: render,
    detect: detectConnector,
    pair: pairConnector,
    reset: reset,
    parsePageRange: parsePageRange,
    compressPages: compressPages
  };
})();
