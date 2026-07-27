(function () {
  'use strict';

  var core = window.WritingAssistantCore;
  if (!core) return;

  var h = core.helpers;
  var db = core.db;
  var actions = core.actions;
  var stores = core.stores;
  var BATCH_SIZE = 45;
  var customFolders = [];
  var libraryCache = [];
  var initialized = false;
  var rendering = false;
  var currentMoveItemId = '';
  var currentEditFolderId = '';
  var currentManageItemId = '';

  var SYSTEM_FOLDERS = [
    { id: 'folder-all', name: '全部材料', parentId: '', icon: '⌂', system: true, order: 0 },
    { id: 'folder-ielts', name: 'IELTS Writing', parentId: 'folder-all', icon: 'I', system: true, order: 10 },
    { id: 'folder-ielts-education', name: 'Education', parentId: 'folder-ielts', icon: '•', system: true, order: 11 },
    { id: 'folder-ielts-technology', name: 'Technology', parentId: 'folder-ielts', icon: '•', system: true, order: 12 },
    { id: 'folder-ielts-healthcare', name: 'Healthcare', parentId: 'folder-ielts', icon: '•', system: true, order: 13 },
    { id: 'folder-ielts-environment', name: 'Environment', parentId: 'folder-ielts', icon: '•', system: true, order: 14 },
    { id: 'folder-ielts-work', name: 'Work & Economy', parentId: 'folder-ielts', icon: '•', system: true, order: 15 },
    { id: 'folder-ielts-society', name: 'Society & Government', parentId: 'folder-ielts', icon: '•', system: true, order: 16 },

    { id: 'folder-academic', name: 'Academic Writing', parentId: 'folder-all', icon: 'A', system: true, order: 20 },
    { id: 'folder-academic-introduction', name: 'Introduction', parentId: 'folder-academic', icon: '•', system: true, order: 21 },
    { id: 'folder-academic-methods', name: 'Methods', parentId: 'folder-academic', icon: '•', system: true, order: 22 },
    { id: 'folder-academic-results', name: 'Results', parentId: 'folder-academic', icon: '•', system: true, order: 23 },
    { id: 'folder-academic-discussion', name: 'Discussion', parentId: 'folder-academic', icon: '•', system: true, order: 24 },
    { id: 'folder-academic-limitations', name: 'Limitations', parentId: 'folder-academic', icon: '•', system: true, order: 25 },

    { id: 'folder-pharmacy', name: 'Pharmacy & Biomedicine', parentId: 'folder-all', icon: 'P', system: true, order: 30 },
    { id: 'folder-pharmacy-hiv', name: 'HIV', parentId: 'folder-pharmacy', icon: '•', system: true, order: 31 },
    { id: 'folder-pharmacy-drug-development', name: 'Drug Development', parentId: 'folder-pharmacy', icon: '•', system: true, order: 32 },
    { id: 'folder-pharmacy-pharmacology', name: 'Pharmacology', parentId: 'folder-pharmacy', icon: '•', system: true, order: 33 },
    { id: 'folder-pharmacy-clinical', name: 'Clinical Research', parentId: 'folder-pharmacy', icon: '•', system: true, order: 34 },
    { id: 'folder-pharmacy-public-health', name: 'Public Health', parentId: 'folder-pharmacy', icon: '•', system: true, order: 35 },

    { id: 'folder-literature', name: 'Literature', parentId: 'folder-all', icon: 'L', system: true, order: 40 },
    { id: 'folder-literature-novels', name: 'Novels', parentId: 'folder-literature', icon: '•', system: true, order: 41 },
    { id: 'folder-literature-essays', name: 'Essays', parentId: 'folder-literature', icon: '•', system: true, order: 42 },
    { id: 'folder-literature-speeches', name: 'Speeches', parentId: 'folder-literature', icon: '•', system: true, order: 43 },
    { id: 'folder-literature-description', name: 'Descriptive Writing', parentId: 'folder-literature', icon: '•', system: true, order: 44 },

    { id: 'folder-my-library', name: 'My Library', parentId: 'folder-all', icon: 'M', system: true, order: 50 },
    { id: 'folder-my-books', name: 'Imported Books', parentId: 'folder-my-library', icon: '•', system: true, order: 51 },
    { id: 'folder-my-papers', name: 'Imported Papers', parentId: 'folder-my-library', icon: '•', system: true, order: 52 },
    { id: 'folder-my-custom', name: 'Custom Materials', parentId: 'folder-my-library', icon: '•', system: true, order: 53 }
  ];

  var BUILTIN_FOLDER_MAP = {
    'builtin-ielts-ai-learning': 'folder-ielts-technology',
    'builtin-ielts-health': 'folder-ielts-healthcare',
    'builtin-academic-hiv': 'folder-pharmacy-hiv',
    'builtin-academic-limitations': 'folder-academic-limitations',
    'builtin-literature-reflection': 'folder-literature-description',
    'builtin-public-domain-austen': 'folder-literature-novels'
  };

  function state() { return core.getState(); }
  function byId(id) { return h.byId(id); }
  function all(selector) { return h.all(selector); }
  function folderList() { return SYSTEM_FOLDERS.concat(customFolders).slice().sort(function (a, b) { return Number(a.order || 0) - Number(b.order || 0) || String(a.name).localeCompare(String(b.name)); }); }
  function folderById(id) { return folderList().find(function (folder) { return folder.id === id; }) || null; }
  function childrenOf(parentId) { return folderList().filter(function (folder) { return folder.parentId === parentId; }); }
  function isSystemFolder(id) { var folder = folderById(id); return Boolean(folder && folder.system); }
  function defaultFolderForCategory(category) {
    if (category === 'IELTS') return 'folder-ielts';
    if (category === 'Academic') return 'folder-academic';
    if (category === 'Literature') return 'folder-literature';
    return 'folder-my-custom';
  }
  function itemFolderId(item) { return item.folderId || BUILTIN_FOLDER_MAP[item.id] || defaultFolderForCategory(item.category); }

  function titleOverrides() {
    var appState = state();
    appState.library = appState.library || {};
    appState.library.titleOverrides = appState.library.titleOverrides || {};
    return appState.library.titleOverrides;
  }
  function displayedItem(item) {
    var copy = Object.assign({}, item || {});
    copy._originalTitle = String(item && (item._originalTitle || item.title) || 'Untitled');
    if (copy.builtin && titleOverrides()[copy.id]) copy.title = titleOverrides()[copy.id];
    return copy;
  }
  function displayedItems(items) { return (items || []).map(displayedItem); }
  function getLibraryItem(id) { return libraryCache.find(function (item) { return item.id === id; }) || null; }
  async function syncDocumentTitle(documentId, title) {
    var appState = state();
    ['sentence', 'paragraph'].forEach(function (lab) {
      var current = appState[lab];
      if (current && (current.documentId === documentId || current.materialId === documentId)) {
        current.title = title;
        current.documentTitle = title;
      }
    });
    var records = await db.getAll(stores.progress);
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      if (record.documentId !== documentId || !record.snapshot) continue;
      record.snapshot.title = title;
      record.snapshot.documentTitle = title;
      record.updatedAt = new Date().toISOString();
      await db.put(stores.progress, record);
    }
    actions.persistNow();
    actions.renderAll();
  }
  var currentTitleItemId = '';
  function openTitleModal(itemId) {
    var item = getLibraryItem(itemId);
    if (!item) return;
    currentTitleItemId = itemId;
    byId('workspaceTitleInput').value = item.title || '';
    byId('workspaceTitleOriginal').textContent = item._originalTitle || item.title || '';
    byId('restoreWorkspaceTitleBtn').hidden = !item.builtin || !(titleOverrides()[item.id]);
    byId('workspaceTitleModal').classList.add('show');
    window.setTimeout(function () { byId('workspaceTitleInput').focus(); byId('workspaceTitleInput').select(); }, 0);
  }
  function closeTitleModal() { byId('workspaceTitleModal').classList.remove('show'); currentTitleItemId = ''; }
  async function saveCardTitle() {
    var item = getLibraryItem(currentTitleItemId);
    if (!item) return;
    var title = String(byId('workspaceTitleInput').value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!title) { actions.showToast('标题不能为空'); return; }
    if (item.builtin) {
      if (title === item._originalTitle) delete titleOverrides()[item.id];
      else titleOverrides()[item.id] = title;
      actions.persistNow();
    } else {
      var stored = await db.get(stores.library, item.id);
      if (!stored) { actions.showToast('没有找到本地材料'); return; }
      stored.title = title;
      stored.updatedAt = new Date().toISOString();
      await db.put(stores.library, stored);
    }
    await syncDocumentTitle(item.id, title);
    closeTitleModal();
    await actions.refreshLibrary();
    actions.showToast('卡片标题已更新');
  }
  async function restoreCardTitle() {
    var item = getLibraryItem(currentTitleItemId);
    if (!item || !item.builtin) return;
    var original = item._originalTitle || item.title;
    delete titleOverrides()[item.id];
    actions.persistNow();
    await syncDocumentTitle(item.id, original);
    closeTitleModal();
    await actions.refreshLibrary();
    actions.showToast('已恢复默认标题');
  }

  function ensureManageModal() {
    if (byId('workspaceManageModal')) return;
    var modal = document.createElement('div');
    modal.id = 'workspaceManageModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = '<div class="modal compact-modal library-manage-modal"><div class="modal-head"><div><h2>管理材料</h2><p class="modal-helper" id="workspaceManageSubtitle"></p></div><button class="icon-close-button" id="closeWorkspaceManageModal" type="button" aria-label="关闭">×</button></div><div class="modal-body"><div class="library-manage-actions"><button class="library-manage-action" id="workspaceManageTitleBtn" type="button"><strong>修改标题</strong><span>只改变卡片显示名称</span></button><button class="library-manage-action" id="workspaceManageEditBtn" type="button"><strong>编辑文档</strong><span>调整章节、正文和顺序</span></button><button class="library-manage-action" id="workspaceManageMoveBtn" type="button"><strong>移动到文件夹</strong><span>改变本地练习库中的归类</span></button><button class="library-manage-action danger" id="workspaceManageDeleteBtn" type="button"><strong>删除材料</strong><span>同时删除该材料保存的章节进度</span></button></div><p class="library-manage-note" id="workspaceManageNote"></p></div></div>';
    document.body.appendChild(modal);
  }

  function closeManageModal() {
    closeModal('workspaceManageModal');
    currentManageItemId = '';
  }

  function openManageModal(itemId) {
    var item = getLibraryItem(itemId);
    if (!item) return;
    ensureManageModal();
    currentManageItemId = itemId;
    var editableDocument = !item.builtin && (Array.isArray(item.chapters) || item.importMeta);
    byId('workspaceManageSubtitle').textContent = item.title || 'Untitled';
    byId('workspaceManageEditBtn').hidden = !editableDocument;
    byId('workspaceManageMoveBtn').hidden = Boolean(item.builtin);
    byId('workspaceManageDeleteBtn').hidden = Boolean(item.builtin);
    byId('workspaceManageNote').textContent = item.builtin
      ? '这是内置练习材料，不能删除或移动；你仍然可以修改本机显示的标题。'
      : '这些操作只影响当前浏览器中的本地材料。删除操作无法撤销。';
    showModal('workspaceManageModal');
  }

  function clearLabUsingDocument(lab, documentId) {
    var appState = state();
    var current = appState[lab];
    if (!current || (current.documentId !== documentId && current.materialId !== documentId)) return false;
    if (lab === 'sentence') {
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
    return true;
  }

  function clearLabsUsingDocument(documentId) {
    return ['sentence', 'paragraph'].filter(function (lab) {
      return clearLabUsingDocument(lab, documentId);
    });
  }

  async function deleteLibraryItem(itemId) {
    var item = getLibraryItem(itemId);
    if (!item || item.builtin) {
      actions.showToast('内置练习材料不能删除');
      return;
    }
    var title = item.title || 'Untitled';
    if (!window.confirm('删除《' + title + '》？\n\n将同时删除该材料的全部章节和已保存练习进度。此操作无法撤销。')) return;
    try {
      await db.delete(stores.library, itemId);
      var progress = await db.getAll(stores.progress);
      for (var i = 0; i < progress.length; i++) {
        if (progress[i].documentId === itemId) await db.delete(stores.progress, progress[i].id);
      }
      if (state().library && state().library.titleOverrides) delete state().library.titleOverrides[itemId];
      var clearedLabs = clearLabsUsingDocument(itemId);
      actions.persistNow();
      closeManageModal();
      await actions.refreshLibrary();
      actions.renderAll();
      actions.showToast(clearedLabs.length ? '材料、章节进度和当前练习已删除' : '材料及章节进度已删除');
    } catch (error) {
      console.error(error);
      actions.showToast('材料删除失败，请稍后重试');
    }
  }

  function descendantsOf(id) {
    var found = [];
    function walk(parent) {
      childrenOf(parent).forEach(function (child) { found.push(child.id); walk(child.id); });
    }
    walk(id);
    return found;
  }

  function collapsedFolderIds() {
    if (!state().library) state().library = { selectedFolderId: 'folder-all', collapsedFolderIds: [] };
    if (!Array.isArray(state().library.collapsedFolderIds)) state().library.collapsedFolderIds = [];
    return state().library.collapsedFolderIds;
  }

  function isFolderCollapsed(id) {
    return collapsedFolderIds().indexOf(id) >= 0;
  }

  function setFolderCollapsed(id, collapsed) {
    var ids = collapsedFolderIds().filter(function (value) { return value !== id; });
    if (collapsed) ids.push(id);
    state().library.collapsedFolderIds = ids;
    actions.persistNow();
  }

  function revealFolderPath(id, includeSelf) {
    var pathIds = folderPath(id).map(function (folder) { return folder.id; });
    if (includeSelf === false) pathIds = pathIds.slice(0, -1);
    if (!pathIds.length) return;
    state().library.collapsedFolderIds = collapsedFolderIds().filter(function (value) { return pathIds.indexOf(value) < 0; });
  }

  function selectFolderInLibrary(id, reveal) {
    if (!folderById(id)) id = 'folder-all';
    if (reveal !== false) revealFolderPath(id, false);
    state().library.selectedFolderId = id;
    actions.persistNow();
    renderLibrary();
  }

  function folderToggleMarkup(folder, expanded) {
    var hasChildren = childrenOf(folder.id).length > 0;
    if (!hasChildren) return '<span class="folder-tree-toggle-spacer" aria-hidden="true"></span>';
    return '<button class="folder-tree-toggle" data-folder-toggle="' + h.escapeHtml(folder.id) + '" type="button" aria-label="' + (expanded ? '收起' : '展开') + h.escapeHtml(folder.name) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.8 5 5.2-5 5.2"/></svg></button>';
  }

  function folderMaterialCount(id, includeDescendants) {
    var accepted = [id];
    if (includeDescendants) accepted = accepted.concat(descendantsOf(id));
    return libraryCache.filter(function (item) {
      return accepted.indexOf(itemFolderId(item)) >= 0;
    }).length;
  }

  function folderChildCount(id) {
    return childrenOf(id).length;
  }

  function folderPath(id) {
    var result = [];
    var current = folderById(id);
    var guard = 0;
    while (current && guard < 20) {
      result.unshift(current);
      current = current.parentId ? folderById(current.parentId) : null;
      guard++;
    }
    return result;
  }

  function normaliseChapter(raw, item, index) {
    var text = h.normalizeSpace(raw && raw.text || raw && raw.content || '');
    return {
      id: String(raw && raw.id || item.id + '-chapter-' + (index + 1)),
      title: String(raw && raw.title || 'Chapter ' + (index + 1)),
      text: text,
      order: index
    };
  }

  function headingMatch(line) {
    var value = String(line || '').trim();
    var markdown = value.match(/^#{1,4}\s+(.{1,120})$/);
    if (markdown) return markdown[1].trim();
    var chapter = value.match(/^(chapter|part|book|section)\s+([0-9ivxlcdm]+)(?:\s*[:.\-–—]\s*|\s+)?(.*)$/i);
    if (chapter) return (chapter[1] + ' ' + chapter[2] + (chapter[3] ? ' · ' + chapter[3].trim() : '')).trim();
    return '';
  }

  function chunkLongText(text, title) {
    var paragraphs = String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n+/).map(h.normalizeSpace).filter(Boolean);
    if (paragraphs.length < 70 && h.wordCount(text) < 6500) return [{ title: title || 'Full text', text: h.normalizeSpace(text) }];
    var chunks = [];
    var bucket = [];
    var words = 0;
    paragraphs.forEach(function (paragraph) {
      var count = h.wordCount(paragraph);
      if (bucket.length && (bucket.length >= 45 || words + count > 5000)) {
        chunks.push({ title: 'Part ' + (chunks.length + 1), text: bucket.join('\n\n') });
        bucket = [];
        words = 0;
      }
      bucket.push(paragraph);
      words += count;
    });
    if (bucket.length) chunks.push({ title: 'Part ' + (chunks.length + 1), text: bucket.join('\n\n') });
    return chunks;
  }

  function parseChapters(item, mode) {
    if (Array.isArray(item.chapters) && item.chapters.length) {
      return item.chapters.map(function (chapter, index) { return normaliseChapter(chapter, item, index); }).filter(function (chapter) { return chapter.text; });
    }
    var text = String(item.text || '');
    if (mode === 'single') return [normaliseChapter({ title: item.title || 'Full text', text: text }, item, 0)];
    var lines = text.replace(/\r\n/g, '\n').split('\n');
    var headings = [];
    lines.forEach(function (line, index) { var title = headingMatch(line); if (title) headings.push({ index: index, title: title }); });
    if (headings.length >= 2) {
      var chapters = [];
      headings.forEach(function (heading, index) {
        var end = index + 1 < headings.length ? headings[index + 1].index : lines.length;
        var content = lines.slice(heading.index + 1, end).join('\n').trim();
        if (content) chapters.push({ title: heading.title, text: content });
      });
      if (chapters.length) return chapters.map(function (chapter, index) { return normaliseChapter(chapter, item, index); });
    }
    return chunkLongText(text, item.title).map(function (chapter, index) { return normaliseChapter(chapter, item, index); });
  }

  function getItemChapters(item) { return parseChapters(item, item.chapterMode || 'auto'); }
  function progressId(lab, documentId, chapterId) { return ['progress', lab, documentId, chapterId].join(':'); }
  function currentUnitArray(lab) { return lab === 'sentence' ? state().sentence.segments : state().paragraph.paragraphs; }
  function currentLabState(lab) { return lab === 'sentence' ? state().sentence : state().paragraph; }

  function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
  function snapshotFor(lab) {
    var current = currentLabState(lab);
    if (!current || !current.documentId || !current.chapterId) return null;
    return deepClone(current);
  }

  async function saveLabProgress(lab) {
    if (state().activeLab === lab) actions.commitVisibleFields();
    var snapshot = snapshotFor(lab);
    if (!snapshot) return;
    await db.put(stores.progress, {
      id: progressId(lab, snapshot.documentId, snapshot.chapterId),
      lab: lab,
      documentId: snapshot.documentId,
      chapterId: snapshot.chapterId,
      chapterIndex: snapshot.chapterIndex || 0,
      snapshot: snapshot,
      updatedAt: new Date().toISOString()
    });
  }

  async function saveCurrentProgress() {
    var active = state().activeLab;
    if (active === 'sentence' || active === 'paragraph') await saveLabProgress(active);
  }

  function chapterMetadata(item, chapter, chapterIndex, chapterCount, batchIndex) {
    return {
      materialId: item.id,
      documentId: item.id,
      documentTitle: item.title,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterIndex: chapterIndex,
      chapterCount: chapterCount,
      batchSize: BATCH_SIZE,
      batchIndex: Math.max(0, Number(batchIndex) || 0)
    };
  }

  async function loadDocumentChapter(documentId, lab, chapterIndex, batchIndex, options) {
    options = options || {};
    if (!options.skipSave) await saveLabProgress(lab);
    var item = libraryCache.find(function (entry) { return entry.id === documentId; });
    if (!item) { actions.showToast('没有找到这份材料'); return; }
    var chapters = getItemChapters(item);
    if (!chapters.length) { actions.showToast('这份材料没有可练习的正文'); return; }
    chapterIndex = h.clamp(Number(chapterIndex) || 0, 0, chapters.length - 1);
    var chapter = chapters[chapterIndex];
    var record = await db.get(stores.progress, progressId(lab, item.id, chapter.id));
    var previous = currentLabState(lab);
    var next;
    if (record && record.snapshot) {
      next = record.snapshot;
    } else if (lab === 'sentence') {
      var splitMode = previous.splitMode || 'sentence';
      var targetWords = previous.targetWords || 45;
      var segments = h.splitSentenceMaterial(chapter.text, splitMode, targetWords).filter(function (value) { return h.wordCount(value) > 0; }).slice(0, 1200);
      next = Object.assign({
        title: item.title,
        text: chapter.text,
        source: item.source || '',
        license: item.license || '',
        tags: item.tags || [],
        splitMode: splitMode,
        targetWords: targetWords,
        segments: segments,
        answers: new Array(segments.length).fill(''),
        notes: new Array(segments.length).fill(''),
        current: 0,
        mode: previous.mode || 'imitate'
      }, chapterMetadata(item, chapter, chapterIndex, chapters.length, batchIndex));
    } else {
      var paragraphs = h.paragraphSplit(chapter.text).filter(function (value) { return h.wordCount(value) > 0; }).slice(0, 600);
      next = Object.assign({
        title: item.title,
        text: chapter.text,
        source: item.source || '',
        license: item.license || '',
        tags: item.tags || [],
        paragraphs: paragraphs,
        records: paragraphs.map(h.emptyParagraphRecord),
        current: 0,
        mode: previous.mode || 'breakdown'
      }, chapterMetadata(item, chapter, chapterIndex, chapters.length, batchIndex));
    }
    next = Object.assign(next, chapterMetadata(item, chapter, chapterIndex, chapters.length, batchIndex));
    var units = lab === 'sentence' ? next.segments : next.paragraphs;
    var maxBatch = Math.max(0, Math.ceil(units.length / BATCH_SIZE) - 1);
    next.batchIndex = h.clamp(Number(batchIndex != null ? batchIndex : next.batchIndex) || 0, 0, maxBatch);
    var start = next.batchIndex * BATCH_SIZE;
    var end = Math.min(units.length - 1, start + BATCH_SIZE - 1);
    if (next.current < start || next.current > end) next.current = start;
    if (lab === 'sentence') state().sentence = next; else state().paragraph = next;
    state().activeLab = lab;
    actions.persistNow();
    actions.renderAll();
    await saveLabProgress(lab);
    actions.showToast('已打开：' + chapter.title);
  }

  function batchRange(lab) {
    var current = currentLabState(lab);
    var units = currentUnitArray(lab) || [];
    var count = Math.max(1, Number(current.batchSize) || BATCH_SIZE);
    var maxBatch = Math.max(0, Math.ceil(units.length / count) - 1);
    current.batchIndex = h.clamp(Number(current.batchIndex) || 0, 0, maxBatch);
    var start = current.batchIndex * count;
    return { start: start, end: Math.min(units.length - 1, start + count - 1), total: units.length, batchIndex: current.batchIndex, batchCount: maxBatch + 1 };
  }

  function unitStarted(lab, index) {
    if (lab === 'sentence') return Boolean(String(state().sentence.answers[index] || '').trim() || String(state().sentence.notes[index] || '').trim());
    var record = state().paragraph.records[index];
    return record ? actions.paragraphRecordStarted(record) : false;
  }

  function unitDone(lab, index) {
    if (lab === 'sentence') return actions.sentenceDone(index);
    var record = state().paragraph.records[index];
    return record ? actions.paragraphRecordDone(record) : false;
  }

  function batchStats(lab) {
    var range = batchRange(lab);
    var started = 0;
    var done = 0;
    for (var i = range.start; i <= range.end; i++) {
      if (unitStarted(lab, i)) started++;
      if (unitDone(lab, i)) done++;
    }
    return { range: range, started: started, done: done, size: Math.max(0, range.end - range.start + 1) };
  }

  function ensureDocumentNavigator() {
    var left = document.querySelector('.left-panel');
    var progress = byId('progressWrap');
    if (!left || !progress) return null;
    var nav = byId('documentNavigator');
    if (!nav) {
      nav = document.createElement('div');
      nav.id = 'documentNavigator';
      nav.className = 'document-navigator';
      progress.parentNode.insertBefore(nav, progress);
    }
    return nav;
  }

  function renderDocumentNavigator(lab) {
    var nav = ensureDocumentNavigator();
    if (!nav) return;
    var current = currentLabState(lab);
    if (!current || !current.documentId) { nav.hidden = true; return; }
    var item = libraryCache.find(function (entry) { return entry.id === current.documentId; });
    if (!item) { nav.hidden = true; return; }
    var chapters = getItemChapters(item);
    var range = batchRange(lab);
    nav.hidden = false;
    var chapterOptions = chapters.map(function (chapter, index) {
      return '<option value="' + index + '"' + (index === Number(current.chapterIndex || 0) ? ' selected' : '') + '>' + h.escapeHtml(chapter.title) + '</option>';
    }).join('');
    var batchButtons = [];
    for (var i = 0; i < range.batchCount; i++) {
      var batchStart = i * BATCH_SIZE + 1;
      var batchEnd = Math.min(range.total, (i + 1) * BATCH_SIZE);
      batchButtons.push('<button class="batch-chip' + (i === range.batchIndex ? ' active' : '') + '" data-batch-index="' + i + '">第 ' + (i + 1) + ' 批<small>' + batchStart + '–' + batchEnd + '</small></button>');
    }
    nav.innerHTML = [
      '<div class="document-nav-title"><span>当前文档</span><strong>' + h.escapeHtml(item.title) + '</strong></div>',
      '<label class="document-nav-label">章节<select id="chapterNavigatorSelect">' + chapterOptions + '</select></label>',
      '<div class="batch-strip">' + batchButtons.join('') + '</div>'
    ].join('');
    byId('chapterNavigatorSelect').addEventListener('change', function () {
      loadDocumentChapter(item.id, lab, Number(this.value), 0).catch(function () { actions.showToast('章节切换失败'); });
    });
    all('[data-batch-index]').forEach(function (button) {
      button.addEventListener('click', function () {
        actions.commitVisibleFields();
        current.batchIndex = Number(this.dataset.batchIndex) || 0;
        current.current = current.batchIndex * BATCH_SIZE;
        actions.persistNow();
        actions.renderAll();
      });
    });
  }

  function renderBatchUnitList(lab) {
    var list = byId('unitList');
    if (!list) return;
    var current = currentLabState(lab);
    var units = currentUnitArray(lab);
    if (!current || !current.documentId || !units || !units.length) return;
    var range = batchRange(lab);
    list.innerHTML = '';
    for (var index = range.start; index <= range.end; index++) {
      (function (unitIndex) {
        var button = document.createElement('button');
        var started = unitStarted(lab, unitIndex);
        var done = unitDone(lab, unitIndex);
        button.className = 'unit-item' + (unitIndex === current.current ? ' active' : '');
        button.innerHTML = '<span class="unit-num">' + (unitIndex + 1) + '</span><span class="unit-preview">' + h.escapeHtml(units[unitIndex] || '') + '</span><span class="unit-state ' + (done ? 'done' : started ? 'started' : '') + '"></span>';
        button.addEventListener('click', function () {
          actions.commitVisibleFields();
          current.current = unitIndex;
          actions.scheduleSave();
          actions.renderAll();
          if (lab === 'sentence' && byId('sentenceWriter')) byId('sentenceWriter').focus();
        });
        list.appendChild(button);
      })(index);
    }
    var stats = batchStats(lab);
    byId('progressBar').style.width = stats.size ? Math.round(stats.started / stats.size * 100) + '%' : '0%';
    byId('progressText').textContent = '第 ' + (range.batchIndex + 1) + ' / ' + range.batchCount + ' 批 · ' + stats.started + ' / ' + stats.size + ' 已练习 · ' + stats.done + ' 完成';
    var chapterLabel = current.chapterTitle || 'Chapter ' + (Number(current.chapterIndex || 0) + 1);
    byId('sourceInfo').textContent = chapterLabel + ' · 第 ' + (range.batchIndex + 1) + ' 批 · 单元 ' + (range.start + 1) + '–' + (range.end + 1);
    if (lab === 'sentence') byId('sentenceUnitLabel').textContent = chapterLabel + ' · Batch ' + (range.batchIndex + 1) + ' · Practice ' + (current.current + 1) + ' / ' + range.total;
    else byId('paragraphUnitLabel').textContent = chapterLabel + ' · Batch ' + (range.batchIndex + 1) + ' · Paragraph ' + (current.current + 1) + ' / ' + range.total;
    updateNavigationButtons(lab, itemHasAdjacentChapter(current.documentId, current.chapterIndex, -1), itemHasAdjacentChapter(current.documentId, current.chapterIndex, 1));
  }

  function itemHasAdjacentChapter(documentId, chapterIndex, delta) {
    var item = libraryCache.find(function (entry) { return entry.id === documentId; });
    if (!item) return false;
    var next = Number(chapterIndex || 0) + delta;
    return next >= 0 && next < getItemChapters(item).length;
  }

  function updateNavigationButtons(lab, hasPreviousChapter, hasNextChapter) {
    var current = currentLabState(lab);
    var range = batchRange(lab);
    var prev = byId(lab === 'sentence' ? 'sentencePrevBtn' : 'paragraphPrevBtn');
    var next = byId(lab === 'sentence' ? 'sentenceNextBtn' : 'paragraphNextBtn');
    if (prev) prev.disabled = !(current.current > 0 || range.batchIndex > 0 || hasPreviousChapter);
    if (next) next.disabled = !(current.current < range.total - 1 || hasNextChapter);
    if (next) next.textContent = current.current === range.end && (range.batchIndex < range.batchCount - 1 || hasNextChapter) ? '完成本批次 →' : (lab === 'sentence' ? '下一单元 →' : '下一段 →');
  }

  function injectModals() {
    if (!byId('workspaceFolderModal')) {
      var folderModal = document.createElement('div');
      folderModal.id = 'workspaceFolderModal';
      folderModal.className = 'modal-backdrop';
      folderModal.innerHTML = '<div class="modal compact-modal"><div class="modal-head"><h2 id="workspaceFolderModalTitle">新建文件夹</h2><button class="btn small" id="closeWorkspaceFolderModal">关闭</button></div><div class="modal-body"><div class="field"><label for="workspaceFolderName">文件夹名称</label><input class="text-input" id="workspaceFolderName" style="width:100%" maxlength="60" /></div><div class="field"><label for="workspaceFolderParent">上级文件夹</label><select id="workspaceFolderParent" style="width:100%"></select></div><div class="modal-actions"><button class="btn primary" id="saveWorkspaceFolder">保存文件夹</button></div></div></div>';
      document.body.appendChild(folderModal);
    }
    if (!byId('workspaceMoveModal')) {
      var moveModal = document.createElement('div');
      moveModal.id = 'workspaceMoveModal';
      moveModal.className = 'modal-backdrop';
      moveModal.innerHTML = '<div class="modal compact-modal"><div class="modal-head"><h2>移动材料</h2><button class="btn small" id="closeWorkspaceMoveModal">关闭</button></div><div class="modal-body"><div class="field"><label for="workspaceMoveFolder">目标文件夹</label><select id="workspaceMoveFolder" style="width:100%"></select></div><div class="modal-actions"><button class="btn primary" id="confirmWorkspaceMove">移动</button></div></div></div>';
      document.body.appendChild(moveModal);
    }
    if (!byId('batchCompletionModal')) {
      var batchModal = document.createElement('div');
      batchModal.id = 'batchCompletionModal';
      batchModal.className = 'modal-backdrop';
      batchModal.innerHTML = '<div class="modal compact-modal"><div class="modal-head"><h2>本批次练习</h2><button class="btn small" id="closeBatchCompletionModal">留在当前批次</button></div><div class="modal-body"><div class="batch-completion-summary" id="batchCompletionSummary"></div><div class="modal-actions"><button class="btn" id="goNextBatchBtn">继续下一批</button><button class="btn primary" id="goNextChapterBtn">进入下一章</button></div></div></div>';
      document.body.appendChild(batchModal);
    }
    ensureManageModal();
  }

  function ensureTitleModal() {
    if (byId('workspaceTitleModal')) return;
    var modal = document.createElement('div');
    modal.id = 'workspaceTitleModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = '<div class="modal compact-modal title-edit-modal"><div class="modal-head"><div><h2>修改卡片标题</h2><p class="modal-helper">只修改显示名称，不会改变材料、章节或练习进度。</p></div><button class="icon-close-button" id="closeWorkspaceTitleModal" type="button" aria-label="关闭">×</button></div><div class="modal-body"><div class="field title-edit-field"><label for="workspaceTitleInput">新标题</label><input class="text-input" id="workspaceTitleInput" style="width:100%" maxlength="160" /></div><div class="title-original-note"><span>原始标题</span><strong id="workspaceTitleOriginal"></strong></div><div class="modal-actions title-edit-actions"><button class="btn quiet" id="restoreWorkspaceTitleBtn" type="button">恢复默认标题</button><button class="btn primary" id="saveWorkspaceTitleBtn" type="button">保存修改</button></div></div></div>';
    document.body.appendChild(modal);
  }

  function closeModal(id) { var modal = byId(id); if (modal) modal.classList.remove('show'); }
  function showModal(id) { var modal = byId(id); if (modal) modal.classList.add('show'); }

  function folderSelectOptions(selectedId, includeSystemLeaves, excludedId) {
    var folders = folderList().filter(function (folder) {
      if (folder.id === 'folder-all' || folder.id === excludedId) return false;
      if (excludedId && descendantsOf(excludedId).indexOf(folder.id) >= 0) return false;
      return includeSystemLeaves || !folder.system || folder.id === 'folder-my-library' || folder.parentId === 'folder-all';
    });
    return folders.map(function (folder) {
      var depth = Math.max(0, folderPath(folder.id).length - 2);
      return '<option value="' + h.escapeHtml(folder.id) + '"' + (folder.id === selectedId ? ' selected' : '') + '>' + Array(depth + 1).join('　') + h.escapeHtml(folder.name) + '</option>';
    }).join('');
  }

  function openFolderModal(folderId) {
    currentEditFolderId = folderId || '';
    var folder = folderId ? folderById(folderId) : null;
    byId('workspaceFolderModalTitle').textContent = folder ? '重命名文件夹' : '新建文件夹';
    byId('workspaceFolderName').value = folder ? folder.name : '';
    var selectedParent = folder ? folder.parentId : (state().library.selectedFolderId === 'folder-all' ? 'folder-my-library' : state().library.selectedFolderId);
    byId('workspaceFolderParent').innerHTML = folderSelectOptions(selectedParent, true, folderId);
    byId('workspaceFolderParent').disabled = Boolean(folder);
    showModal('workspaceFolderModal');
    setTimeout(function () { byId('workspaceFolderName').focus(); }, 20);
  }

  async function saveFolder() {
    var name = String(byId('workspaceFolderName').value || '').trim();
    if (!name) { actions.showToast('请填写文件夹名称'); return; }
    if (currentEditFolderId) {
      var existing = folderById(currentEditFolderId);
      if (!existing || existing.system) return;
      existing.name = name;
      existing.updatedAt = new Date().toISOString();
      await db.put(stores.folders, existing);
    } else {
      var parentId = byId('workspaceFolderParent').value || 'folder-my-library';
      var folder = { id: 'folder-custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), name: name, parentId: parentId, icon: '•', system: false, order: Date.now(), createdAt: new Date().toISOString() };
      await db.put(stores.folders, folder);
      revealFolderPath(parentId, true);
      state().library.selectedFolderId = folder.id;
      actions.persistNow();
    }
    customFolders = await db.getAll(stores.folders);
    closeModal('workspaceFolderModal');
    renderLibrary();
    actions.showToast('文件夹已保存');
  }

  async function deleteFolder(folderId) {
    var folder = folderById(folderId);
    if (!folder || folder.system) return;
    if (!window.confirm('删除文件夹后，其中的材料和子文件夹会移动到上一级，是否继续？')) return;
    var parent = folder.parentId || 'folder-my-library';
    var customItems = await db.getAll(stores.library);
    for (var i = 0; i < customItems.length; i++) {
      if (customItems[i].folderId === folderId) { customItems[i].folderId = parent; await db.put(stores.library, customItems[i]); }
    }
    var children = customFolders.filter(function (entry) { return entry.parentId === folderId; });
    for (var j = 0; j < children.length; j++) { children[j].parentId = parent; await db.put(stores.folders, children[j]); }
    await db.delete(stores.folders, folderId);
    customFolders = await db.getAll(stores.folders);
    state().library.collapsedFolderIds = collapsedFolderIds().filter(function (value) { return value !== folderId; });
    if (state().library.selectedFolderId === folderId) state().library.selectedFolderId = parent;
    revealFolderPath(parent, false);
    actions.persistNow();
    await actions.refreshLibrary();
    actions.showToast('文件夹已删除');
  }

  function openMoveModal(itemId) {
    currentMoveItemId = itemId;
    var item = libraryCache.find(function (entry) { return entry.id === itemId; });
    byId('workspaceMoveFolder').innerHTML = folderSelectOptions(item ? itemFolderId(item) : 'folder-my-custom', true, '');
    showModal('workspaceMoveModal');
  }

  async function confirmMoveItem() {
    var item = await db.get(stores.library, currentMoveItemId);
    if (!item) { actions.showToast('只能移动自建材料'); return; }
    item.folderId = byId('workspaceMoveFolder').value || 'folder-my-custom';
    await db.put(stores.library, item);
    closeModal('workspaceMoveModal');
    await actions.refreshLibrary();
    actions.showToast('材料已移动');
  }

  function ensureLibraryLayout() {
    var view = byId('libraryView');
    var toolbar = document.querySelector('.library-toolbar');
    var grid = byId('libraryGrid');
    if (!view || !toolbar || !grid) return;
    if (!byId('newVirtualFolderBtn')) {
      var heroControls = view.querySelector('.library-hero .controls');
      var button = document.createElement('button');
      button.className = 'btn';
      button.id = 'newVirtualFolderBtn';
      button.textContent = '新建文件夹';
      heroControls.insertBefore(button, heroControls.firstChild);
      button.addEventListener('click', function () { openFolderModal(''); });
    }
    if (byId('libraryBrowserLayout')) return;
    var layout = document.createElement('div');
    layout.id = 'libraryBrowserLayout';
    layout.className = 'library-browser-layout';
    var sidebar = document.createElement('aside');
    sidebar.className = 'folder-sidebar';
    sidebar.innerHTML = '<div class="folder-sidebar-head"><strong>练习库目录</strong><span>本地虚拟文件夹</span></div><div id="folderTree" class="folder-tree"></div>';
    var content = document.createElement('div');
    content.className = 'library-folder-content';
    var breadcrumb = document.createElement('div');
    breadcrumb.id = 'libraryBreadcrumb';
    breadcrumb.className = 'library-breadcrumb';
    var childGrid = document.createElement('div');
    childGrid.id = 'childFolderGrid';
    childGrid.className = 'child-folder-grid';
    toolbar.parentNode.insertBefore(layout, toolbar);
    layout.appendChild(sidebar);
    layout.appendChild(content);
    content.appendChild(breadcrumb);
    content.appendChild(toolbar);
    content.appendChild(childGrid);
    content.appendChild(grid);
    if (byId('libraryCategory')) byId('libraryCategory').style.display = 'none';
  }

  function renderFolderTree() {
    var tree = byId('folderTree');
    if (!tree) return;
    tree.innerHTML = '';

    function appendFolderRow(folder, depth, isRoot) {
      var hasChildren = childrenOf(folder.id).length > 0;
      var expanded = hasChildren && !isFolderCollapsed(folder.id);
      var row = document.createElement('div');
      row.className = 'folder-tree-row' + (isRoot ? ' root' : '') + (state().library.selectedFolderId === folder.id ? ' active' : '') + (hasChildren ? ' has-children' : ' leaf') + (expanded ? ' expanded' : ' collapsed');
      row.style.setProperty('--folder-depth', depth);
      var count = folder.id === 'folder-all' ? libraryCache.length : folderMaterialCount(folder.id, true);
      row.innerHTML = folderToggleMarkup(folder, expanded) + '<button class="folder-tree-main" data-folder-open="' + h.escapeHtml(folder.id) + '" type="button"><span class="folder-tree-icon">' + h.escapeHtml(folder.icon || '•') + '</span><span>' + h.escapeHtml(folder.name) + '</span><small>' + count + '</small></button>' + (!folder.system ? '<button class="folder-tree-more" data-folder-edit="' + h.escapeHtml(folder.id) + '" type="button" title="重命名">•••</button>' : '');
      tree.appendChild(row);
      return expanded;
    }

    function renderChildren(parentId, depth) {
      childrenOf(parentId).forEach(function (folder) {
        var expanded = appendFolderRow(folder, depth, false);
        if (expanded) renderChildren(folder.id, depth + 1);
      });
    }

    var root = folderById('folder-all');
    var rootExpanded = appendFolderRow(root, 0, true);
    if (rootExpanded) renderChildren('folder-all', 1);

    all('[data-folder-toggle]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        var id = this.dataset.folderToggle;
        setFolderCollapsed(id, !isFolderCollapsed(id));
        renderFolderTree();
      });
    });
    all('[data-folder-open]').forEach(function (button) {
      button.addEventListener('click', function () { selectFolderInLibrary(this.dataset.folderOpen, true); });
    });
    all('[data-folder-edit]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        var id = this.dataset.folderEdit;
        var action = window.prompt('输入 R 重命名，输入 D 删除此文件夹：', 'R');
        if (!action) return;
        if (action.toLowerCase() === 'd') deleteFolder(id).catch(function () { actions.showToast('文件夹删除失败'); });
        else openFolderModal(id);
      });
    });
  }

  function renderBreadcrumb() {
    var selected = folderById(state().library.selectedFolderId) || folderById('folder-all');
    var path = folderPath(selected.id);
    var container = byId('libraryBreadcrumb');
    container.innerHTML = path.map(function (folder, index) {
      return '<button data-breadcrumb-folder="' + h.escapeHtml(folder.id) + '">' + h.escapeHtml(folder.name) + '</button>' + (index < path.length - 1 ? '<span>›</span>' : '');
    }).join('');
    if (!selected.system) container.innerHTML += '<button class="breadcrumb-danger" data-delete-current-folder="' + h.escapeHtml(selected.id) + '">删除文件夹</button>';
    all('[data-breadcrumb-folder]').forEach(function (button) { button.addEventListener('click', function () { selectFolderInLibrary(this.dataset.breadcrumbFolder, true); }); });
    all('[data-delete-current-folder]').forEach(function (button) { button.addEventListener('click', function () { deleteFolder(this.dataset.deleteCurrentFolder).catch(function () { actions.showToast('文件夹删除失败'); }); }); });
  }

  function renderChildFolders() {
    var selectedId = state().library.selectedFolderId || 'folder-all';
    var container = byId('childFolderGrid');
    var query = String(byId('librarySearch').value || '').trim();
    if (query) { container.innerHTML = ''; return; }
    var folders = childrenOf(selectedId);
    container.innerHTML = folders.map(function (folder) {
      var totalMaterials = folderMaterialCount(folder.id, true);
      var childFolders = folderChildCount(folder.id);
      return '<button class="folder-tile" data-child-folder="' + h.escapeHtml(folder.id) + '"><span class="folder-tile-icon">' + h.escapeHtml(folder.icon || '•') + '</span><span><strong>' + h.escapeHtml(folder.name) + '</strong><small>' + totalMaterials + ' 份材料' + (childFolders ? ' · ' + childFolders + ' 个子文件夹' : '') + '</small></span><span>→</span></button>';
    }).join('');
    all('[data-child-folder]').forEach(function (button) { button.addEventListener('click', function () { selectFolderInLibrary(this.dataset.childFolder, true); }); });
  }

  function renderCards(items) {
    var grid = byId('libraryGrid');
    grid.innerHTML = '';
    if (!items.length) { grid.innerHTML = '<div class="analysis-empty library-empty-folder">这个文件夹目前没有材料。你可以添加本地材料，或进入子文件夹。</div>'; return; }
    items.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'library-card';
      var tags = (item.tags || []).slice(0, 5).map(function (tag) { return '<span class="chip">' + h.escapeHtml(tag) + '</span>'; }).join('');
      var chapters = getItemChapters(item);
      var importChip = item.importMeta && item.importMeta.format ? '<span class="chip neutral">' + h.escapeHtml(String(item.importMeta.format).toUpperCase()) + '</span>' : '';
      var editableDocument = !item.builtin && (Array.isArray(item.chapters) || item.importMeta);
      card.innerHTML = '<button class="card-manage-button" data-workspace-manage="' + h.escapeHtml(item.id) + '" title="管理材料" aria-label="管理材料"><span aria-hidden="true">•••</span></button><div class="library-card-title-row"><h3>' + h.escapeHtml(item.title) + '</h3></div><div class="library-meta">' + h.escapeHtml(item.category) + ' · ' + h.escapeHtml(item.source || 'Unknown source') + '<br />' + h.escapeHtml(item.license || 'Personal study') + '</div><div class="chips library-card-chips">' + tags + importChip + '<span class="chip neutral">' + chapters.length + ' 章</span></div><div class="library-preview">' + h.escapeHtml(item.text) + '</div><div class="library-actions"><button class="btn small soft" data-workspace-sentence="' + h.escapeHtml(item.id) + '">句子练习</button><button class="btn small primary" data-workspace-paragraph="' + h.escapeHtml(item.id) + '">段落练习</button></div>';
      grid.appendChild(card);
    });
    all('[data-workspace-sentence]').forEach(function (button) { button.addEventListener('click', function () { loadDocumentChapter(this.dataset.workspaceSentence, 'sentence', 0, 0).catch(function () { actions.showToast('材料载入失败'); }); }); });
    all('[data-workspace-paragraph]').forEach(function (button) { button.addEventListener('click', function () { loadDocumentChapter(this.dataset.workspaceParagraph, 'paragraph', 0, 0).catch(function () { actions.showToast('材料载入失败'); }); }); });
    all('[data-workspace-manage]').forEach(function (button) {
      button.addEventListener('click', function () { openManageModal(this.dataset.workspaceManage); });
    });
  }

  function renderLibrary() {
    if (rendering || !byId('libraryGrid')) return true;
    rendering = true;
    try {
      ensureLibraryLayout();
      if (!state().library) state().library = { selectedFolderId: 'folder-all', collapsedFolderIds: [] };
      if (!Array.isArray(state().library.collapsedFolderIds)) state().library.collapsedFolderIds = [];
      if (!folderById(state().library.selectedFolderId)) state().library.selectedFolderId = 'folder-all';
      renderFolderTree();
      renderBreadcrumb();
      renderChildFolders();
      var query = String(byId('librarySearch').value || '').trim().toLowerCase();
      var selectedId = state().library.selectedFolderId || 'folder-all';
      var items = libraryCache.filter(function (item) {
        var hay = [item.title, item.category, item.source, item.license, (item.tags || []).join(' '), item.text].join(' ').toLowerCase();
        if (query) return hay.indexOf(query) >= 0;
        if (selectedId === 'folder-all') return true;
        var acceptedFolderIds = [selectedId].concat(descendantsOf(selectedId));
        return acceptedFolderIds.indexOf(itemFolderId(item)) >= 0;
      });
      byId('libraryCount').textContent = items.length + ' items';
      renderCards(items);
    } finally { rendering = false; }
    return true;
  }

  function ensureMaterialFields() {
    var modalBody = byId('materialModal') && byId('materialModal').querySelector('.modal-body');
    if (!modalBody || byId('materialFolderSelect')) return;
    var tagsField = byId('materialTags').closest('.field');
    var row = document.createElement('div');
    row.className = 'split-row workspace-material-fields';
    row.innerHTML = '<div class="field"><label for="materialFolderSelect">保存到文件夹</label><select id="materialFolderSelect" style="width:100%"></select></div><div class="field"><label for="materialChapterMode">章节识别</label><select id="materialChapterMode" style="width:100%"><option value="auto">自动识别标题和长文本分段</option><option value="single">整篇作为一个章节</option></select></div>';
    tagsField.parentNode.insertBefore(row, tagsField.nextSibling);
    refreshMaterialFolderSelect();
  }

  function refreshMaterialFolderSelect() {
    var select = byId('materialFolderSelect');
    if (!select) return;
    var preferred = state().library.selectedFolderId;
    if (preferred === 'folder-all' || !folderById(preferred)) preferred = 'folder-my-custom';
    select.innerHTML = folderSelectOptions(preferred, true, '');
  }

  function prepareLibraryItem(item) {
    ensureMaterialFields();
    item.folderId = byId('materialFolderSelect') ? byId('materialFolderSelect').value : defaultFolderForCategory(item.category);
    item.chapterMode = byId('materialChapterMode') ? byId('materialChapterMode').value : 'auto';
    item.chapters = parseChapters(item, item.chapterMode);
    return item;
  }

  function prepareImportedItem(item, raw) {
    item.folderId = item.folderId || defaultFolderForCategory(item.category);
    item.chapterMode = raw && raw.chapterMode === 'single' ? 'single' : 'auto';
    item.chapters = Array.isArray(item.chapters) && item.chapters.length ? item.chapters.map(function (chapter, index) { return normaliseChapter(chapter, item, index); }) : parseChapters(item, item.chapterMode);
    return item;
  }

  async function migrateCurrentState() {
    var appState = state();
    appState.schemaVersion = 5;
    appState.library = Object.assign({ selectedFolderId: 'folder-all' }, appState.library || {});
    for (var labIndex = 0; labIndex < 2; labIndex++) {
      var lab = labIndex === 0 ? 'sentence' : 'paragraph';
      var current = currentLabState(lab);
      var units = lab === 'sentence' ? current.segments : current.paragraphs;
      if (!units || !units.length || current.documentId) continue;
      var id = current.materialId || 'migrated-' + lab + '-' + Date.now().toString(36);
      var item = libraryCache.find(function (entry) { return entry.id === id; });
      if (!item) {
        item = {
          id: id,
          builtin: false,
          title: current.title || 'Migrated practice',
          category: 'Custom',
          folderId: 'folder-my-custom',
          source: current.source || 'Migrated from 0.6.0',
          license: current.license || 'Personal study',
          tags: current.tags || [],
          text: current.text || units.join('\n\n'),
          chapterMode: 'single',
          createdAt: new Date().toISOString()
        };
        item.chapters = parseChapters(item, 'single');
        await db.put(stores.library, item);
        libraryCache.push(item);
      }
      var chapter = getItemChapters(item)[0];
      Object.assign(current, chapterMetadata(item, chapter, 0, getItemChapters(item).length, Math.floor((Number(current.current) || 0) / BATCH_SIZE)));
      await saveLabProgress(lab);
    }
    actions.persistNow();
  }

  function showBatchCompletion(lab) {
    var current = currentLabState(lab);
    var stats = batchStats(lab);
    var item = libraryCache.find(function (entry) { return entry.id === current.documentId; });
    var chapters = item ? getItemChapters(item) : [];
    var hasNextBatch = stats.range.batchIndex < stats.range.batchCount - 1;
    var hasNextChapter = Number(current.chapterIndex || 0) < chapters.length - 1;
    byId('batchCompletionSummary').innerHTML = '<strong>' + h.escapeHtml(current.chapterTitle || '当前章节') + ' · 第 ' + (stats.range.batchIndex + 1) + ' 批</strong><p>本批共 ' + stats.size + ' 个单元，已练习 ' + stats.started + ' 个，完成 ' + stats.done + ' 个。离开后，当前内容会自动保存；你随时可以从章节和批次导航返回。</p>';
    byId('goNextBatchBtn').hidden = !hasNextBatch;
    byId('goNextChapterBtn').hidden = !hasNextChapter;
    byId('goNextBatchBtn').onclick = function () {
      closeModal('batchCompletionModal');
      actions.commitVisibleFields();
      current.batchIndex = stats.range.batchIndex + 1;
      current.current = current.batchIndex * BATCH_SIZE;
      actions.persistNow();
      saveLabProgress(lab).then(function () { actions.renderAll(); });
    };
    byId('goNextChapterBtn').onclick = function () {
      closeModal('batchCompletionModal');
      loadDocumentChapter(current.documentId, lab, Number(current.chapterIndex || 0) + 1, 0).catch(function () { actions.showToast('下一章载入失败'); });
    };
    if (!hasNextBatch && !hasNextChapter) {
      byId('batchCompletionSummary').innerHTML += '<p class="completion-final">你已经到达这份材料的最后一批。</p>';
    }
    showModal('batchCompletionModal');
  }

  function navigate(lab, delta, event) {
    var current = currentLabState(lab);
    var units = currentUnitArray(lab);
    if (!current || !current.documentId || !units || !units.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    actions.commitVisibleFields();
    var range = batchRange(lab);
    if (delta < 0) {
      if (current.current > range.start) current.current--;
      else if (range.batchIndex > 0) { current.batchIndex--; current.current = Math.min(units.length - 1, current.batchIndex * BATCH_SIZE + BATCH_SIZE - 1); }
      else if (itemHasAdjacentChapter(current.documentId, current.chapterIndex, -1)) {
        var item = libraryCache.find(function (entry) { return entry.id === current.documentId; });
        var previousIndex = Number(current.chapterIndex || 0) - 1;
        var previousChapter = getItemChapters(item)[previousIndex];
        db.get(stores.progress, progressId(lab, current.documentId, previousChapter.id)).then(function (record) {
          var unitsCount = record && record.snapshot ? (lab === 'sentence' ? record.snapshot.segments.length : record.snapshot.paragraphs.length) : 0;
          var lastBatch = Math.max(0, Math.ceil(unitsCount / BATCH_SIZE) - 1);
          loadDocumentChapter(current.documentId, lab, previousIndex, lastBatch).then(function () {
            var previous = currentLabState(lab);
            previous.current = Math.max(0, (lab === 'sentence' ? previous.segments.length : previous.paragraphs.length) - 1);
            actions.persistNow(); actions.renderAll();
          });
        });
        return;
      } else return;
      actions.scheduleSave(); actions.renderAll();
      return;
    }
    if (current.current < range.end) {
      current.current++;
      actions.scheduleSave(); actions.renderAll();
    } else if (current.current < units.length - 1 || itemHasAdjacentChapter(current.documentId, current.chapterIndex, 1)) {
      saveLabProgress(lab).then(function () { showBatchCompletion(lab); });
    } else {
      actions.showToast('已经到达最后一个练习单元');
    }
  }

  function installNavigationInterceptors() {
    [['sentencePrevBtn', 'sentence', -1], ['sentenceNextBtn', 'sentence', 1], ['paragraphPrevBtn', 'paragraph', -1], ['paragraphNextBtn', 'paragraph', 1]].forEach(function (entry) {
      var button = byId(entry[0]);
      if (!button || button.dataset.workspaceBound) return;
      button.dataset.workspaceBound = '1';
      button.addEventListener('click', function (event) { navigate(entry[1], entry[2], event); }, true);
    });
    var resplit = byId('resplitBtn');
    if (resplit && !resplit.dataset.workspaceBound) {
      resplit.dataset.workspaceBound = '1';
      resplit.addEventListener('click', function () { setTimeout(function () { var current = state().sentence; current.batchIndex = 0; saveLabProgress('sentence'); }, 0); });
    }
  }

  function afterRender(activeLab) {
    if (!initialized) return;
    if (activeLab === 'library') { renderLibrary(); return; }
    if (activeLab !== 'sentence' && activeLab !== 'paragraph') return;
    renderDocumentNavigator(activeLab);
    renderBatchUnitList(activeLab);
  }

  async function onReady() {
    ensureLibraryLayout();
    ensureMaterialFields();
    injectModals();
    customFolders = await db.getAll(stores.folders);
    libraryCache = displayedItems(core.getLibrary());
    ensureTitleModal();
    await migrateCurrentState();
    installNavigationInterceptors();
    bindWorkspaceEvents();
    initialized = true;
    actions.renderAll();
  }

  function bindWorkspaceEvents() {
    if (document.body.dataset.workspaceEventsBound) return;
    document.body.dataset.workspaceEventsBound = '1';
    ensureTitleModal();
    ensureManageModal();
    byId('closeWorkspaceTitleModal').addEventListener('click', closeTitleModal);
    byId('saveWorkspaceTitleBtn').addEventListener('click', function () { saveCardTitle().catch(function () { actions.showToast('标题保存失败'); }); });
    byId('restoreWorkspaceTitleBtn').addEventListener('click', function () { restoreCardTitle().catch(function () { actions.showToast('标题恢复失败'); }); });
    byId('workspaceTitleModal').addEventListener('click', function (event) { if (event.target === this) closeTitleModal(); });
    byId('closeWorkspaceManageModal').addEventListener('click', closeManageModal);
    byId('workspaceManageModal').addEventListener('click', function (event) { if (event.target === this) closeManageModal(); });
    byId('workspaceManageTitleBtn').addEventListener('click', function () { var id = currentManageItemId; closeManageModal(); if (id) openTitleModal(id); });
    byId('workspaceManageEditBtn').addEventListener('click', function () { var id = currentManageItemId; closeManageModal(); var api = window.WritingAssistantDocumentImport; if (id && api && api.editItem) api.editItem(id); else actions.showToast('文档编辑器尚未载入'); });
    byId('workspaceManageMoveBtn').addEventListener('click', function () { var id = currentManageItemId; closeManageModal(); if (id) openMoveModal(id); });
    byId('workspaceManageDeleteBtn').addEventListener('click', function () { var id = currentManageItemId; if (id) deleteLibraryItem(id); });
    byId('closeWorkspaceFolderModal').addEventListener('click', function () { closeModal('workspaceFolderModal'); });
    byId('saveWorkspaceFolder').addEventListener('click', function () { saveFolder().catch(function () { actions.showToast('文件夹保存失败'); }); });
    byId('closeWorkspaceMoveModal').addEventListener('click', function () { closeModal('workspaceMoveModal'); });
    byId('confirmWorkspaceMove').addEventListener('click', function () { confirmMoveItem().catch(function () { actions.showToast('材料移动失败'); }); });
    byId('closeBatchCompletionModal').addEventListener('click', function () { closeModal('batchCompletionModal'); });
    ['workspaceFolderModal', 'workspaceMoveModal', 'batchCompletionModal'].forEach(function (id) { byId(id).addEventListener('click', function (event) { if (event.target === this) closeModal(id); }); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') { closeModal('workspaceFolderModal'); closeModal('workspaceMoveModal'); closeModal('batchCompletionModal'); closeTitleModal(); closeManageModal(); } });
    var observer = new MutationObserver(function () { if (byId('materialModal').classList.contains('show')) refreshMaterialFolderSelect(); });
    observer.observe(byId('materialModal'), { attributes: true, attributeFilter: ['class'] });
  }

  async function afterBackupRestore() {
    customFolders = await db.getAll(stores.folders);
    libraryCache = displayedItems(core.getLibrary());
    await migrateCurrentState();
    renderLibrary();
  }

  window.WritingAssistantWorkspace = {
    onLibraryRefresh: function (items) { libraryCache = displayedItems(items || []); if (initialized && state().activeLab === 'library') renderLibrary(); },
    renderLibrary: renderLibrary,
    afterRender: afterRender,
    prepareLibraryItem: prepareLibraryItem,
    prepareImportedItem: prepareImportedItem,
    saveCurrentProgress: saveCurrentProgress,
    afterBackupRestore: afterBackupRestore,
    loadDocumentChapter: loadDocumentChapter,
    parseChapters: parseChapters,
    getFolders: function () { return folderList().map(function (folder) { return Object.assign({}, folder); }); },
    getItem: function (id) { var item = getLibraryItem(id); return item ? JSON.parse(JSON.stringify(item)) : null; },
    selectFolder: function (folderId) {
      if (!folderById(folderId)) folderId = 'folder-my-custom';
      state().library = state().library || {};
      revealFolderPath(folderId, false);
      state().library.selectedFolderId = folderId;
      state().activeLab = 'library';
      actions.persistNow();
      actions.renderAll();
    },
    toggleFolder: function (folderId) {
      if (!folderById(folderId) || !childrenOf(folderId).length) return;
      setFolderCollapsed(folderId, !isFolderCollapsed(folderId));
      if (state().activeLab === 'library') renderFolderTree();
    },
    isFolderCollapsed: isFolderCollapsed
  };

  injectModals();
  ensureMaterialFields();
  setTimeout(function () {
    core.actions.refreshLibrary().then(onReady).catch(function (error) { console.error(error); actions.showToast('练习库工作区初始化失败'); });
  }, 0);
})();
