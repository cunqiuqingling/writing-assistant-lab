(function () {
  'use strict';

  var initialized = false;
  var observer = null;
  var pendingImport = null;
  var assessmentWrapped = false;
  var SCORE_STATUSES = ['official', 'sourceClaimed', 'teacher', 'userEntered', 'aiEstimated', 'unscored'];
  var CATEGORIES = ['IELTS', 'Academic', 'Pharmacy', 'Literature', 'Custom'];
  var OFFICIAL_IELTS_HOSTS = ['ielts.org', 'www.ielts.org', 'takeielts.britishcouncil.org'];

  function core() { return window.WritingAssistantCore || null; }
  function workspace() { return window.WritingAssistantWorkspace || null; }
  function byId(id) { return document.getElementById(id); }
  function value(id) { var field = byId(id); return field ? String(field.value || '').trim() : ''; }
  function text(input) { return String(input == null ? '' : input); }
  function clean(input) { return text(input).replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim(); }
  function escapeHtml(input) {
    return text(input).replace(/[&<>'"]/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character];
    });
  }
  function unique(values) {
    var seen = {};
    return (values || []).filter(function (entry) {
      var normalized = clean(entry).toLowerCase();
      if (!normalized || seen[normalized]) return false;
      seen[normalized] = true;
      return true;
    });
  }
  function safeUrl(input) {
    try {
      var url = new URL(text(input), window.location.href);
      return url.protocol === 'https:' ? url.toString() : '';
    } catch (error) { return ''; }
  }
  function sourceUrl(item) {
    if (!item) return '';
    if (item.sourceMeta && item.sourceMeta.url) return safeUrl(item.sourceMeta.url);
    if (item.remoteSource && item.remoteSource.url) return safeUrl(item.remoteSource.url);
    if (item.assessment && item.assessment.sourceUrl) return safeUrl(item.assessment.sourceUrl);
    var match = text(item.source).match(/https:\/\/[^\s]+/);
    return match ? safeUrl(match[0]) : '';
  }
  function showToast(message) {
    var app = core();
    if (app && app.actions && app.actions.showToast) app.actions.showToast(message);
  }
  function copyText(content, message) {
    var app = core();
    if (app && app.actions && app.actions.copyText) {
      app.actions.copyText(content, message || '已复制');
      return;
    }
    navigator.clipboard.writeText(content).then(function () { showToast(message || '已复制'); });
  }
  function downloadJson(data, fileName) {
    var blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }
  function uid() {
    var app = core();
    return app && app.helpers && app.helpers.uid ? app.helpers.uid() : 'library-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function ensureCategoryOptions() {
    [['libraryCategory', 'Pharmacy'], ['materialCategory', 'Pharmacy']].forEach(function (entry) {
      var select = byId(entry[0]);
      if (!select || Array.prototype.some.call(select.options, function (option) { return option.value === entry[1]; })) return;
      var option = document.createElement('option');
      option.value = entry[1];
      option.textContent = entry[1];
      if (entry[0] === 'libraryCategory') {
        var custom = Array.prototype.find.call(select.options, function (item) { return item.value === 'Custom'; });
        select.insertBefore(option, custom || null);
      } else select.appendChild(option);
    });
  }

  function folderMap() {
    var api = workspace();
    var folders = api && api.getFolders ? api.getFolders() : [];
    var byIdMap = {};
    var byName = {};
    folders.forEach(function (folder) {
      byIdMap[folder.id] = folder;
      var key = clean(folder.name).toLowerCase();
      if (!byName[key]) byName[key] = [];
      byName[key].push(folder);
    });
    return { folders: folders, byId: byIdMap, byName: byName };
  }
  function defaultFolder(category) {
    return ({ IELTS: 'folder-ielts', Academic: 'folder-academic', Pharmacy: 'folder-pharmacy', Literature: 'folder-literature', Custom: 'folder-my-custom' })[category] || 'folder-my-custom';
  }
  function resolveFolder(raw, category, warnings) {
    var map = folderMap();
    if (raw.folderId && map.byId[String(raw.folderId)]) return String(raw.folderId);
    var path = Array.isArray(raw.folderPath) ? raw.folderPath.map(clean).filter(Boolean) : [];
    if (path.length) {
      var parentId = 'folder-all';
      for (var i = 0; i < path.length; i++) {
        var name = path[i].toLowerCase();
        var candidate = map.folders.find(function (folder) { return clean(folder.name).toLowerCase() === name && (i === 0 || folder.parentId === parentId); });
        if (candidate) parentId = candidate.id;
      }
      if (parentId !== 'folder-all') return parentId;
      warnings.push('folderPath 无法完全匹配，已使用类别默认目录');
    }
    return defaultFolder(category);
  }

  function validBand(input) {
    if (input == null || input === '') return null;
    var score = Number(input);
    if (!Number.isFinite(score) || score < 0 || score > 9 || Math.abs(score * 2 - Math.round(score * 2)) > 0.001) return NaN;
    return score;
  }
  function normalizeCriteria(input, warnings) {
    input = input && typeof input === 'object' ? input : {};
    var aliases = {
      taskResponse: ['taskResponse', 'taskAchievement', 'taskAchievementResponse'],
      coherenceCohesion: ['coherenceCohesion', 'coherence'],
      lexicalResource: ['lexicalResource', 'lexical'],
      grammaticalRangeAccuracy: ['grammaticalRangeAccuracy', 'grammar']
    };
    var output = {};
    Object.keys(aliases).forEach(function (key) {
      var raw = null;
      aliases[key].some(function (alias) { if (Object.prototype.hasOwnProperty.call(input, alias)) { raw = input[alias]; return true; } return false; });
      var score = validBand(raw);
      if (Number.isNaN(score)) { warnings.push(key + ' 不是0–9之间以0.5递增的分数，已留空'); score = null; }
      output[key] = score;
    });
    return output;
  }
  function normalizeAssessment(input, sourceMeta, warnings) {
    if (!input || typeof input !== 'object') return null;
    var status = SCORE_STATUSES.indexOf(input.status) >= 0 ? input.status : 'unscored';
    if (status !== input.status && input.status) warnings.push('未知评分身份已改为 unscored');
    var overall = validBand(input.overallBand);
    if (Number.isNaN(overall)) { warnings.push('overallBand 不是0–9之间以0.5递增的分数，已留空'); overall = null; }
    var source = safeUrl(input.sourceUrl || (sourceMeta && sourceMeta.url));
    if (status === 'official') {
      var host = '';
      try { host = new URL(source).hostname.toLowerCase(); } catch (error) {}
      if (!source || OFFICIAL_IELTS_HOSTS.indexOf(host) < 0) warnings.push('材料标为官方评分，但来源不是可核验的IELTS官方域名，请人工确认');
    }
    if (status === 'aiEstimated' && /examiner/i.test(clean(input.sourceLabel))) warnings.push('AI估分的来源说明包含 examiner，请确认没有冒充官方考官');
    var assessment = {
      status: status,
      overallBand: overall,
      criteria: normalizeCriteria(input.criteria, warnings),
      examinerComments: clean(input.examinerComments || input.comments),
      sourceLabel: clean(input.sourceLabel),
      sourceUrl: source
    };
    var hasCriteria = Object.keys(assessment.criteria).some(function (key) { return assessment.criteria[key] != null; });
    if (status === 'unscored' && overall == null && !hasCriteria && !assessment.examinerComments && !assessment.sourceLabel) return null;
    return assessment;
  }
  function normalizeSource(raw, warnings) {
    var sourceMeta = raw.sourceMeta && typeof raw.sourceMeta === 'object' ? raw.sourceMeta : (raw.source && typeof raw.source === 'object' ? raw.source : {});
    var url = safeUrl(sourceMeta.url || raw.sourceUrl);
    if ((sourceMeta.url || raw.sourceUrl) && !url) warnings.push('来源URL不是安全的HTTPS地址，已忽略');
    var publisher = clean(sourceMeta.publisher);
    var title = clean(sourceMeta.title);
    var sourceText = typeof raw.source === 'string' ? clean(raw.source) : [publisher, title].filter(Boolean).join(' · ');
    return {
      display: sourceText || 'Imported library',
      meta: {
        publisher: publisher,
        title: title,
        url: url,
        accessedAt: clean(sourceMeta.accessedAt),
        reuseStatus: clean(sourceMeta.reuseStatus || raw.reuseStatus),
        rightsNote: clean(sourceMeta.rightsNote)
      }
    };
  }
  function normalizeChapters(input) {
    if (!Array.isArray(input)) return [];
    return input.map(function (chapter, index) {
      if (!chapter || typeof chapter !== 'object') return null;
      var body = clean(chapter.text || chapter.content);
      if (!body) return null;
      return { title: clean(chapter.title) || 'Chapter ' + (index + 1), text: body };
    }).filter(Boolean).slice(0, 180);
  }
  function normalizeProfessionalMeta(input) {
    if (!input || typeof input !== 'object') return null;
    var output = {};
    ['brandName', 'genericName', 'indication', 'approvalDate', 'documentType', 'therapeuticArea'].forEach(function (key) {
      var item = clean(input[key]);
      if (item) output[key] = item;
    });
    return Object.keys(output).length ? output : null;
  }
  function normalizeItem(raw, index, existingIds) {
    var errors = [], warnings = [];
    if (!raw || typeof raw !== 'object') return { errors: ['条目不是对象'], warnings: [], raw: raw };
    var title = clean(raw.title);
    var chapters = normalizeChapters(raw.chapters);
    var body = clean(raw.text);
    if (!body && chapters.length) body = chapters.map(function (chapter) { return chapter.title + '\n\n' + chapter.text; }).join('\n\n');
    if (!title) errors.push('缺少 title');
    if (!body) errors.push('缺少 text 或有效 chapters');
    if (body.length > 500000) errors.push('正文超过500,000字符');
    var category = CATEGORIES.indexOf(raw.category) >= 0 ? raw.category : 'Custom';
    if (category !== raw.category) warnings.push('未知 category 已改为 Custom');
    var source = normalizeSource(raw, warnings);
    var assessment = normalizeAssessment(raw.assessment, source.meta, warnings);
    var itemId = clean(raw.id);
    if (!itemId || itemId.indexOf('builtin-') === 0) itemId = uid();
    if (existingIds[itemId]) {
      warnings.push('ID已存在，导入时会生成新ID而不是覆盖旧材料');
      itemId = uid();
    }
    existingIds[itemId] = true;
    var license = clean(raw.license) || (source.meta.reuseStatus === 'public-domain-us-government' ? 'U.S. government source; verify credited third-party material' : 'Personal study');
    var item = {
      id: itemId,
      builtin: false,
      title: title || 'Untitled ' + (index + 1),
      category: category,
      source: source.display,
      license: license,
      tags: unique(Array.isArray(raw.tags) ? raw.tags.map(text) : []),
      text: body,
      folderId: resolveFolder(raw, category, warnings),
      chapters: chapters.length ? chapters : undefined,
      chapterMode: chapters.length ? 'chapters' : 'single',
      materialType: clean(raw.materialType),
      taskPrompt: clean(raw.taskPrompt),
      sourceMeta: source.meta,
      assessment: assessment,
      professionalMeta: normalizeProfessionalMeta(raw.professionalMeta),
      createdAt: raw.createdAt || new Date().toISOString()
    };
    if (!item.materialType) delete item.materialType;
    if (!item.taskPrompt) delete item.taskPrompt;
    if (!item.assessment) delete item.assessment;
    if (!item.professionalMeta) delete item.professionalMeta;
    if (!item.chapters) delete item.chapters;
    return { item: item, errors: errors, warnings: warnings, raw: raw };
  }

  function parseLibraryPayload(data) {
    var rows = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
    var existingIds = {};
    var app = core();
    var current = app && app.getLibrary ? app.getLibrary() : [];
    (current || []).forEach(function (item) { existingIds[item.id] = true; });
    return rows.map(function (raw, index) { return normalizeItem(raw, index, existingIds); });
  }

  function ensurePreflightModal() {
    if (byId('libraryImportPreflightModal')) return;
    var modal = document.createElement('div');
    modal.id = 'libraryImportPreflightModal';
    modal.className = 'modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = [
      '<div class="modal library-schema-modal import-preflight-modal">',
      '<div class="modal-head"><div><span class="section-kicker">IMPORT PREFLIGHT</span><h2>练习库导入预检</h2><p class="modal-helper" id="libraryImportSummary"></p></div><button class="icon-close-button" id="closeLibraryImportPreflight" type="button" aria-label="关闭">×</button></div>',
      '<div class="modal-body"><div class="import-preflight-list" id="libraryImportPreflightList"></div>',
      '<div class="modal-actions"><button class="btn" id="downloadLibraryImportReport" type="button">下载检查报告</button><button class="btn primary" id="confirmLibraryImport" type="button">导入有效材料</button></div></div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
    byId('closeLibraryImportPreflight').addEventListener('click', closePreflight);
    modal.addEventListener('click', function (event) { if (event.target === modal) closePreflight(); });
    byId('confirmLibraryImport').addEventListener('click', function () { commitPendingImport().catch(function (error) { console.error(error); showToast('练习库导入失败'); }); });
    byId('downloadLibraryImportReport').addEventListener('click', function () {
      if (!pendingImport) return;
      downloadJson({ generatedAt: new Date().toISOString(), fileName: pendingImport.fileName, results: pendingImport.results.map(function (result) { return { title: result.item ? result.item.title : '', errors: result.errors, warnings: result.warnings }; }) }, 'writing-assistant-import-report.json');
    });
  }
  function closePreflight() { var modal = byId('libraryImportPreflightModal'); if (modal) modal.classList.remove('show'); pendingImport = null; }
  function renderPreflight(fileName, results) {
    ensurePreflightModal();
    var valid = results.filter(function (result) { return result.errors.length === 0; }).length;
    var warned = results.filter(function (result) { return result.errors.length === 0 && result.warnings.length; }).length;
    var invalid = results.length - valid;
    byId('libraryImportSummary').textContent = '共发现 ' + results.length + ' 份材料 · 可导入 ' + valid + ' · 需要确认 ' + warned + ' · 格式错误 ' + invalid;
    byId('libraryImportPreflightList').innerHTML = results.map(function (result, index) {
      var ok = result.errors.length === 0;
      var title = result.item ? result.item.title : '第 ' + (index + 1) + ' 项';
      var notes = result.errors.map(function (entry) { return '<li class="error">' + escapeHtml(entry) + '</li>'; }).concat(result.warnings.map(function (entry) { return '<li class="warning">' + escapeHtml(entry) + '</li>'; })).join('');
      return '<article class="import-preflight-item ' + (ok ? (result.warnings.length ? 'warning' : 'valid') : 'invalid') + '"><label><input type="checkbox" data-import-selection="' + index + '" ' + (ok ? 'checked' : 'disabled') + ' /><span><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(result.item ? result.item.category + ' · ' + result.item.source : '无法导入') + '</small></span></label>' + (notes ? '<ul>' + notes + '</ul>' : '<p>格式检查通过</p>') + '</article>';
    }).join('');
    byId('confirmLibraryImport').disabled = valid === 0;
    pendingImport = { fileName: fileName, results: results };
    byId('libraryImportPreflightModal').classList.add('show');
  }
  async function commitPendingImport() {
    if (!pendingImport) return;
    var app = core();
    var api = workspace();
    var selected = Array.prototype.map.call(document.querySelectorAll('[data-import-selection]:checked'), function (box) { return Number(box.dataset.importSelection); });
    var accepted = 0;
    for (var i = 0; i < selected.length; i++) {
      var result = pendingImport.results[selected[i]];
      if (!result || result.errors.length) continue;
      var item = result.item;
      if (api && typeof api.prepareImportedItem === 'function') item = api.prepareImportedItem(item, result.raw) || item;
      item.assessment = result.item.assessment;
      item.sourceMeta = result.item.sourceMeta;
      item.professionalMeta = result.item.professionalMeta;
      item.taskPrompt = result.item.taskPrompt;
      item.materialType = result.item.materialType;
      Object.keys(item).forEach(function (key) { if (item[key] == null || item[key] === '') delete item[key]; });
      await app.db.put(app.stores.library, item);
      accepted++;
    }
    closePreflight();
    await app.actions.refreshLibrary();
    var state = app.getState();
    state.activeLab = 'library';
    app.actions.persistNow();
    app.actions.renderAll();
    showToast('已导入 ' + accepted + ' 份材料');
  }
  async function handleLibraryFile(file) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { showToast('练习库JSON请控制在25 MB以内'); return; }
    var data;
    try { data = JSON.parse(await file.text()); }
    catch (error) { showToast('练习库JSON无法解析'); return; }
    var rows = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
    if (!rows) { showToast('JSON中没有找到items数组'); return; }
    renderPreflight(file.name, parseLibraryPayload(data));
  }
  function interceptLibraryImport() {
    var input = byId('libraryFileInput');
    if (!input || input.dataset.schemaV2Bound) return;
    input.dataset.schemaV2Bound = '1';
    input.addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      event.stopImmediatePropagation();
      event.preventDefault();
      input.value = '';
      handleLibraryFile(file).catch(function (error) { console.error(error); showToast('练习库导入失败'); });
    }, true);
  }

  function scoreStatusLabel(status) {
    return ({ official: '官方评分', sourceClaimed: '原网站标注', teacher: '教师评价', userEntered: '用户填写', aiEstimated: 'AI参考估分', unscored: '未评分' })[status] || '未评分';
  }
  function scoreDisplay(score, status) {
    if (score == null || score === '') return '';
    var number = Number(score);
    if (!Number.isFinite(number)) return '';
    return (status === 'aiEstimated' ? '约 ' : '') + number.toFixed(number % 1 ? 1 : 0);
  }
  function assessmentHtml(item) {
    var assessment = item && item.assessment;
    if (!assessment) return item && item.category === 'IELTS' ? '<section class="library-detail-section"><div class="library-detail-heading"><h3>IELTS评分信息</h3><span class="schema-status neutral">未评分</span></div><p>这份材料没有附带评分，仍可正常练习。</p></section>' : '';
    var status = assessment.status || 'unscored';
    var score = scoreDisplay(assessment.overallBand, status);
    var criteria = assessment.criteria || {};
    var labels = [['Task Achievement / Response', criteria.taskResponse], ['Coherence & Cohesion', criteria.coherenceCohesion], ['Lexical Resource', criteria.lexicalResource], ['Grammar Range & Accuracy', criteria.grammaticalRangeAccuracy]];
    var rows = labels.map(function (entry) { return '<div><span>' + escapeHtml(entry[0]) + '</span><strong>' + (entry[1] == null ? '未单独公布' : escapeHtml(entry[1])) + '</strong></div>'; }).join('');
    return '<section class="library-detail-section"><div class="library-detail-heading"><h3>IELTS评分信息</h3><div><span class="schema-status ' + escapeHtml(status) + '">' + escapeHtml(scoreStatusLabel(status)) + '</span>' + (score ? '<strong class="schema-band">Band ' + escapeHtml(score) + '</strong>' : '') + '</div></div><div class="schema-criteria">' + rows + '</div>' + (assessment.examinerComments ? '<div class="schema-comment"><strong>评语</strong><p>' + escapeHtml(assessment.examinerComments).replace(/\n/g, '<br>') + '</p></div>' : '') + (assessment.sourceLabel ? '<p class="schema-note">评分来源：' + escapeHtml(assessment.sourceLabel) + '</p>' : '') + '</section>';
  }
  function professionalHtml(item) {
    var meta = item && item.professionalMeta;
    if (!meta) return '';
    var fields = [['商品名', meta.brandName], ['通用名', meta.genericName], ['批准日期', meta.approvalDate], ['治疗领域', meta.therapeuticArea], ['适应证', meta.indication], ['文档类型', meta.documentType]];
    return '<section class="library-detail-section"><div class="library-detail-heading"><h3>专业资料信息</h3><span class="schema-status official-source">FDA来源</span></div><dl class="professional-meta">' + fields.filter(function (entry) { return entry[1]; }).map(function (entry) { return '<div><dt>' + escapeHtml(entry[0]) + '</dt><dd>' + escapeHtml(entry[1]) + '</dd></div>'; }).join('') + '</dl><p class="schema-note">内容用于语言与专业写作练习，不替代最新处方信息或医疗建议。</p></section>';
  }
  function ensureDetailModal() {
    if (byId('librarySchemaDetailModal')) return;
    var modal = document.createElement('div');
    modal.id = 'librarySchemaDetailModal';
    modal.className = 'modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = '<div class="modal library-schema-modal library-detail-modal"><div class="modal-head"><div><span class="section-kicker">MATERIAL DETAILS</span><h2 id="librarySchemaDetailTitle">材料详情</h2><p class="modal-helper" id="librarySchemaDetailMeta"></p></div><button class="icon-close-button" id="closeLibrarySchemaDetail" type="button" aria-label="关闭">×</button></div><div class="modal-body library-detail-body"><div id="librarySchemaDetailExtra"></div><section class="library-detail-section"><div class="library-detail-heading"><h3>正文与章节</h3><a id="librarySchemaSourceLink" target="_blank" rel="noopener noreferrer" hidden>打开原始来源 ↗</a></div><div class="library-detail-text" id="librarySchemaDetailText"></div></section><div class="library-detail-actions"><button class="btn" id="copyLibraryPackagingPrompt" type="button">复制AI整理提示词</button><button class="btn soft" id="librarySchemaSentence" type="button">句子练习</button><button class="btn primary" id="librarySchemaParagraph" type="button">段落练习</button></div></div></div>';
    document.body.appendChild(modal);
    byId('closeLibrarySchemaDetail').addEventListener('click', closeDetail);
    modal.addEventListener('click', function (event) { if (event.target === modal) closeDetail(); });
    byId('librarySchemaSentence').addEventListener('click', function () { var id = this.dataset.itemId; closeDetail(); if (id) workspace().loadDocumentChapter(id, 'sentence', 0, 0); });
    byId('librarySchemaParagraph').addEventListener('click', function () { var id = this.dataset.itemId; closeDetail(); if (id) workspace().loadDocumentChapter(id, 'paragraph', 0, 0); });
    byId('copyLibraryPackagingPrompt').addEventListener('click', function () {
      var id = this.dataset.itemId;
      var item = id && workspace().getItem(id);
      if (item) copyText(packagingPromptForItem(item), 'AI整理提示词已复制');
    });
  }
  function closeDetail() { var modal = byId('librarySchemaDetailModal'); if (modal) modal.classList.remove('show'); }
  function itemPreviewText(item) {
    if (Array.isArray(item.chapters) && item.chapters.length) return item.chapters.map(function (chapter) { return (chapter.title ? chapter.title + '\n\n' : '') + clean(chapter.text || chapter.content); }).join('\n\n');
    return clean(item.text);
  }
  function openDetail(itemId) {
    var item = workspace().getItem(itemId);
    if (!item) return;
    ensureDetailModal();
    byId('librarySchemaDetailTitle').textContent = item.title || 'Untitled';
    byId('librarySchemaDetailMeta').textContent = [item.category, item.source, item.license].filter(Boolean).join(' · ');
    var prompt = item.taskPrompt ? '<section class="library-detail-section"><div class="library-detail-heading"><h3>题目</h3></div><p class="task-prompt">' + escapeHtml(item.taskPrompt) + '</p></section>' : '';
    byId('librarySchemaDetailExtra').innerHTML = prompt + assessmentHtml(item) + professionalHtml(item);
    byId('librarySchemaDetailText').textContent = itemPreviewText(item);
    var link = byId('librarySchemaSourceLink');
    var url = sourceUrl(item);
    link.hidden = !url;
    if (url) link.href = url; else link.removeAttribute('href');
    ['librarySchemaSentence', 'librarySchemaParagraph', 'copyLibraryPackagingPrompt'].forEach(function (id) { byId(id).dataset.itemId = itemId; });
    byId('librarySchemaDetailModal').classList.add('show');
  }
  function cardItemId(card) {
    var node = card && card.querySelector('[data-workspace-manage], [data-workspace-sentence], [data-workspace-paragraph]');
    return node ? (node.dataset.workspaceManage || node.dataset.workspaceSentence || node.dataset.workspaceParagraph || '') : '';
  }
  function enhanceCards() {
    var grid = byId('libraryGrid');
    if (!grid || !workspace()) return;
    Array.prototype.forEach.call(grid.querySelectorAll('.library-card'), function (card) {
      var itemId = cardItemId(card);
      var row = card.querySelector('.library-card-title-row');
      if (!itemId || !row || row.querySelector('[data-library-schema-detail]')) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'library-schema-detail-button';
      button.dataset.librarySchemaDetail = itemId;
      button.textContent = '详情';
      button.setAttribute('aria-label', '查看材料详情');
      row.appendChild(button);
    });
  }

  function exampleItem(category) {
    if (category === 'Pharmacy') return {
      id: 'fda-example-drug', title: 'FDA Drug Trials Snapshot · Example Drug', category: 'Pharmacy',
      folderPath: ['Pharmacy & Biomedicine', 'Clinical Research'], materialType: 'fda-drug-trials-snapshot',
      sourceMeta: { publisher: 'U.S. Food and Drug Administration', title: 'Drug Trials Snapshot: Example Drug', url: 'https://www.fda.gov/example', accessedAt: '2026-08-01', reuseStatus: 'public-domain-us-government', rightsNote: 'Check separately credited third-party material.' },
      license: 'FDA source · U.S. government work; check separately credited material', tags: ['FDA', 'clinical trial'],
      professionalMeta: { brandName: 'EXAMPLE', genericName: 'examplemab', indication: 'Verified approved indication', approvalDate: '2026-01-01', documentType: 'Drug Trials Snapshot', therapeuticArea: 'clinical research' },
      chapters: [{ title: 'What is the drug for?', text: 'Paste or extract verified FDA text here.' }, { title: 'How were the trials designed?', text: 'Preserve the design and endpoint information from the source.' }],
      text: 'Combined searchable text of all chapters.'
    };
    return {
      id: 'ielts-sample-example', title: 'IELTS Writing Sample · Example', category: 'IELTS', folderPath: ['IELTS Writing', 'Education'], materialType: 'scored-writing-sample',
      taskPrompt: 'Insert the exact writing task.', sourceMeta: { publisher: 'Verified source publisher', title: 'Original source title', url: 'https://example.org/source', accessedAt: '2026-08-01', reuseStatus: 'personal-study-only', rightsNote: 'Check the original source before redistribution.' },
      license: 'Personal study only', tags: ['IELTS', 'writing sample'], text: 'Insert the complete candidate response only when you are authorised to use it locally.',
      assessment: { status: 'unscored', overallBand: null, criteria: { taskResponse: null, coherenceCohesion: null, lexicalResource: null, grammaticalRangeAccuracy: null }, examinerComments: '', sourceLabel: '', sourceUrl: 'https://example.org/source' }
    };
  }
  function schemaDocument() {
    return {
      title: 'Writing Assistant Library Schema v2',
      schemaVersion: 2,
      format: 'writing-assistant-library',
      requiredPerItem: ['title', 'category', 'text or chapters'],
      categories: CATEGORIES,
      assessmentStatuses: SCORE_STATUSES,
      notes: ['Never fabricate official scores or examiner comments.', 'Use null for IELTS criteria not published by the source.', 'Use folderPath for portable semantic folder selection.', 'Only HTTPS source URLs are imported.']
    };
  }
  function packagingPromptForItem(item) {
    var url = sourceUrl(item);
    var category = item.category || 'Custom';
    var requirements = category === 'Pharmacy'
      ? '保留药品商品名、通用名、适应证、批准日期、试验设计、主要疗效、主要风险、人口学信息和原始FDA地址。不得把摘要改写成医疗建议。'
      : '保留原题目、完整写作正文、明确的评分身份、总分、原始考官或教师评语。没有公布的四项小分必须为null。';
    return buildAiPrompt(category, 1, '', url ? '请读取并整理这个来源：' + url : itemPreviewText(item), requirements);
  }
  function buildAiPrompt(category, count, folderPath, material, extra) {
    return [
      '你是 Writing Assistant 练习库资料整理器，不是资料或评分的虚构者。',
      '',
      '请将我提供的资料整理为 Writing Assistant Library Schema v2，并最终生成一个合法的 UTF-8 JSON 文件。顶层结构必须是：',
      '{"schemaVersion":2,"format":"writing-assistant-library","generatedAt":"ISO-8601时间","items":[...]}',
      '',
      '强制规则：',
      '1. 不得虚构文章、来源、URL、作者、分数、考官评语、药品信息、试验结果或许可证。',
      '2. 只有来源明确属于 IELTS 官方且明确给出考官评分时，assessment.status 才能写 official。',
      '3. 原网站自行标注的分数写 sourceClaimed；教师评价写 teacher；AI估分写 aiEstimated。',
      '4. AI估分和AI评语必须明确标成参考信息，不能使用 official 或冒充 examiner。',
      '5. 来源没有公布 IELTS 四项小分时，criteria 中对应字段必须为 null，不得根据总分反推。',
      '6. FDA资料必须保留 professionalMeta：brandName、genericName、indication、approvalDate、documentType、therapeuticArea。',
      '7. 长文按原始标题拆分为 chapters；同时生成 text，内容为各章正文的可搜索合并版本。',
      '8. sourceMeta 必须包含 publisher、title、HTTPS url、accessedAt、reuseStatus、rightsNote。',
      '9. folderPath 使用语义目录名称数组，不要猜网站内部 folderId。',
      '10. 不得输出 HTML、Markdown代码围栏、解释文字、注释、尾随逗号或省略号；只输出标准JSON。',
      '',
      '本次目标：',
      '- 类别：' + category,
      '- 目标数量：' + count,
      '- 目标目录：' + (folderPath || '由内容合理选择'),
      '- 特殊要求：' + (extra || '忠实整理、保留来源身份和版权信息'),
      '',
      '每个 items 条目可使用这些字段：',
      'id, title, category, folderPath, materialType, taskPrompt, sourceMeta, license, tags, text, chapters, assessment, professionalMeta, createdAt。',
      '',
      '需要整理的来源或原始资料：',
      material || '[请在这里粘贴文本、网页地址或说明你上传的文件]'
    ].join('\n');
  }

  function ensureWizard() {
    if (byId('libraryAiWizardModal')) return;
    var modal = document.createElement('div');
    modal.id = 'libraryAiWizardModal';
    modal.className = 'modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = [
      '<div class="modal library-schema-modal ai-library-wizard">',
      '<div class="modal-head"><div><span class="section-kicker">AI LIBRARY BUILDER</span><h2>让AI制作练习库JSON</h2><p class="modal-helper">网站只帮助生成格式约束。AI整理结果仍需核对来源、事实和版权。</p></div><button class="icon-close-button" id="closeLibraryAiWizard" type="button" aria-label="关闭">×</button></div>',
      '<div class="modal-body">',
      '<div class="ai-wizard-grid"><div class="field"><label for="aiLibraryCategory">类别</label><select id="aiLibraryCategory"><option>IELTS</option><option>Pharmacy</option><option>Academic</option><option>Literature</option><option>Custom</option></select></div><div class="field"><label for="aiLibraryCount">数量</label><input class="text-input" id="aiLibraryCount" type="number" min="1" max="200" value="10"></div><div class="field"><label for="aiLibraryFolder">目标目录（可空）</label><input class="text-input" id="aiLibraryFolder" placeholder="例如：IELTS Writing / Official Scored Samples"></div></div>',
      '<div class="field"><label for="aiLibraryExtra">筛选和排版要求</label><textarea class="field-area" id="aiLibraryExtra" placeholder="例如：只使用官方来源；保留完整考官评语；按试验设计、疗效和安全性分章。"></textarea></div>',
      '<div class="field"><label for="aiLibraryMaterial">资料、网页地址或文件说明</label><textarea class="source-input ai-material-input" id="aiLibraryMaterial" placeholder="粘贴来源文字、URL，或说明已向AI上传哪些PDF/DOCX……"></textarea></div>',
      '<div class="ai-official-links"><strong>常用官方入口</strong><div id="aiOfficialSourceLinks"></div></div>',
      '<div class="field"><label for="aiLibraryPrompt">自动生成的提示词</label><textarea class="source-input ai-prompt-output" id="aiLibraryPrompt" readonly></textarea></div>',
      '<div class="modal-actions ai-wizard-actions"><button class="btn" id="downloadLibrarySchema" type="button">下载格式说明</button><button class="btn" id="downloadLibraryExample" type="button">下载示例JSON</button><button class="btn primary" id="copyLibraryAiPrompt" type="button">复制完整提示词</button></div>',
      '</div></div>'
    ].join('');
    document.body.appendChild(modal);
    byId('closeLibraryAiWizard').addEventListener('click', closeWizard);
    modal.addEventListener('click', function (event) { if (event.target === modal) closeWizard(); });
    ['aiLibraryCategory', 'aiLibraryCount', 'aiLibraryFolder', 'aiLibraryExtra', 'aiLibraryMaterial'].forEach(function (id) { byId(id).addEventListener('input', updateWizardPrompt); byId(id).addEventListener('change', updateWizardPrompt); });
    byId('copyLibraryAiPrompt').addEventListener('click', function () { copyText(byId('aiLibraryPrompt').value, '完整提示词已复制'); });
    byId('downloadLibrarySchema').addEventListener('click', function () { downloadJson(schemaDocument(), 'writing-assistant-library-schema-v2.json'); });
    byId('downloadLibraryExample').addEventListener('click', function () { var category = value('aiLibraryCategory') || 'IELTS'; downloadJson({ schemaVersion: 2, format: 'writing-assistant-library', generatedAt: new Date().toISOString(), items: [exampleItem(category)] }, 'writing-assistant-library-v2-example.json'); });
  }
  function closeWizard() { var modal = byId('libraryAiWizardModal'); if (modal) modal.classList.remove('show'); }
  function officialLinksHtml(category) {
    if (category === 'Pharmacy') return '<a href="https://www.fda.gov/drugs/drug-approvals-and-databases/drug-trials-snapshots" target="_blank" rel="noopener noreferrer">FDA Drug Trials Snapshots ↗</a>';
    if (category === 'IELTS') return (window.WRITING_ASSISTANT_OFFICIAL_IELTS_SOURCES || []).map(function (source) { return '<a href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(source.label) + ' ↗</a>'; }).join('');
    return '<span>请优先使用可核验的原始来源或公共领域资料。</span>';
  }
  function updateWizardPrompt() {
    var category = value('aiLibraryCategory') || 'IELTS';
    var count = Math.max(1, Math.min(200, Number(value('aiLibraryCount')) || 1));
    byId('aiOfficialSourceLinks').innerHTML = officialLinksHtml(category);
    byId('aiLibraryPrompt').value = buildAiPrompt(category, count, value('aiLibraryFolder'), value('aiLibraryMaterial'), value('aiLibraryExtra'));
  }
  function openWizard() { ensureWizard(); updateWizardPrompt(); byId('libraryAiWizardModal').classList.add('show'); }
  function injectWizardButtons() {
    var importButton = byId('importLibraryBtn');
    if (importButton && !byId('aiLibraryBuilderBtn')) {
      var button = document.createElement('button');
      button.id = 'aiLibraryBuilderBtn';
      button.type = 'button';
      button.className = 'btn soft';
      button.innerHTML = '<span aria-hidden="true">✦</span> 让AI制作练习库';
      importButton.parentNode.insertBefore(button, importButton);
      button.addEventListener('click', openWizard);
    }
    var menu = byId('dataMenu');
    if (menu && !byId('aiLibraryBuilderMenuBtn')) {
      var action = document.createElement('button');
      action.className = 'menu-action';
      action.id = 'aiLibraryBuilderMenuBtn';
      action.setAttribute('role', 'menuitem');
      action.innerHTML = '<span>✦</span><span><strong>让AI制作练习库</strong><small>复制Schema v2提示词并生成可预检JSON</small></span>';
      var importMenu = byId('importLibraryBtn');
      var divider = menu.querySelector('.menu-divider');
      menu.insertBefore(action, divider || null);
      action.addEventListener('click', openWizard);
    }
  }

  function injectAssessmentFields() {
    var modal = byId('materialModal');
    if (!modal || byId('materialAssessmentDetails')) return;
    var textArea = byId('materialText');
    var field = textArea && textArea.closest('.field');
    if (!field) return;
    var details = document.createElement('details');
    details.id = 'materialAssessmentDetails';
    details.className = 'material-assessment-details';
    details.innerHTML = '<summary>IELTS评分信息（可选）</summary><div class="material-assessment-body"><p>没有评分可以直接保存。只有原始来源明确提供时才选择“官方评分”。</p><div class="ai-wizard-grid"><div class="field"><label for="materialScoreStatus">评分身份</label><select id="materialScoreStatus"><option value="unscored">未评分</option><option value="official">官方评分</option><option value="sourceClaimed">原网站标注</option><option value="teacher">教师评价</option><option value="userEntered">用户填写</option><option value="aiEstimated">AI参考估分</option></select></div><div class="field"><label for="materialOverallBand">总分</label><input class="text-input" id="materialOverallBand" type="number" min="0" max="9" step="0.5"></div></div><div class="schema-criteria-input"><label>Task<input class="text-input" id="materialTaskScore" type="number" min="0" max="9" step="0.5"></label><label>Coherence<input class="text-input" id="materialCoherenceScore" type="number" min="0" max="9" step="0.5"></label><label>Lexical<input class="text-input" id="materialLexicalScore" type="number" min="0" max="9" step="0.5"></label><label>Grammar<input class="text-input" id="materialGrammarScore" type="number" min="0" max="9" step="0.5"></label></div><div class="field"><label for="materialExaminerComments">考官、教师或AI评语</label><textarea class="field-area" id="materialExaminerComments"></textarea></div><div class="field"><label for="materialAssessmentSource">评分来源说明</label><input class="text-input" id="materialAssessmentSource" style="width:100%"></div></div>';
    field.parentNode.insertBefore(details, field);
  }
  function readManualAssessment() {
    if (!byId('materialScoreStatus')) return null;
    var input = {
      status: value('materialScoreStatus') || 'unscored', overallBand: value('materialOverallBand'),
      criteria: { taskResponse: value('materialTaskScore'), coherenceCohesion: value('materialCoherenceScore'), lexicalResource: value('materialLexicalScore'), grammaticalRangeAccuracy: value('materialGrammarScore') },
      examinerComments: value('materialExaminerComments'), sourceLabel: value('materialAssessmentSource')
    };
    return normalizeAssessment(input, {}, []);
  }
  function wrapManualSave() {
    var api = workspace();
    if (!api || assessmentWrapped || typeof api.prepareLibraryItem !== 'function') return;
    var original = api.prepareLibraryItem;
    api.prepareLibraryItem = function (item) {
      var prepared = original(item) || item;
      if (prepared.category === 'Pharmacy' && (!prepared.folderId || prepared.folderId === 'folder-my-custom')) prepared.folderId = 'folder-pharmacy';
      var assessment = readManualAssessment();
      if (assessment) prepared.assessment = assessment;
      else delete prepared.assessment;
      return prepared;
    };
    assessmentWrapped = true;
  }
  function resetManualAssessment() {
    if (!byId('materialScoreStatus')) return;
    byId('materialScoreStatus').value = 'unscored';
    ['materialOverallBand', 'materialTaskScore', 'materialCoherenceScore', 'materialLexicalScore', 'materialGrammarScore', 'materialExaminerComments', 'materialAssessmentSource'].forEach(function (id) {
      if (byId(id)) byId(id).value = '';
    });
    var details = byId('materialAssessmentDetails');
    if (details) details.open = false;
  }
  function watchManualModal() {
    var modal = byId('materialModal');
    if (!modal || modal.dataset.schemaV2Watch) return;
    modal.dataset.schemaV2Watch = '1';
    var wasShown = modal.classList.contains('show');
    new MutationObserver(function () {
      var shown = modal.classList.contains('show');
      if (shown && !wasShown) resetManualAssessment();
      wasShown = shown;
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  function bindGlobalEvents() {
    document.addEventListener('click', function (event) {
      var detail = event.target.closest('[data-library-schema-detail]');
      if (!detail) return;
      event.preventDefault();
      event.stopPropagation();
      openDetail(detail.dataset.librarySchemaDetail);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      closeDetail(); closeWizard(); closePreflight();
    });
  }

  function boot() {
    if (initialized) return;
    if (!document.body || !core() || !workspace()) { window.setTimeout(boot, 50); return; }
    initialized = true;
    ensureCategoryOptions();
    injectWizardButtons();
    interceptLibraryImport();
    injectAssessmentFields();
    wrapManualSave();
    watchManualModal();
    ensureDetailModal();
    bindGlobalEvents();
    enhanceCards();
    var grid = byId('libraryGrid');
    if (grid) {
      observer = new MutationObserver(function () { window.requestAnimationFrame(enhanceCards); });
      observer.observe(grid, { childList: true, subtree: true });
    }
  }

  window.WritingAssistantLibrarySchemaV2 = {
    version: 2,
    buildPrompt: buildAiPrompt,
    parse: parseLibraryPayload,
    schema: schemaDocument,
    openWizard: openWizard
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
