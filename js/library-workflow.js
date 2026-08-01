(function () {
  'use strict';

  var core = window.WritingAssistantCore;
  var workspace = window.WritingAssistantWorkspace;
  var schema = window.WritingAssistantLibrarySchemaV2;
  var initialized = false;
  var batchMode = false;
  var selectedIds = {};
  var renderQueued = false;
  var gridObserver = null;

  function byId(id) { return document.getElementById(id); }
  function text(value) { return String(value == null ? '' : value); }
  function clean(value) { return text(value).trim(); }
  function escapeHtml(value) {
    return text(value).replace(/[&<>'"]/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character];
    });
  }
  function state() { return core.getState(); }
  function libraryState() {
    var appState = state();
    appState.library = appState.library || {};
    appState.library.hiddenBuiltinItemIds = Array.isArray(appState.library.hiddenBuiltinItemIds) ? appState.library.hiddenBuiltinItemIds : [];
    appState.library.builtinFolderOverrides = appState.library.builtinFolderOverrides && typeof appState.library.builtinFolderOverrides === 'object'
      ? appState.library.builtinFolderOverrides : {};
    return appState.library;
  }
  function itemIdFromCard(card) {
    var node = card && card.querySelector('[data-workspace-manage], [data-workspace-sentence], [data-workspace-paragraph]');
    return node ? (node.dataset.workspaceManage || node.dataset.workspaceSentence || node.dataset.workspaceParagraph || '') : '';
  }
  function currentItem(kind) {
    var lab = state()[kind] || {};
    var id = lab.documentId || lab.materialId || '';
    return id && workspace ? workspace.getItem(id) : null;
  }
  function isIelts(item) {
    if (!item) return false;
    if (item.category === 'IELTS') return true;
    if (/^folder-ielts(?:-|$)/.test(text(item.folderId))) return true;
    if (/ielts/i.test(text(item.materialType))) return true;
    return (item.tags || []).some(function (tag) { return /ielts/i.test(text(tag)); });
  }
  function scoreStatusLabel(status) {
    return ({
      official: '官方评分',
      sourceClaimed: '来源标注',
      teacher: '教师评分',
      userEntered: '用户填写',
      aiEstimated: 'AI参考估分',
      unscored: '未评分'
    })[status] || '未评分';
  }
  function scoreValue(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number.toFixed(number % 1 ? 1 : 0) : '—';
  }
  function assessmentContext(item) {
    var assessment = item && item.assessment;
    if (!assessment) return '这份IELTS材料没有附带可核验评分。';
    var criteria = assessment.criteria || {};
    return [
      '材料评分身份：' + scoreStatusLabel(assessment.status),
      '材料总分：' + scoreValue(assessment.overallBand),
      'Task Response：' + scoreValue(criteria.taskResponse),
      'Coherence & Cohesion：' + scoreValue(criteria.coherenceCohesion),
      'Lexical Resource：' + scoreValue(criteria.lexicalResource),
      'Grammatical Range & Accuracy：' + scoreValue(criteria.grammaticalRangeAccuracy),
      assessment.examinerComments ? '材料附带评语：' + assessment.examinerComments : ''
    ].filter(Boolean).join('\n');
  }

  function ensurePackageHub() {
    if (byId('libraryPackageHubModal')) return;
    var modal = document.createElement('div');
    modal.id = 'libraryPackageHubModal';
    modal.className = 'modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = [
      '<div class="modal library-package-hub-modal">',
      '<div class="modal-head"><div><span class="section-kicker">LIBRARY JSON</span><h2>AI与JSON练习库</h2><p class="modal-helper">先让AI按Schema v2整理资料，或直接导入已有JSON。导入前都会进行预检。</p></div><button class="icon-close-button" id="closeLibraryPackageHub" type="button" aria-label="关闭">×</button></div>',
      '<div class="modal-body"><div class="library-package-options">',
      '<button class="library-package-option" id="openAiLibraryBuilder" type="button"><strong>✦ 让AI制作练习库</strong><span>生成严格的Schema v2提示词、格式说明和示例JSON，不会自动上传你的练习。</span></button>',
      '<button class="library-package-option" id="openLibraryJsonImport" type="button"><strong>⇩ 导入练习库JSON</strong><span>选择本地JSON文件，先查看有效材料、警告和错误，再决定导入哪些内容。</span></button>',
      '</div></div></div>'
    ].join('');
    document.body.appendChild(modal);
    byId('closeLibraryPackageHub').addEventListener('click', closePackageHub);
    modal.addEventListener('click', function (event) { if (event.target === modal) closePackageHub(); });
    byId('openAiLibraryBuilder').addEventListener('click', function () {
      closePackageHub();
      if (schema && typeof schema.openWizard === 'function') schema.openWizard();
    });
    byId('openLibraryJsonImport').addEventListener('click', function () {
      closePackageHub();
      var input = byId('libraryFileInput');
      if (input) input.click();
    });
  }
  function openPackageHub() {
    ensurePackageHub();
    byId('libraryPackageHubModal').classList.add('show');
  }
  function closePackageHub() {
    var modal = byId('libraryPackageHubModal');
    if (modal) modal.classList.remove('show');
  }
  function combineLibraryActions() {
    var aiButton = byId('aiLibraryBuilderBtn');
    var importButton = byId('importLibraryBtn');
    if (!aiButton && !byId('libraryPackageHubBtn')) return;
    if (!byId('libraryPackageHubBtn')) {
      var combined = document.createElement('button');
      combined.id = 'libraryPackageHubBtn';
      combined.type = 'button';
      combined.className = 'btn soft library-package-hub-button';
      combined.innerHTML = '<span aria-hidden="true">✦</span> AI / JSON 练习库';
      aiButton.parentNode.insertBefore(combined, aiButton);
      combined.addEventListener('click', openPackageHub);
    }
    if (aiButton) aiButton.hidden = true;
    if (importButton) importButton.hidden = true;
  }

  function ensureBatchModal() {
    if (byId('libraryBatchMoveModal')) return;
    var modal = document.createElement('div');
    modal.id = 'libraryBatchMoveModal';
    modal.className = 'modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = [
      '<div class="modal library-batch-modal">',
      '<div class="modal-head"><div><h2>批量移动材料</h2><p class="modal-helper" id="libraryBatchMoveSummary"></p></div><button class="icon-close-button" id="closeLibraryBatchMove" type="button" aria-label="关闭">×</button></div>',
      '<div class="modal-body"><div class="field"><label for="libraryBatchFolder">目标文件夹</label><select class="library-batch-folder-select" id="libraryBatchFolder"></select></div>',
      '<p class="library-batch-warning">自建材料会更新本地folderId；内置材料只保存当前浏览器中的文件夹覆盖，不修改内置源文件。</p>',
      '<div class="modal-actions"><button class="btn" id="cancelLibraryBatchMove" type="button">取消</button><button class="btn primary" id="confirmLibraryBatchMove" type="button">移动所选材料</button></div></div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
    byId('closeLibraryBatchMove').addEventListener('click', closeBatchMove);
    byId('cancelLibraryBatchMove').addEventListener('click', closeBatchMove);
    modal.addEventListener('click', function (event) { if (event.target === modal) closeBatchMove(); });
    byId('confirmLibraryBatchMove').addEventListener('click', function () {
      confirmBatchMove().catch(function (error) {
        console.error(error);
        core.actions.showToast('批量移动失败');
      });
    });
  }
  function openBatchMove() {
    var items = selectedItems();
    if (!items.length) return;
    ensureBatchModal();
    var folders = workspace.getFolders().filter(function (folder) { return folder.id !== 'folder-all'; });
    byId('libraryBatchFolder').innerHTML = folders.map(function (folder) {
      return '<option value="' + escapeHtml(folder.id) + '">' + escapeHtml(folder.name) + '</option>';
    }).join('');
    var selectedFolder = state().library && state().library.selectedFolderId;
    if (folders.some(function (folder) { return folder.id === selectedFolder; })) byId('libraryBatchFolder').value = selectedFolder;
    byId('libraryBatchMoveSummary').textContent = '已选择 ' + items.length + ' 份材料';
    byId('libraryBatchMoveModal').classList.add('show');
  }
  function closeBatchMove() {
    var modal = byId('libraryBatchMoveModal');
    if (modal) modal.classList.remove('show');
  }
  async function confirmBatchMove() {
    var targetFolder = byId('libraryBatchFolder').value || 'folder-my-custom';
    var items = selectedItems();
    var preferences = libraryState();
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.builtin) {
        preferences.builtinFolderOverrides[item.id] = targetFolder;
      } else {
        var stored = await core.db.get(core.stores.library, item.id);
        if (!stored) continue;
        stored.folderId = targetFolder;
        stored.updatedAt = new Date().toISOString();
        await core.db.put(core.stores.library, stored);
      }
    }
    core.actions.persistNow();
    closeBatchMove();
    clearBatchSelection(true);
    await core.actions.refreshLibrary();
    core.actions.showToast('已移动 ' + items.length + ' 份材料');
  }

  function ensureBatchToolbar() {
    var grid = byId('libraryGrid');
    if (!grid || byId('libraryBatchToolbar')) return;
    var bar = document.createElement('div');
    bar.id = 'libraryBatchToolbar';
    bar.className = 'library-batch-toolbar';
    bar.innerHTML = [
      '<span class="library-batch-summary" id="libraryBatchSummary">可批量选择材料移动或删除</span>',
      '<button class="btn small" id="libraryBatchModeBtn" type="button">多选管理</button>',
      '<button class="btn small" id="restoreBuiltinMaterialsBtn" type="button" hidden>恢复内置材料</button>',
      '<button class="btn small" data-batch-active-only id="selectVisibleMaterialsBtn" type="button">选择当前页</button>',
      '<button class="btn small" data-batch-active-only id="moveSelectedMaterialsBtn" type="button" disabled>移动</button>',
      '<button class="btn small danger" data-batch-active-only id="deleteSelectedMaterialsBtn" type="button" disabled>删除</button>',
      '<button class="btn small" data-batch-active-only id="cancelBatchMaterialsBtn" type="button">完成</button>'
    ].join('');
    grid.parentNode.insertBefore(bar, grid);
    byId('libraryBatchModeBtn').addEventListener('click', function () { batchMode = true; updateBatchUi(); });
    byId('selectVisibleMaterialsBtn').addEventListener('click', selectVisibleMaterials);
    byId('moveSelectedMaterialsBtn').addEventListener('click', openBatchMove);
    byId('deleteSelectedMaterialsBtn').addEventListener('click', function () {
      deleteSelectedMaterials().catch(function (error) {
        console.error(error);
        core.actions.showToast('批量删除失败');
      });
    });
    byId('cancelBatchMaterialsBtn').addEventListener('click', function () { clearBatchSelection(true); });
    byId('restoreBuiltinMaterialsBtn').addEventListener('click', function () {
      restoreBuiltinMaterials().catch(function (error) {
        console.error(error);
        core.actions.showToast('恢复内置材料失败');
      });
    });
  }
  function selectedItems() {
    return Object.keys(selectedIds).map(function (id) { return workspace.getItem(id); }).filter(Boolean);
  }
  function visibleCardIds() {
    return Array.prototype.map.call(document.querySelectorAll('#libraryGrid .library-card'), itemIdFromCard).filter(Boolean);
  }
  function selectVisibleMaterials() {
    visibleCardIds().forEach(function (id) { selectedIds[id] = true; });
    updateBatchUi();
  }
  function clearBatchSelection(exitMode) {
    selectedIds = {};
    if (exitMode) batchMode = false;
    updateBatchUi();
  }
  function clearLabUsingDocument(kind, itemId) {
    var appState = state();
    var current = appState[kind];
    if (!current || (current.documentId !== itemId && current.materialId !== itemId)) return;
    if (kind === 'sentence') {
      appState.sentence = {
        materialId: '', title: '', text: '', source: '', license: '', tags: [],
        splitMode: current.splitMode || 'sentence',
        targetWords: Number(current.targetWords) || 45,
        segments: [], answers: [], notes: [], current: 0,
        mode: current.mode || 'imitate'
      };
    } else {
      appState.paragraph = {
        materialId: '', title: '', text: '', source: '', license: '', tags: [],
        paragraphs: [], records: [], current: 0,
        mode: current.mode || 'breakdown'
      };
    }
  }
  async function deleteSelectedMaterials() {
    var items = selectedItems();
    if (!items.length) return;
    var customCount = items.filter(function (item) { return !item.builtin; }).length;
    var builtinCount = items.length - customCount;
    var message = '删除所选 ' + items.length + ' 份材料？\n\n';
    if (customCount) message += '自建材料 ' + customCount + ' 份：将删除正文、章节及其保存的练习进度，无法撤销。\n';
    if (builtinCount) message += '内置材料 ' + builtinCount + ' 份：只从当前浏览器练习库隐藏，源文件和练习进度保留，可使用“恢复内置材料”重新显示。\n';
    message += '\nAI配置、API Key和其他材料不会被删除。';
    if (!window.confirm(message)) return;

    var preferences = libraryState();
    var progress = customCount ? await core.db.getAll(core.stores.progress) : [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.builtin) {
        if (preferences.hiddenBuiltinItemIds.indexOf(item.id) < 0) preferences.hiddenBuiltinItemIds.push(item.id);
      } else {
        await core.db.delete(core.stores.library, item.id);
        for (var p = 0; p < progress.length; p++) {
          if (progress[p].documentId === item.id) await core.db.delete(core.stores.progress, progress[p].id);
        }
        clearLabUsingDocument('sentence', item.id);
        clearLabUsingDocument('paragraph', item.id);
      }
    }
    core.actions.persistNow();
    clearBatchSelection(true);
    await core.actions.refreshLibrary();
    core.actions.renderAll();
    core.actions.showToast('所选材料已处理');
  }
  async function restoreBuiltinMaterials() {
    var preferences = libraryState();
    var count = preferences.hiddenBuiltinItemIds.length;
    if (!count) return;
    preferences.hiddenBuiltinItemIds = [];
    core.actions.persistNow();
    await core.actions.refreshLibrary();
    core.actions.showToast('已恢复 ' + count + ' 份内置材料');
  }
  function enhanceCards() {
    var grid = byId('libraryGrid');
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll('.library-card'), function (card) {
      var itemId = itemIdFromCard(card);
      if (!itemId) return;
      var label = card.querySelector('.library-batch-check');
      if (!label) {
        label = document.createElement('label');
        label.className = 'library-batch-check';
        label.title = '选择材料';
        label.innerHTML = '<input type="checkbox" aria-label="选择材料">';
        card.appendChild(label);
        label.querySelector('input').addEventListener('change', function () {
          if (this.checked) selectedIds[itemId] = true;
          else delete selectedIds[itemId];
          updateBatchUi();
        });
      }
      var input = label.querySelector('input');
      input.checked = Boolean(selectedIds[itemId]);
      card.classList.toggle('library-batch-mode', batchMode);
      card.classList.toggle('library-batch-selected', Boolean(selectedIds[itemId]));
    });
  }
  function updateBatchUi() {
    ensureBatchToolbar();
    var bar = byId('libraryBatchToolbar');
    if (!bar) return;
    var count = Object.keys(selectedIds).length;
    var hiddenCount = libraryState().hiddenBuiltinItemIds.length;
    bar.classList.toggle('active', batchMode);
    byId('libraryBatchModeBtn').hidden = batchMode;
    byId('libraryBatchSummary').textContent = batchMode
      ? '已选择 ' + count + ' 份材料'
      : '可批量选择材料移动或删除';
    byId('moveSelectedMaterialsBtn').disabled = count === 0;
    byId('deleteSelectedMaterialsBtn').disabled = count === 0;
    byId('restoreBuiltinMaterialsBtn').hidden = hiddenCount === 0 || batchMode;
    if (hiddenCount) byId('restoreBuiltinMaterialsBtn').textContent = '恢复内置材料（' + hiddenCount + '）';
    enhanceCards();
  }

  function renderIeltsScore(kind) {
    var coach = byId(kind + 'Coach');
    if (!coach) return;
    var section = byId('ieltsReferenceScore-' + kind);
    var item = currentItem(kind);
    if (!isIelts(item)) {
      if (section) section.remove();
      return;
    }
    if (!section) {
      section = document.createElement('div');
      section.id = 'ieltsReferenceScore-' + kind;
      section.className = 'right-section ielts-reference-score';
      var aiSection = byId('aiSection-' + kind);
      if (aiSection) coach.insertBefore(section, aiSection);
      else coach.appendChild(section);
    }
    var assessment = item.assessment || null;
    var criteria = assessment && assessment.criteria ? assessment.criteria : {};
    var status = assessment ? scoreStatusLabel(assessment.status) : '未附带评分';
    section.innerHTML = [
      '<div class="ielts-score-head"><h3>IELTS参考评分</h3><span class="chip neutral">' + escapeHtml(status) + '</span></div>',
      assessment
        ? '<div class="ielts-score-overall"><strong>Band ' + escapeHtml(scoreValue(assessment.overallBand)) + '</strong><span>材料整体参考</span></div>'
        : '<div class="analysis-empty">这份材料没有附带评分。站内AI解析可对参考段落给出明确标注的模拟评分。</div>',
      assessment ? '<div class="ielts-score-grid">' +
        '<div><span>Task Response</span><strong>' + escapeHtml(scoreValue(criteria.taskResponse)) + '</strong></div>' +
        '<div><span>Coherence & Cohesion</span><strong>' + escapeHtml(scoreValue(criteria.coherenceCohesion)) + '</strong></div>' +
        '<div><span>Lexical Resource</span><strong>' + escapeHtml(scoreValue(criteria.lexicalResource)) + '</strong></div>' +
        '<div><span>Grammar Range & Accuracy</span><strong>' + escapeHtml(scoreValue(criteria.grammaticalRangeAccuracy)) + '</strong></div>' +
        '</div>' : '',
      '<p class="ielts-score-note">这里展示的是参考材料的评分信息。站内AI仍只读取参考原文，不读取你的仿写、笔记或进度；段落级模拟评分不等于官方整篇成绩。</p>'
    ].join('');
  }
  function renderIeltsScores() {
    renderIeltsScore('sentence');
    renderIeltsScore('paragraph');
  }

  function sentencePrompt(indices, item) {
    var current = state().sentence;
    var intro = current.mode === 'copy'
      ? '比较参考原文与我的精准跟写，指出拼写、遗漏、大小写和标点问题；不要改写参考原文。'
      : '根据参考原文检查我的英语仿写，先诊断逻辑、语法、搭配和自然度，尽量保留我的原意。';
    var parts = [
      'Writing Assistant · IELTS Sentence Lab · 外部AI反馈材料',
      '请用简体中文反馈。',
      intro,
      '这是IELTS材料。请额外说明我的句子会如何影响Task Response、Coherence & Cohesion、Lexical Resource、Grammatical Range & Accuracy。',
      '不要仅凭一个句子给整篇作文Band分；只说明评分维度中的优点、风险和可执行改进。',
      item.taskPrompt ? 'IELTS写作题目：\n' + item.taskPrompt : '',
      '参考材料评分背景：\n' + assessmentContext(item),
      ''
    ].filter(Boolean);
    indices.forEach(function (index, order) {
      parts.push(
        '--- 练习 ' + (order + 1) + '（原单元 ' + (index + 1) + '）---',
        '参考原文 Original:',
        current.segments[index] || '',
        '',
        '我的写作 My writing:',
        clean(current.answers[index])
      );
      var note = clean(current.notes[index]);
      if (note) parts.push('', '我的笔记 My analysis note:', note);
      parts.push('');
    });
    return parts.join('\n').trim();
  }
  function paragraphWriting(record, mode) {
    if (mode === 'guided') return ['claim', 'reason', 'mechanism', 'example', 'qualification', 'conclusion'].map(function (key) { return record.guided[key] || ''; }).join(' ').trim();
    if (mode === 'transfer') return record.transfer.writing || '';
    if (mode === 'independent') return record.independent.writing || '';
    return record.breakdownNote || '';
  }
  function paragraphBlock(index) {
    var paragraph = state().paragraph;
    var record = paragraph.records[index] || { roles: [], guided: {}, transfer: {}, independent: {} };
    record.guided = record.guided || {};
    record.transfer = record.transfer || {};
    record.independent = record.independent || {};
    var source = paragraph.paragraphs[index] || '';
    var parts = [
      '--- 段落 ' + (index + 1) + ' ---',
      '参考段落 Original paragraph:',
      source,
      ''
    ];
    if (paragraph.mode === 'breakdown') {
      parts.push('我的逐句功能标注 My sentence-function labels:');
      core.helpers.sentenceSplit(source).forEach(function (sentence, sentenceIndex) {
        parts.push((sentenceIndex + 1) + '. [' + core.actions.roleLabel((record.roles || [])[sentenceIndex]) + '] ' + sentence);
      });
      parts.push('', '我的段落分析 My paragraph analysis:', record.breakdownNote || '');
    } else if (paragraph.mode === 'guided') {
      parts.push('我的段落计划 My paragraph plan:');
      ['claim', 'reason', 'mechanism', 'example', 'qualification', 'conclusion'].forEach(function (key) {
        parts.push(key + ': ' + (record.guided[key] || ''));
      });
      parts.push('', '组合草稿 Combined draft:', paragraphWriting(record, 'guided'));
    } else if (paragraph.mode === 'transfer') {
      parts.push(
        '新主题 New topic:', record.transfer.topic || '',
        '',
        '我的段落 My paragraph:', record.transfer.writing || ''
      );
    } else {
      parts.push(
        '写作任务 Writing task:', record.independent.prompt || '',
        '',
        '我的段落 My paragraph:', record.independent.writing || ''
      );
    }
    return parts.join('\n');
  }
  function paragraphPrompt(indices, item) {
    var paragraph = state().paragraph;
    return [
      'Writing Assistant · IELTS Paragraph Lab · 外部AI反馈材料',
      '当前模式：' + ({ breakdown: '段落拆解', guided: '引导式搭建', transfer: '骨架迁移', independent: '独立段落' }[paragraph.mode] || paragraph.mode),
      '请用简体中文反馈，先指出问题及原因，再给出修改方向，不要一开始就整段重写。',
      item.taskPrompt ? 'IELTS写作题目：\n' + item.taskPrompt : '',
      '参考材料评分背景：\n' + assessmentContext(item),
      'IELTS专项要求：',
      '1. 如果当前内容包含我的英文成稿，请分别给出Task Response、Coherence & Cohesion、Lexical Resource、Grammatical Range & Accuracy的段落级模拟分，并给出综合参考分。',
      '2. 每项分数必须引用可观察证据；明确说明这是段落级模拟，不是官方整篇作文成绩。',
      '3. 如果当前模式只有功能标注或中文分析、没有英文成稿，不要强行给我的写作打分；改为检查分析是否准确，并说明参考段落体现了哪些评分特征。',
      '4. 不得照抄材料原有分数，也不得把AI模拟分冒充考官评分。',
      '',
      indices.map(paragraphBlock).join('\n\n')
    ].filter(Boolean).join('\n').trim();
  }
  function interceptIeltsCopy(event) {
    var button = event.target.closest('#copySentenceCurrentBtn, #copySentenceAllBtn, #copyParagraphCurrentBtn, #copyParagraphAllBtn');
    if (!button) return;
    var sentence = /^copySentence/.test(button.id);
    var kind = sentence ? 'sentence' : 'paragraph';
    var item = currentItem(kind);
    if (!isIelts(item)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    core.actions.commitVisibleFields();
    var content;
    if (sentence) {
      var sentenceState = state().sentence;
      var sentenceIndices = button.id === 'copySentenceCurrentBtn'
        ? [sentenceState.current]
        : sentenceState.segments.map(function (_, index) { return index; });
      content = sentencePrompt(sentenceIndices, item);
    } else {
      var paragraphState = state().paragraph;
      var paragraphIndices = button.id === 'copyParagraphCurrentBtn'
        ? [paragraphState.current]
        : paragraphState.paragraphs.map(function (_, index) { return index; });
      content = paragraphPrompt(paragraphIndices, item);
    }
    core.actions.copyText(content, 'IELTS专用AI反馈材料已复制');
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    window.requestAnimationFrame(function () {
      renderQueued = false;
      combineLibraryActions();
      ensureBatchToolbar();
      updateBatchUi();
      renderIeltsScores();
    });
  }
  function bind() {
    document.addEventListener('click', interceptIeltsCopy, true);
    document.addEventListener('click', function () { window.setTimeout(scheduleRender, 0); });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      closePackageHub();
      closeBatchMove();
    });
    var grid = byId('libraryGrid');
    if (grid) {
      gridObserver = new MutationObserver(scheduleRender);
      gridObserver.observe(grid, { childList: true, subtree: true });
    }
    new MutationObserver(scheduleRender).observe(document.body, { attributes: true, attributeFilter: ['data-lab-active'] });
  }
  function boot() {
    if (initialized) return;
    core = window.WritingAssistantCore;
    workspace = window.WritingAssistantWorkspace;
    schema = window.WritingAssistantLibrarySchemaV2;
    if (!document.body || !core || !workspace || !schema) {
      window.setTimeout(boot, 50);
      return;
    }
    initialized = true;
    libraryState();
    ensurePackageHub();
    ensureBatchModal();
    bind();
    scheduleRender();
  }

  window.WritingAssistantLibraryWorkflow = {
    version: '0.8.2-r1-library-workflow-v1',
    isIelts: isIelts,
    openPackageHub: openPackageHub
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
