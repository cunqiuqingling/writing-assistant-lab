(function () {
  'use strict';

  var core = window.WritingAssistantCore;
  if (!core) return;

  var h = core.helpers;
  var actions = core.actions;
  var MAX_ENGINE_IDLE_MS = 10 * 60 * 1000;
  var INITIALISE_TIMEOUT_MS = 90 * 1000;

  var engine = null;
  var enginePromise = null;
  var engineGeneration = 0;
  var currentRun = null;
  var lastContextKey = '';
  var idleTimer = null;

  function byId(id) { return h.byId(id); }
  function text(value) { return String(value == null ? '' : value); }
  function escapeAttribute(value) { return h.escapeHtml(value).replace(/`/g, '&#96;'); }

  function context() {
    var importer = window.WritingAssistantDocumentImport;
    return importer && typeof importer.getOcrContext === 'function'
      ? importer.getOcrContext()
      : null;
  }

  function compressPages(pages) {
    var sorted = Array.from(new Set((pages || []).map(Number).filter(function (value) {
      return value > 0;
    }))).sort(function (a, b) { return a - b; });

    if (!sorted.length) return '';

    var ranges = [];
    var start = sorted[0];
    var previous = sorted[0];

    for (var index = 1; index <= sorted.length; index++) {
      var value = sorted[index];
      if (value === previous + 1) {
        previous = value;
        continue;
      }
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
      if (first > last) {
        var swap = first;
        first = last;
        last = swap;
      }
      if (first < 1 || last > totalPages) {
        throw new Error('页码必须在 1–' + totalPages + ' 之间');
      }
      for (var page = first; page <= last; page++) pages.push(page);
    });

    pages = Array.from(new Set(pages)).sort(function (a, b) { return a - b; });
    if (pages.length > maxPages) {
      throw new Error('当前设备单次建议最多识别 ' + maxPages + ' 页，请分批处理');
    }
    return pages;
  }

  function deviceProfile() {
    var memory = Number(navigator.deviceMemory || 0);
    var cores = Number(navigator.hardwareConcurrency || 0);

    if ((memory && memory <= 4) || (cores && cores <= 4)) {
      return {
        name: '节能',
        maxPages: 1,
        maxDimension: 1600,
        maxPixels: 2300000,
        detail: '检测到较低配置：单次1页，降低图像分辨率。'
      };
    }

    if ((memory && memory <= 8) || (cores && cores <= 6)) {
      return {
        name: '均衡',
        maxPages: 3,
        maxDimension: 1850,
        maxPixels: 3100000,
        detail: '单次最多3页，逐页处理。'
      };
    }

    return {
      name: '标准',
      maxPages: 5,
      maxDimension: 2050,
      maxPixels: 3800000,
      detail: '单次最多5页，逐页处理。'
    };
  }

  function updateProgress(title, detail, percent) {
    if (!currentRun) return;

    currentRun.title = title || currentRun.title;
    currentRun.detail = detail || '';
    currentRun.percent = Math.max(0, Math.min(100, Number(percent) || 0));

    if (byId('browserOcrProgress')) byId('browserOcrProgress').hidden = false;
    if (byId('browserOcrProgressTitle')) {
      byId('browserOcrProgressTitle').textContent = currentRun.title;
    }
    if (byId('browserOcrProgressDetail')) {
      byId('browserOcrProgressDetail').textContent = currentRun.detail;
    }
    if (byId('browserOcrProgressBar')) {
      byId('browserOcrProgressBar').style.width = currentRun.percent + '%';
    }
  }

  function translateTesseractStatus(status) {
    var value = text(status).toLowerCase();

    if (value.indexOf('loading tesseract core') >= 0) return '正在加载OCR核心';
    if (value.indexOf('initializing tesseract') >= 0) return '正在初始化OCR核心';
    if (value.indexOf('loading language traineddata') >= 0) return '正在加载英文识别数据';
    if (value.indexOf('initializing api') >= 0) return '正在准备英文识别器';
    if (value.indexOf('recognizing text') >= 0) return '正在识别英文文字';
    return status ? text(status) : '正在准备快速英文OCR';
  }

  function handleEngineProgress(message) {
    if (!currentRun || !message) return;

    var status = text(message.status);
    var progress = Math.max(0, Math.min(1, Number(message.progress) || 0));
    var lower = status.toLowerCase();
    var title = translateTesseractStatus(status);
    var detail = Math.round(progress * 100) + '%';

    if (lower.indexOf('recognizing text') >= 0 && currentRun.pageCount) {
      var pageIndex = Number(currentRun.pageIndex) || 0;
      var pageNumber = currentRun.pages[pageIndex] || pageIndex + 1;
      var base = pageIndex / currentRun.pageCount * 100;
      var span = 1 / currentRun.pageCount * 100;
      updateProgress(
        '正在识别第 ' + pageNumber + ' 页',
        '英文快速模型 · ' + (pageIndex + 1) + ' / ' + currentRun.pageCount +
          ' · ' + Math.round(progress * 100) + '%',
        base + span * progress
      );
      return;
    }

    var phaseStart = 3;
    var phaseSpan = 57;
    if (lower.indexOf('loading tesseract core') >= 0) {
      phaseStart = 3; phaseSpan = 14;
    } else if (lower.indexOf('initializing tesseract') >= 0) {
      phaseStart = 17; phaseSpan = 9;
    } else if (lower.indexOf('loading language traineddata') >= 0) {
      phaseStart = 26; phaseSpan = 22;
    } else if (lower.indexOf('initializing api') >= 0) {
      phaseStart = 48; phaseSpan = 12;
    }

    updateProgress(title, detail + ' · 文件由当前网站提供，识别仍在浏览器内完成',
      phaseStart + phaseSpan * progress);
  }

  function resetIdleTimer() {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(function () {
      stopEngine('浏览器OCR长时间未使用，已释放内存');
    }, MAX_ENGINE_IDLE_MS);
  }

  function stopEngine() {
    engineGeneration++;
    var active = engine;
    engine = null;
    enginePromise = null;

    if (idleTimer) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }

    if (active && typeof active.terminate === 'function') {
      Promise.resolve(active.terminate()).catch(function () {});
    }
  }

  function promiseWithTimeout(promise, milliseconds, onTimeout) {
    var timeoutId;
    var timedOut = false;

    var timeout = new Promise(function (_, reject) {
      timeoutId = window.setTimeout(function () {
        timedOut = true;
        try { if (onTimeout) onTimeout(); } catch (_) {}
        reject(new Error('浏览器OCR初始化超时。请检查网络后重试，或改用手动粘贴。'));
      }, milliseconds);
    });

    return Promise.race([promise, timeout]).finally(function () {
      if (!timedOut) window.clearTimeout(timeoutId);
    });
  }

  async function ensureEngine() {
    if (engine) {
      resetIdleTimer();
      return engine;
    }
    if (enginePromise) return enginePromise;

    var generation = ++engineGeneration;
    var sdkUrl = new URL('vendor/tesseract/tesseract.esm.min.js', document.baseURI).href;
    var workerPath = new URL('vendor/tesseract/worker.min.js', document.baseURI).href;
    var langPath = new URL('vendor/tesseract/lang', document.baseURI).href.replace(/\/$/, '');
    var corePath = new URL('vendor/tesseract/core', document.baseURI).href.replace(/\/$/, '');

    updateProgress(
      '正在加载快速英文OCR',
      '首次使用会加载本网站托管的英文识别组件；之后由浏览器缓存。',
      2
    );

    enginePromise = (async function () {
      var module = await import(sdkUrl);
      var createWorker = module.createWorker ||
        (module.default && module.default.createWorker);

      if (typeof createWorker !== 'function') {
        throw new Error('快速英文OCR组件接口不可用');
      }

      var creation = createWorker('eng', 1, {
        workerPath: workerPath,
        langPath: langPath,
        corePath: corePath,
        gzip: true,
        logger: handleEngineProgress
      });

      var created = await promiseWithTimeout(
        creation,
        INITIALISE_TIMEOUT_MS,
        function () { engineGeneration++; }
      );

      if (generation !== engineGeneration) {
        if (created && typeof created.terminate === 'function') {
          await created.terminate();
        }
        throw new DOMException('OCR cancelled', 'AbortError');
      }

      engine = created;
      enginePromise = null;
      resetIdleTimer();
      return engine;
    })().catch(function (error) {
      enginePromise = null;
      if (generation === engineGeneration) engine = null;
      throw error;
    });

    return enginePromise;
  }

  async function startBrowserOcr() {
    if (currentRun) return;

    var importer = window.WritingAssistantDocumentImport;
    var ocrContext = context();
    if (!importer || !ocrContext) return;

    var profile = deviceProfile();
    var pages;

    try {
      pages = parsePageRange(
        byId('browserOcrPageRange').value,
        ocrContext.pages,
        profile.maxPages
      );
    } catch (error) {
      actions.showToast(error.message);
      return;
    }

    if (!pages.length) {
      actions.showToast('请输入需要识别的页码');
      return;
    }

    currentRun = {
      cancelled: false,
      title: '准备快速英文OCR',
      detail: '',
      percent: 0,
      pages: pages,
      pageIndex: 0,
      pageCount: pages.length
    };
    render(ocrContext);

    var results = [];

    try {
      var active = await ensureEngine();

      for (var index = 0; index < pages.length; index++) {
        if (!currentRun || currentRun.cancelled) {
          throw new DOMException('OCR cancelled', 'AbortError');
        }

        currentRun.pageIndex = index;
        var pageNumber = pages[index];
        var basePercent = Math.round(index / pages.length * 100);

        updateProgress(
          '正在渲染第 ' + pageNumber + ' 页',
          (index + 1) + ' / ' + pages.length + ' · PDF仍在当前浏览器',
          basePercent
        );

        var image = await importer.renderPdfPageForOcr(pageNumber, {
          profile: 'browser',
          maxDimension: profile.maxDimension,
          maxPixels: profile.maxPixels,
          quality: 0.84
        });

        if (!currentRun || currentRun.cancelled) {
          throw new DOMException('OCR cancelled', 'AbortError');
        }

        var response = await active.recognize(image.blob);
        var recognised = response && response.data
          ? text(response.data.text).replace(/\u0000/g, '').trim()
          : '';

        if (!recognised) {
          throw new Error('第 ' + pageNumber + ' 页没有识别出英文文字');
        }

        results.push({
          page: pageNumber,
          text: recognised,
          engine: 'Tesseract.js 7 · English fast data'
        });

        updateProgress(
          '第 ' + pageNumber + ' 页识别完成',
          (index + 1) + ' / ' + pages.length,
          Math.round((index + 1) / pages.length * 100)
        );
      }

      await importer.applyOcrResults(results, {
        mode: 'browser',
        engine: 'Tesseract.js 7 · English fast data',
        serviceVersion: '0.8.0',
        processedAt: new Date().toISOString()
      });

      actions.showToast('快速英文OCR完成：' + results.length + ' 页');
      resetIdleTimer();
    } catch (error) {
      if ((currentRun && currentRun.cancelled) ||
          (error && error.name === 'AbortError')) {
        actions.showToast('浏览器OCR已取消');
      } else {
        console.error(error);
        actions.showToast(
          error && error.message
            ? error.message
            : '快速英文OCR失败'
        );
      }
    } finally {
      currentRun = null;
      render(context());
    }
  }

  function cancelBrowserOcr() {
    if (!currentRun) return;
    currentRun.cancelled = true;
    updateProgress('正在取消', '正在停止英文OCR并释放内存。', currentRun.percent);
    stopEngine();
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
    var contextKey = [
      ocrContext.fileName,
      ocrContext.pages,
      compressPages(defaults)
    ].join('|');

    var oldInput = byId('browserOcrPageRange');
    var rangeValue = oldInput && contextKey === lastContextKey
      ? oldInput.value
      : compressPages(defaults);

    lastContextKey = contextKey;

    var running = Boolean(currentRun);
    var summary = ocrContext.pdfStatus.scannedLikely
      ? '该PDF缺少可用文字层。可直接在浏览器中提取印刷英文，无需安装软件。'
      : '部分页面文字很少，可只对这些页面补充英文OCR。';

    panel.hidden = false;
    panel.innerHTML = [
      '<div class="browser-ocr-card">',
      '  <div class="browser-ocr-head"><div class="browser-ocr-icon" aria-hidden="true">Aa</div><div><span class="section-kicker">FAST ENGLISH OCR</span><h3>浏览器英文文字识别</h3><p>' + h.escapeHtml(summary) + '</p></div><span class="browser-ocr-recommended">推荐</span></div>',
      '  <div class="browser-ocr-note"><strong>英文文字优先</strong><span>适合英文写作材料；忽略图片、表格和公式，结果进入文档预览继续修正。</span></div>',
      '  <div class="browser-ocr-device"><span>设备策略：' + h.escapeHtml(profile.name) + '</span><small>' + h.escapeHtml(profile.detail) + '</small></div>',
      '  <div class="local-ocr-run-grid"><div class="field"><label for="browserOcrPageRange">识别页码</label><input class="text-input" id="browserOcrPageRange" value="' + escapeAttribute(rangeValue) + '" placeholder="例如：1–3"' + (running ? ' disabled' : '') + ' /></div><div class="local-ocr-run-action"><button class="btn primary" id="runBrowserOcrBtn" type="button"' + (running || !recommended.length ? ' disabled' : '') + '>使用快速英文OCR</button></div></div>',
      '  <div class="local-ocr-page-hint">建议页面：' + h.escapeHtml(compressPages(recommended.slice(0, 30)) || '无') + ' · 当前设备单次最多 ' + profile.maxPages + ' 页 · 首次加载后浏览器会缓存英文识别资源</div>',
      '  <div class="local-ocr-progress" id="browserOcrProgress"' + (running ? '' : ' hidden') + '><div class="local-ocr-progress-line"><span id="browserOcrProgressBar" style="width:' + (currentRun ? currentRun.percent : 0) + '%"></span></div><div class="local-ocr-progress-copy"><strong id="browserOcrProgressTitle">' + h.escapeHtml(currentRun ? currentRun.title : '') + '</strong><span id="browserOcrProgressDetail">' + h.escapeHtml(currentRun ? currentRun.detail : '') + '</span></div><button class="btn small quiet danger-text-button" id="cancelBrowserOcrBtn" type="button">取消</button></div>',
      '  <p class="local-ocr-privacy">OCR核心和英文识别数据由当前网站静态资源提供；页面图像与识别计算仍停留在当前浏览器。</p>',
      '  <details class="advanced-ocr-details"><summary><span><strong>高级本地OCR</strong><small>可选 · 实验性 · 安装和首次模型准备耗时较长</small></span><span aria-hidden="true">⌄</span></summary><div id="advancedLocalOcrPanel"></div></details>',
      '</div>'
    ].join('');

    byId('runBrowserOcrBtn').addEventListener('click', startBrowserOcr);
    if (byId('cancelBrowserOcrBtn')) {
      byId('cancelBrowserOcrBtn').addEventListener('click', cancelBrowserOcr);
    }

    if (window.WritingAssistantAdvancedOCR &&
        typeof window.WritingAssistantAdvancedOCR.render === 'function') {
      window.WritingAssistantAdvancedOCR.render(ocrContext);
    }
  }

  function reset() {
    if (currentRun) cancelBrowserOcr();
    currentRun = null;
    lastContextKey = '';

    if (window.WritingAssistantAdvancedOCR &&
        typeof window.WritingAssistantAdvancedOCR.reset === 'function') {
      window.WritingAssistantAdvancedOCR.reset();
    }
  }

  window.WritingAssistantLocalOCR = {
    version: '0.8.0',
    engine: 'tesseract-english-fast',
    render: render,
    reset: reset,
    start: startBrowserOcr,
    cancel: cancelBrowserOcr,
    parsePageRange: parsePageRange,
    compressPages: compressPages,
    deviceProfile: deviceProfile
  };
})();
