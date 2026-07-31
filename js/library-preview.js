(function () {
  'use strict';

  var initialized = false;
  var currentItemId = '';
  var assessmentWrapped = false;
  var observer = null;
  var modalObserver = null;

  function byId(id) { return document.getElementById(id); }
  function text(value) { return String(value == null ? '' : value); }
  function clean(value) { return text(value).replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim(); }
  function escapeHtml(value) {
    return text(value).replace(/[&<>'"]/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character];
    });
  }
  function unique(values) {
    var seen = {};
    return (values || []).filter(function (value) {
      var key = clean(value).toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  function safeUrl(value) {
    try {
      var url = new URL(text(value), window.location.href);
      return url.protocol === 'https:' ? url.toString() : '';
    } catch (error) {
      return '';
    }
  }
  function workspace() { return window.WritingAssistantWorkspace || null; }
  function core() { return window.WritingAssistantCore || null; }
  function getItem(id) {
    var api = workspace();
    return api && typeof api.getItem === 'function' ? api.getItem(id) : null;
  }
  function cardItemId(card) {
    if (!card) return '';
    var node = card.querySelector('[data-workspace-manage], [data-workspace-sentence], [data-workspace-paragraph]');
    if (!node) return '';
    return node.dataset.workspaceManage || node.dataset.workspaceSentence || node.dataset.workspaceParagraph || '';
  }
  function itemSourceUrl(item) {
    if (!item) return '';
    if (item.remoteMeta && item.remoteMeta.url) return safeUrl(item.remoteMeta.url);
    if (item.sourceUrl) return safeUrl(item.sourceUrl);
    if (item.remoteResource) {
      var base = item.remoteResource.source === 'wikisource'
        ? 'https://en.wikisource.org/wiki/'
        : 'https://en.wikipedia.org/wiki/';
      return safeUrl(base + encodeURIComponent(text(item.remoteResource.query).replace(/ /g, '_')).replace(/%2F/g, '/'));
    }
    var match = text(item.source).match(/https:\/\/[^\s]+/);
    return match ? safeUrl(match[0]) : '';
  }
  function getPreviewText(item) {
    if (!item) return '';
    if (item.remoteResource) return clean(item.remoteResource.description || item.text);
    var chapters = Array.isArray(item.chapters) ? item.chapters : [];
    var body = chapters.length
      ? chapters.slice(0, 3).map(function (chapter) {
          return (chapter.title ? chapter.title + '\n\n' : '') + clean(chapter.text || chapter.content);
        }).join('\n\n')
      : clean(item.text);
    var limit = 12000;
    return body.length > limit ? body.slice(0, limit).trim() + '\n\n[预览已截断，进入练习后可查看完整材料。]' : body;
  }

  function assessmentStatusLabel(status) {
    return ({
      official: '官方考官评分',
      sourceClaimed: '原网站标注',
      teacher: '教师评价',
      userEntered: '用户手动填写',
      aiEstimated: 'AI参考估分',
      unscored: '未评分'
    })[status] || '未评分';
  }
  function scoreText(assessment) {
    if (!assessment || assessment.overallBand == null || assessment.overallBand === '') return '';
    var score = Number(assessment.overallBand);
    if (!Number.isFinite(score)) return '';
    return assessment.status === 'aiEstimated' ? '约 ' + score.toFixed(score % 1 ? 1 : 0) : score.toFixed(score % 1 ? 1 : 0);
  }
  function assessmentMarkup(item) {
    if (item && item.remoteResource && item.remoteResource.group === 'IELTS Writing') {
      return '<section class="library-preview-section library-preview-assessment">' +
        '<div class="library-preview-section-head"><h3>IELTS评分信息</h3><span class="assessment-status neutral">议题输入材料</span></div>' +
        '<p class="library-preview-note">这是一篇用于扩充论据、背景知识和表达素材的公共资源，不是IELTS考生范文，因此不应标注Band分数。</p>' +
      '</section>';
    }
    var assessment = item && item.assessment;
    var hasAssessment = assessment && (
      assessment.status && assessment.status !== 'unscored' ||
      assessment.overallBand != null && assessment.overallBand !== '' ||
      clean(assessment.examinerComments) ||
      assessment.criteria && Object.keys(assessment.criteria).some(function (key) { return assessment.criteria[key] != null && assessment.criteria[key] !== ''; })
    );
    if (!hasAssessment) {
      if (item && item.category === 'IELTS') {
        return '<section class="library-preview-section library-preview-assessment">' +
          '<div class="library-preview-section-head"><h3>IELTS评分信息</h3><span class="assessment-status neutral">未评分</span></div>' +
          '<p class="library-preview-note">该材料没有提供官方评分或考官评语，但仍可正常进行句子与段落练习。</p>' +
        '</section>';
      }
      return '';
    }
    var status = assessment.status || 'unscored';
    var score = scoreText(assessment);
    var criteria = assessment.criteria || {};
    var criterionRows = [
      ['Task Achievement / Response', criteria.taskResponse],
      ['Coherence & Cohesion', criteria.coherenceCohesion],
      ['Lexical Resource', criteria.lexicalResource],
      ['Grammar Range & Accuracy', criteria.grammaticalRangeAccuracy]
    ].filter(function (entry) { return entry[1] != null && entry[1] !== ''; });
    var criteriaHtml = criterionRows.length
      ? '<div class="assessment-criteria">' + criterionRows.map(function (entry) {
          return '<div><span>' + escapeHtml(entry[0]) + '</span><strong>' + escapeHtml(entry[1]) + '</strong></div>';
        }).join('') + '</div>'
      : '';
    var comment = clean(assessment.examinerComments);
    var source = clean(assessment.sourceLabel);
    return '<section class="library-preview-section library-preview-assessment">' +
      '<div class="library-preview-section-head"><h3>IELTS评分信息</h3><div class="assessment-heading-values"><span class="assessment-status ' + escapeHtml(status) + '">' + escapeHtml(assessmentStatusLabel(status)) + '</span>' +
      (score ? '<strong class="assessment-band">Band ' + escapeHtml(score) + '</strong>' : '') + '</div></div>' +
      criteriaHtml +
      (comment ? '<div class="assessment-comment"><strong>评语</strong><p>' + escapeHtml(comment).replace(/\n/g, '<br />') + '</p></div>' : '') +
      (source ? '<p class="library-preview-note">评分来源：' + escapeHtml(source) + '</p>' : '') +
    '</section>';
  }

  function ensureModal() {
    if (byId('libraryPreviewModal')) return;
    var modal = document.createElement('div');
    modal.id = 'libraryPreviewModal';
    modal.className = 'modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'libraryPreviewTitle');
    modal.innerHTML = [
      '<div class="modal library-preview-modal">',
      '  <div class="modal-head library-preview-head">',
      '    <div><span class="section-kicker">MATERIAL PREVIEW</span><h2 id="libraryPreviewTitle">材料预览</h2><p class="modal-helper" id="libraryPreviewMeta"></p></div>',
      '    <button class="icon-close-button" id="closeLibraryPreviewModal" type="button" aria-label="关闭">×</button>',
      '  </div>',
      '  <div class="modal-body library-preview-body">',
      '    <div id="libraryPreviewAssessment"></div>',
      '    <section class="library-preview-section">',
      '      <div class="library-preview-section-head"><h3>正文预览</h3><a id="libraryPreviewSourceLink" href="#" target="_blank" rel="noopener noreferrer" hidden>打开原始来源 ↗</a></div>',
      '      <div class="library-preview-text" id="libraryPreviewText"></div>',
      '    </section>',
      '    <div class="library-preview-actions" id="libraryPreviewActions"></div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
    byId('closeLibraryPreviewModal').addEventListener('click', closePreview);
    modal.addEventListener('click', function (event) { if (event.target === modal) closePreview(); });
  }
  function closePreview() {
    var modal = byId('libraryPreviewModal');
    if (modal) modal.classList.remove('show');
    currentItemId = '';
  }
  function openPreview(id) {
    var item = getItem(id);
    if (!item) return;
    ensureModal();
    currentItemId = id;
    byId('libraryPreviewTitle').textContent = item.title || 'Untitled';
    var source = item.source || 'Unknown source';
    var license = item.license || 'Personal study';
    byId('libraryPreviewMeta').textContent = [item.category || 'Material', source, license].join(' · ');
    byId('libraryPreviewAssessment').innerHTML = assessmentMarkup(item);
    byId('libraryPreviewText').textContent = getPreviewText(item) || '这份材料暂时没有可预览的正文。';
    var url = itemSourceUrl(item);
    var link = byId('libraryPreviewSourceLink');
    link.hidden = !url;
    if (url) link.href = url;
    else link.removeAttribute('href');

    var actions = byId('libraryPreviewActions');
    if (item.remoteResource) {
      actions.innerHTML = '<button class="btn primary" type="button" data-curated-fetch="' + escapeHtml(item.id) + '">联网获取正文并进入导入预览</button>';
    } else {
      actions.innerHTML = '<button class="btn soft" type="button" data-preview-sentence="' + escapeHtml(item.id) + '">句子练习</button>' +
        '<button class="btn primary" type="button" data-preview-paragraph="' + escapeHtml(item.id) + '">段落练习</button>';
    }
    byId('libraryPreviewModal').classList.add('show');
  }

  function enhanceCards() {
    var api = workspace();
    var grid = byId('libraryGrid');
    if (!api || !grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll('.library-card'), function (card) {
      var id = cardItemId(card);
      if (!id) return;
      var item = getItem(id);
      if (!item) return;
      var titleRow = card.querySelector('.library-card-title-row');
      if (titleRow && !titleRow.querySelector('[data-library-preview]')) {
        var previewButton = document.createElement('button');
        previewButton.type = 'button';
        previewButton.className = 'library-preview-button';
        previewButton.dataset.libraryPreview = id;
        previewButton.textContent = '预览';
        previewButton.setAttribute('aria-label', '预览' + (item.title || '材料'));
        titleRow.appendChild(previewButton);
      }
      if (!item.remoteResource || card.dataset.remoteEnhanced) return;
      card.dataset.remoteEnhanced = '1';
      card.classList.add('remote-resource-card');
      var preview = card.querySelector('.library-preview');
      if (preview) preview.textContent = item.remoteResource.description || item.text || '';
      var actionBox = card.querySelector('.library-actions');
      if (actionBox) {
        actionBox.innerHTML = '<button class="btn small primary" type="button" data-curated-fetch="' + escapeHtml(id) + '">在线预览并导入</button>';
      }
    });
  }

  function sourceDetails(source) {
    if (source === 'wikisource') {
      return {
        label: 'Wikisource',
        license: 'Copyright status varies by work and jurisdiction; verify the source page before reuse.'
      };
    }
    return {
      label: 'Wikipedia',
      license: 'CC BY-SA 4.0 · attribution and share-alike apply; verify the source page.'
    };
  }
  function chooseResult(results, query) {
    var wanted = clean(query).toLowerCase();
    return (results || []).find(function (result) { return clean(result.title).toLowerCase() === wanted; }) || (results || [])[0] || null;
  }
  async function fetchCuratedItem(id, button) {
    var item = getItem(id);
    var remote = item && item.remoteResource;
    var online = window.WritingAssistantOnlineResources;
    var importer = window.WritingAssistantDocumentImport;
    var appCore = core();
    if (!item || !remote) return;
    if (!online || typeof online.search !== 'function' || typeof online.fetchPage !== 'function' || !importer || typeof importer.openPrepared !== 'function') {
      if (appCore && appCore.actions) appCore.actions.showToast('在线资源或文档预览器尚未载入');
      return;
    }
    var original = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = '正在获取…'; }
    try {
      var results = await online.search(remote.source, remote.query);
      var result = chooseResult(results, remote.query);
      if (!result) throw new Error('没有找到匹配的公共资源页面');
      var page = await online.fetchPage(remote.source, result.title);
      var source = sourceDetails(remote.source);
      var url = safeUrl(result.url);
      var warnings = Array.isArray(page.warnings) ? page.warnings.slice() : [];
      warnings.push('正文来自' + source.label + '；保存或再次传播前请检查原页面的署名与版权状态。');
      var totalChars = page.chapters.reduce(function (sum, chapter) { return sum + clean(chapter.text).length; }, 0);
      closePreview();
      importer.openPrepared({
        format: remote.source,
        title: page.displayTitle || page.title,
        source: source.label + ' · ' + page.title + (url ? ' · ' + url : ''),
        license: source.license,
        tags: unique((item.tags || []).filter(function (tag) { return tag !== 'online-resource'; }).concat([remote.source])),
        folderId: item.folderId,
        fileName: page.title,
        fileSize: totalChars,
        warnings: warnings,
        chapters: page.chapters,
        remoteMeta: {
          provider: remote.source,
          pageTitle: page.title,
          pageId: page.pageId,
          revisionId: page.revisionId,
          url: url,
          catalogId: remote.catalogId,
          fetchedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error(error);
      if (appCore && appCore.actions) appCore.actions.showToast(error.message || '公共资源获取失败');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }

  function assessmentFieldValue(id) {
    var field = byId(id);
    return field ? clean(field.value) : '';
  }
  function numberOrNull(value) {
    if (value === '') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function readAssessment() {
    var status = assessmentFieldValue('materialScoreStatus') || 'unscored';
    var assessment = {
      status: status,
      overallBand: numberOrNull(assessmentFieldValue('materialOverallBand')),
      criteria: {
        taskResponse: numberOrNull(assessmentFieldValue('materialTaskScore')),
        coherenceCohesion: numberOrNull(assessmentFieldValue('materialCoherenceScore')),
        lexicalResource: numberOrNull(assessmentFieldValue('materialLexicalScore')),
        grammaticalRangeAccuracy: numberOrNull(assessmentFieldValue('materialGrammarScore'))
      },
      examinerComments: assessmentFieldValue('materialExaminerComments'),
      sourceLabel: assessmentFieldValue('materialAssessmentSource')
    };
    var hasCriteria = Object.keys(assessment.criteria).some(function (key) { return assessment.criteria[key] != null; });
    if (status === 'unscored' && assessment.overallBand == null && !hasCriteria && !assessment.examinerComments && !assessment.sourceLabel) return null;
    return assessment;
  }
  function resetAssessmentFields() {
    if (byId('materialScoreStatus')) byId('materialScoreStatus').value = 'unscored';
    ['materialOverallBand', 'materialTaskScore', 'materialCoherenceScore', 'materialLexicalScore', 'materialGrammarScore', 'materialExaminerComments', 'materialAssessmentSource'].forEach(function (id) {
      if (byId(id)) byId(id).value = '';
    });
  }
  function injectAssessmentFields() {
    var modal = byId('materialModal');
    if (!modal || byId('materialAssessmentDetails')) return;
    var tags = byId('materialTags');
    if (!tags) return;
    var anchor = tags.closest('.field');
    var workspaceFields = modal.querySelector('.workspace-material-fields');
    if (workspaceFields) anchor = workspaceFields;
    var details = document.createElement('details');
    details.id = 'materialAssessmentDetails';
    details.className = 'material-assessment-details';
    details.innerHTML = [
      '<summary>IELTS评分信息（可选）</summary>',
      '<div class="material-assessment-body">',
      '  <p>没有评分的材料可以直接保存。只有原始来源明确提供时，才应选择“官方考官评分”。</p>',
      '  <div class="split-row">',
      '    <div class="field"><label for="materialScoreStatus">评分身份</label><select id="materialScoreStatus" style="width:100%">',
      '      <option value="unscored">未评分</option>',
      '      <option value="official">官方考官评分</option>',
      '      <option value="sourceClaimed">原网站标注</option>',
      '      <option value="teacher">教师评价</option>',
      '      <option value="userEntered">用户手动填写</option>',
      '      <option value="aiEstimated">AI参考估分</option>',
      '    </select></div>',
      '    <div class="field"><label for="materialOverallBand">总分（0–9，可空）</label><input class="text-input" id="materialOverallBand" type="number" min="0" max="9" step="0.5" style="width:100%" /></div>',
      '  </div>',
      '  <div class="assessment-score-grid">',
      '    <div class="field"><label for="materialTaskScore">Task Achievement / Response</label><input class="text-input" id="materialTaskScore" type="number" min="0" max="9" step="0.5" /></div>',
      '    <div class="field"><label for="materialCoherenceScore">Coherence &amp; Cohesion</label><input class="text-input" id="materialCoherenceScore" type="number" min="0" max="9" step="0.5" /></div>',
      '    <div class="field"><label for="materialLexicalScore">Lexical Resource</label><input class="text-input" id="materialLexicalScore" type="number" min="0" max="9" step="0.5" /></div>',
      '    <div class="field"><label for="materialGrammarScore">Grammar Range &amp; Accuracy</label><input class="text-input" id="materialGrammarScore" type="number" min="0" max="9" step="0.5" /></div>',
      '  </div>',
      '  <div class="field"><label for="materialExaminerComments">考官或教师评语（可空）</label><textarea class="field-area" id="materialExaminerComments" placeholder="粘贴原始评语，不要把AI分析冒充成考官评语。"></textarea></div>',
      '  <div class="field"><label for="materialAssessmentSource">评分来源说明（可空）</label><input class="text-input" id="materialAssessmentSource" style="width:100%" placeholder="例如：IELTS official sample / 原网站标注" /></div>',
      '</div>'
    ].join('');
    anchor.parentNode.insertBefore(details, anchor.nextSibling);

    var lastShown = false;
    modalObserver = new MutationObserver(function () {
      var shown = modal.classList.contains('show');
      if (shown && !lastShown) resetAssessmentFields();
      lastShown = shown;
    });
    modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
  function wrapAssessmentSave() {
    var api = workspace();
    if (!api || assessmentWrapped || typeof api.prepareLibraryItem !== 'function') return;
    var original = api.prepareLibraryItem;
    api.prepareLibraryItem = function (item) {
      var prepared = original(item) || item;
      var assessment = readAssessment();
      if (assessment) prepared.assessment = assessment;
      else delete prepared.assessment;
      return prepared;
    };
    assessmentWrapped = true;
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      var preview = event.target.closest('[data-library-preview]');
      if (preview) {
        event.preventDefault();
        event.stopPropagation();
        openPreview(preview.dataset.libraryPreview);
        return;
      }
      var fetchButton = event.target.closest('[data-curated-fetch]');
      if (fetchButton) {
        event.preventDefault();
        event.stopPropagation();
        fetchCuratedItem(fetchButton.dataset.curatedFetch, fetchButton);
        return;
      }
      var sentence = event.target.closest('[data-preview-sentence]');
      if (sentence) {
        var api = workspace();
        closePreview();
        if (api) api.loadDocumentChapter(sentence.dataset.previewSentence, 'sentence', 0, 0);
        return;
      }
      var paragraph = event.target.closest('[data-preview-paragraph]');
      if (paragraph) {
        var workspaceApi = workspace();
        closePreview();
        if (workspaceApi) workspaceApi.loadDocumentChapter(paragraph.dataset.previewParagraph, 'paragraph', 0, 0);
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && byId('libraryPreviewModal') && byId('libraryPreviewModal').classList.contains('show')) closePreview();
    });
  }

  function boot() {
    if (initialized) return;
    if (!document.body || !workspace() || !core()) {
      window.setTimeout(boot, 50);
      return;
    }
    initialized = true;
    ensureModal();
    injectAssessmentFields();
    wrapAssessmentSave();
    bindEvents();
    enhanceCards();
    var grid = byId('libraryGrid');
    if (grid) {
      observer = new MutationObserver(function () { window.requestAnimationFrame(enhanceCards); });
      observer.observe(grid, { childList: true, subtree: true });
    }
    var materialModal = byId('materialModal');
    if (materialModal && !byId('materialAssessmentDetails')) {
      var fieldObserver = new MutationObserver(function () {
        injectAssessmentFields();
        wrapAssessmentSave();
        if (byId('materialAssessmentDetails')) fieldObserver.disconnect();
      });
      fieldObserver.observe(materialModal, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
