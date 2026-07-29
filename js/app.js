(function () {
      'use strict';

      var APP_VERSION = '0.8.2-r1';
      // Keep the v4 storage keys for backward compatibility with existing local practice data.
      var STORAGE_KEY = 'writing-assistant-v4';
      var LEGACY_STORAGE_KEY = 'writing-assistant-v1';
      var DB_NAME = 'writing-assistant-v4-db';
      var LIBRARY_STORE = 'library';
      var HANDLE_STORE = 'handles';
      var FOLDER_STORE = 'folders';
      var PROGRESS_STORE = 'progress';
      var HANDLE_KEY = 'backup-directory';
      var saveTimer = null;
      var toastTimer = null;
      var backupDirectoryHandle = null;
      var libraryCache = [];

      var ROLE_OPTIONS = [
        ['', '未标注'], ['claim', '中心观点'], ['reason', '直接原因'], ['mechanism', '机制解释'],
        ['evidence', '证据或例子'], ['qualification', '限定或让步'], ['counter', '反方观点'],
        ['link', '回扣中心'], ['transition', '过渡'], ['background', '背景信息']
      ];
      var BUILTIN_LIBRARY = Array.isArray(window.WRITING_ASSISTANT_STARTER_LIBRARY)
        ? window.WRITING_ASSISTANT_STARTER_LIBRARY
        : [];

      var academicPhrases = [
        'play a crucial role in','play an important role in','have a significant impact on','be likely to','be unlikely to',
        'be associated with','be responsible for','contribute to','lead to','result in','depend on','the extent to which',
        'there is evidence that','one possible explanation','a growing number of','in the long term','in the short term',
        'rather than','as a result','for example','for instance','in contrast','on the other hand','in addition',
        'due to','because of','in order to','with regard to','in terms of','should be interpreted with caution'
      ];

      var connectorGroups = [
        { name: '因果', values: ['because','since','therefore','thus','consequently','as a result','due to','because of'] },
        { name: '转折', values: ['however','although','though','whereas','while','nevertheless','in contrast','on the other hand'] },
        { name: '递进', values: ['furthermore','moreover','in addition','additionally','not only'] },
        { name: '举例', values: ['for example','for instance','such as'] },
        { name: '条件', values: ['if','unless','provided that','as long as'] },
        { name: '顺序', values: ['firstly','secondly','finally','subsequently'] }
      ];

      function emptyGuided() { return { claim:'', reason:'', mechanism:'', example:'', qualification:'', conclusion:'' }; }
      function emptyParagraphRecord(paragraph) {
        var sentences = sentenceSplit(paragraph);
        return {
          roles: new Array(sentences.length).fill(''), breakdownNote:'', guided: emptyGuided(),
          transfer: { topic:'', writing:'' }, independent: { prompt:'', hintLevel:'full', writing:'' }
        };
      }
      function defaultState() {
        return {
          schemaVersion: 5, activeLab: 'sentence', fontSize: 18,
          library: { selectedFolderId:'folder-all', collapsedFolderIds:[] },
          sentence: { materialId:'', title:'', text:'', source:'', license:'', tags:[], splitMode:'sentence', targetWords:45, segments:[], answers:[], notes:[], current:0, mode:'imitate' },
          paragraph: { materialId:'', title:'', text:'', source:'', license:'', tags:[], paragraphs:[], records:[], current:0, mode:'breakdown' }
        };
      }
      var state = defaultState();

      function byId(id) { return document.getElementById(id); }
      function all(selector) { return Array.from(document.querySelectorAll(selector)); }
      function clamp(value,min,max) { return Math.min(max,Math.max(min,value)); }
      function normalizeSpace(text) { return String(text || '').replace(/\r\n/g,'\n').replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').trim(); }
      function wordList(text) { return String(text || '').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []; }
      function wordCount(text) { return wordList(text).length; }
      function escapeHtml(text) { return String(text || '').replace(/[&<>'"]/g,function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[ch]; }); }
      function uid() { return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }
      function uniqueStrings(values) { var seen = {}; return values.filter(function(v){ var key=String(v||'').trim().toLowerCase(); if(!key||seen[key]) return false; seen[key]=true; return true; }); }

      function sentenceSplit(text) {
        var clean = normalizeSpace(text);
        if (!clean) return [];
        if (window.Intl && Intl.Segmenter) {
          try {
            var seg = new Intl.Segmenter('en',{granularity:'sentence'});
            return Array.from(seg.segment(clean)).map(function(item){return item.segment.trim();}).filter(Boolean);
          } catch (e) {}
        }
        var matches = clean.match(/[^.!?]+(?:[.!?]+["'”’)]*|$)/g);
        return (matches || [clean]).map(function(s){return s.trim();}).filter(Boolean);
      }
      function paragraphSplit(text) {
        var raw = String(text || '').replace(/\r\n/g,'\n');
        var paragraphs = raw.split(/\n\s*\n+/).map(normalizeSpace).filter(Boolean);
        if (paragraphs.length > 1) return paragraphs;
        var sentences = sentenceSplit(raw);
        if (sentences.length <= 5) return paragraphs.length ? paragraphs : sentences;
        var result = [];
        for (var i=0;i<sentences.length;i+=4) result.push(sentences.slice(i,i+4).join(' '));
        return result;
      }
      function splitSentenceMaterial(text,mode,targetWords) {
        if (mode === 'paragraph') return paragraphSplit(text);
        var sentences = sentenceSplit(text);
        if (mode === 'sentence') return sentences;
        var result=[], bucket=[], count=0;
        sentences.forEach(function(sentence){
          if (bucket.length && count >= targetWords) { result.push(bucket.join(' ')); bucket=[]; count=0; }
          bucket.push(sentence); count += wordCount(sentence);
        });
        if (bucket.length) result.push(bucket.join(' '));
        return result;
      }

      function openDatabase() {
        return new Promise(function(resolve,reject){
          if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
          var request = indexedDB.open(DB_NAME,2);
          request.onupgradeneeded = function(){
            var db = request.result;
            if (!db.objectStoreNames.contains(LIBRARY_STORE)) db.createObjectStore(LIBRARY_STORE,{keyPath:'id'});
            if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
            if (!db.objectStoreNames.contains(FOLDER_STORE)) db.createObjectStore(FOLDER_STORE,{keyPath:'id'});
            if (!db.objectStoreNames.contains(PROGRESS_STORE)) db.createObjectStore(PROGRESS_STORE,{keyPath:'id'});
          };
          request.onsuccess = function(){resolve(request.result);};
          request.onerror = function(){reject(request.error || new Error('Database unavailable'));};
        });
      }
      async function dbGetAll(storeName) {
        var db = await openDatabase();
        return new Promise(function(resolve,reject){
          var tx=db.transaction(storeName,'readonly'); var req=tx.objectStore(storeName).getAll();
          req.onsuccess=function(){resolve(req.result||[]);}; req.onerror=function(){reject(req.error);}; tx.oncomplete=function(){db.close();};
        });
      }
      async function dbGet(storeName,key) {
        var db=await openDatabase();
        return new Promise(function(resolve,reject){
          var tx=db.transaction(storeName,'readonly');var req=tx.objectStore(storeName).get(key);
          req.onsuccess=function(){resolve(req.result||null);};req.onerror=function(){reject(req.error);};tx.oncomplete=function(){db.close();};
        });
      }
      async function dbPut(storeName,value,key) {
        var db=await openDatabase();
        return new Promise(function(resolve,reject){
          var tx=db.transaction(storeName,'readwrite'); var store=tx.objectStore(storeName); if(key===undefined) store.put(value); else store.put(value,key);
          tx.oncomplete=function(){db.close();resolve();}; tx.onerror=function(){db.close();reject(tx.error);};
        });
      }
      async function dbDelete(storeName,key) {
        var db=await openDatabase();
        return new Promise(function(resolve,reject){
          var tx=db.transaction(storeName,'readwrite'); tx.objectStore(storeName).delete(key);
          tx.oncomplete=function(){db.close();resolve();}; tx.onerror=function(){db.close();reject(tx.error);};
        });
      }
      async function dbClear(storeName) {
        var db=await openDatabase();
        return new Promise(function(resolve,reject){
          var tx=db.transaction(storeName,'readwrite'); tx.objectStore(storeName).clear();
          tx.oncomplete=function(){db.close();resolve();}; tx.onerror=function(){db.close();reject(tx.error);};
        });
      }
      async function refreshLibrary() {
        var custom=[];
        try { custom=await dbGetAll(LIBRARY_STORE); } catch(e) { custom=[]; }
        libraryCache=BUILTIN_LIBRARY.concat(custom.sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));}));
        if(window.WritingAssistantWorkspace&&window.WritingAssistantWorkspace.onLibraryRefresh)window.WritingAssistantWorkspace.onLibraryRefresh(libraryCache);
        renderLibrary();
      }
      async function storeDirectoryHandle(handle) { await dbPut(HANDLE_STORE,handle,HANDLE_KEY); }
      async function restoreDirectoryHandle() {
        var db=await openDatabase();
        return new Promise(function(resolve,reject){
          var tx=db.transaction(HANDLE_STORE,'readonly'); var req=tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
          req.onsuccess=function(){resolve(req.result||null);}; req.onerror=function(){reject(req.error);}; tx.oncomplete=function(){db.close();};
        });
      }

      function migrateLegacy() {
        try {
          var legacy=JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)||'null');
          if (!legacy || !Array.isArray(legacy.segments) || !legacy.segments.length) return null;
          var next=defaultState();
          next.fontSize=[16,18,20].indexOf(Number(legacy.fontSize))>=0?Number(legacy.fontSize):18;
          next.sentence.title=legacy.title||'Migrated Practice';
          next.sentence.text=legacy.source||legacy.segments.join(' ');
          next.sentence.segments=legacy.segments;
          next.sentence.answers=Array.isArray(legacy.answers)?legacy.answers:new Array(legacy.segments.length).fill('');
          next.sentence.notes=Array.isArray(legacy.notes)?legacy.notes:new Array(legacy.segments.length).fill('');
          next.sentence.current=clamp(Number(legacy.current)||0,0,legacy.segments.length-1);
          next.sentence.mode=legacy.mode==='copy'?'copy':'imitate';
          return next;
        } catch(e) { return null; }
      }
      function loadState() {
        try {
          var saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
          if (saved && (saved.schemaVersion===4 || saved.schemaVersion===5)) { state=Object.assign(defaultState(),saved); state.schemaVersion=5; }
          else {
            var migrated=migrateLegacy();
            if (migrated) { state=migrated; localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
          }
        } catch(e) { state=defaultState(); }
        normalizeState();
      }
      function normalizeState() {
        if (['sentence','paragraph','library'].indexOf(state.activeLab)<0) state.activeLab='sentence';
        state.schemaVersion=5;
        state.library=Object.assign(defaultState().library,state.library||{});
        state.library.collapsedFolderIds=Array.isArray(state.library.collapsedFolderIds)?uniqueStrings(state.library.collapsedFolderIds.map(String)):[];
        if ([16,18,20].indexOf(Number(state.fontSize))<0) state.fontSize=18;
        state.sentence=Object.assign(defaultState().sentence,state.sentence||{});
        state.paragraph=Object.assign(defaultState().paragraph,state.paragraph||{});
        state.sentence.segments=Array.isArray(state.sentence.segments)?state.sentence.segments:[];
        state.sentence.answers=Array.isArray(state.sentence.answers)?state.sentence.answers:[];
        state.sentence.notes=Array.isArray(state.sentence.notes)?state.sentence.notes:[];
        while(state.sentence.answers.length<state.sentence.segments.length) state.sentence.answers.push('');
        while(state.sentence.notes.length<state.sentence.segments.length) state.sentence.notes.push('');
        state.sentence.current=clamp(Number(state.sentence.current)||0,0,Math.max(0,state.sentence.segments.length-1));
        state.paragraph.paragraphs=Array.isArray(state.paragraph.paragraphs)?state.paragraph.paragraphs:[];
        state.paragraph.records=Array.isArray(state.paragraph.records)?state.paragraph.records:[];
        while(state.paragraph.records.length<state.paragraph.paragraphs.length) state.paragraph.records.push(emptyParagraphRecord(state.paragraph.paragraphs[state.paragraph.records.length]));
        state.paragraph.current=clamp(Number(state.paragraph.current)||0,0,Math.max(0,state.paragraph.paragraphs.length-1));
      }
      function persistNow() { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); updateAutosave('已自动保存'); }
      function scheduleSave() { updateAutosave('正在保存…'); clearTimeout(saveTimer); saveTimer=setTimeout(persistNow,250); }
      function updateAutosave(text) { if(byId('sentenceAutosave')) byId('sentenceAutosave').textContent=text; }
      function showToast(message) { var el=byId('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(function(){el.classList.remove('show');},2100); }

      function setActiveLab(lab) {
        commitVisibleFields();
        state.activeLab=lab;
        scheduleSave();
        renderAll();
      }
      function renderAll() {
        document.body.dataset.labActive=state.activeLab;
        document.documentElement.style.setProperty('--practice-font',state.fontSize+'px');
        all('.lab-tab').forEach(function(btn){btn.classList.toggle('active',btn.dataset.lab===state.activeLab);});
        all('.view').forEach(function(view){view.classList.remove('active');});
        byId(state.activeLab+'View').classList.add('active');
        byId('sentenceCoach').style.display=state.activeLab==='sentence'?'block':'none';
        byId('paragraphCoach').style.display=state.activeLab==='paragraph'?'block':'none';
        byId('libraryCoach').style.display=state.activeLab==='library'?'block':'none';
        byId('openLibraryBtn').style.display=state.activeLab==='library'?'none':'inline-block';
        byId('progressWrap').style.display=state.activeLab==='library'?'none':'block';
        if(state.activeLab==='sentence') renderSentenceLab();
        else if(state.activeLab==='paragraph') renderParagraphLab();
        else renderLibrary();
        renderLeftPanel();
        if(window.WritingAssistantWorkspace&&window.WritingAssistantWorkspace.afterRender)window.WritingAssistantWorkspace.afterRender(state.activeLab);
      }

      function renderLeftPanel() {
        var list=byId('unitList'); list.innerHTML='';
        if(state.activeLab==='library') {
          byId('leftTitle').textContent='练习库说明'; byId('sourceName').textContent='本地优先';
          byId('sourceInfo').textContent='内置原创材料不会改变；你添加的材料保存在 IndexedDB，并随备份导出。';
          return;
        }
        if(state.activeLab==='sentence') {
          var s=state.sentence; byId('leftTitle').textContent='句子练习目录'; byId('sourceName').textContent=s.title||'尚未选择材料';
          byId('sourceInfo').textContent=s.segments.length?(s.segments.length+' 个单元 · '+wordCount(s.text)+' 词'):'从练习库选择或添加一篇文本。';
          var practiced=s.answers.filter(function(v){return String(v||'').trim();}).length; var percent=s.segments.length?Math.round(practiced/s.segments.length*100):0;
          byId('progressBar').style.width=percent+'%'; byId('progressText').textContent=s.segments.length?(practiced+' / '+s.segments.length+' 已练习 · '+percent+'%'):'尚未开始';
          s.segments.forEach(function(segment,index){
            var answer=String(s.answers[index]||'').trim(); var done=sentenceDone(index); var btn=document.createElement('button');
            btn.className='unit-item'+(index===s.current?' active':''); btn.innerHTML='<span class="unit-num">'+(index+1)+'</span><span class="unit-preview">'+escapeHtml(segment)+'</span><span class="unit-state '+(done?'done':answer?'started':'')+'"></span>';
            btn.addEventListener('click',function(){commitVisibleFields();s.current=index;scheduleSave();renderAll();byId('sentenceWriter').focus();}); list.appendChild(btn);
          });
          return;
        }
        var p=state.paragraph; byId('leftTitle').textContent='段落练习目录'; byId('sourceName').textContent=p.title||'尚未选择材料';
        byId('sourceInfo').textContent=p.paragraphs.length?(p.paragraphs.length+' 个段落 · '+wordCount(p.text)+' 词'):'从练习库选择含完整段落的材料。';
        var started=0; p.records.forEach(function(record){if(paragraphRecordStarted(record)) started++;}); var pcent=p.paragraphs.length?Math.round(started/p.paragraphs.length*100):0;
        byId('progressBar').style.width=pcent+'%'; byId('progressText').textContent=p.paragraphs.length?(started+' / '+p.paragraphs.length+' 已开始 · '+pcent+'%'):'尚未开始';
        p.paragraphs.forEach(function(paragraph,index){var record=p.records[index]||emptyParagraphRecord(paragraph); var btn=document.createElement('button'); btn.className='unit-item'+(index===p.current?' active':''); btn.innerHTML='<span class="unit-num">'+(index+1)+'</span><span class="unit-preview">'+escapeHtml(paragraph)+'</span><span class="unit-state '+(paragraphRecordDone(record)?'done':paragraphRecordStarted(record)?'started':'')+'"></span>'; btn.addEventListener('click',function(){commitVisibleFields();p.current=index;scheduleSave();renderAll();}); list.appendChild(btn);});
      }

      function renderSentenceLab() {
        var s=state.sentence; var has=s.segments.length>0; byId('sentenceEmpty').style.display=has?'none':'grid'; byId('sentencePractice').style.display=has?'block':'none';
        byId('fontSizeSelect').value=String(state.fontSize); byId('sentenceModeSelect').value=s.mode; byId('splitModeSelect').value=s.splitMode;
        if(!has){renderSentenceAnalysis('');return;}
        s.current=clamp(s.current,0,s.segments.length-1); var target=s.segments[s.current]||''; var answer=s.answers[s.current]||'';
        byId('sentenceUnitLabel').textContent='Practice '+(s.current+1)+' / '+s.segments.length; byId('sentenceHeading').textContent=s.mode==='copy'?'精准跟写':'结构仿写';
        byId('sentenceWriter').value=answer; byId('sentenceWriter').placeholder=s.mode==='copy'?'按原文逐字输入，系统会标记字符差异……':'参考原文结构、搭配或逻辑，写出自己的句子或短段……';
        byId('sentencePrevBtn').disabled=s.current<=0; byId('sentenceNextBtn').disabled=s.current>=s.segments.length-1; byId('sentenceNote').value=s.notes[s.current]||'';
        renderSentenceTarget(target,answer); renderSentenceStats(target,answer); renderSentenceAnalysis(target);
      }
      function renderSentenceTarget(target,answer) {
        if(state.sentence.mode!=='copy'){byId('sentenceTarget').textContent=target;return;}
        var html=''; for(var i=0;i<target.length;i++){var cls='target-char'; if(i<answer.length) cls+=answer[i]===target[i]?' correct':' wrong'; else if(i===answer.length) cls+=' current'; html+='<span class="'+cls+'">'+escapeHtml(target[i])+'</span>';}
        if(answer.length>target.length) html+='<span class="target-char wrong">'+escapeHtml(answer.slice(target.length))+'</span>'; byId('sentenceTarget').innerHTML=html;
      }
      function levenshtein(a,b){a=String(a||'');b=String(b||'');if(!a.length)return b.length;if(!b.length)return a.length;var prev=new Array(b.length+1),curr=new Array(b.length+1);for(var j=0;j<=b.length;j++)prev[j]=j;for(var i=1;i<=a.length;i++){curr[0]=i;for(var k=1;k<=b.length;k++){var cost=a[i-1]===b[k-1]?0:1;curr[k]=Math.min(curr[k-1]+1,prev[k]+1,prev[k-1]+cost);}var t=prev;prev=curr;curr=t;}return prev[b.length];}
      function sentenceAccuracy(target,answer){if(!answer.length)return null;var max=Math.max(target.length,answer.length,1);return Math.max(0,Math.round((1-levenshtein(target,answer)/max)*100));}
      function renderSentenceStats(target,answer){var accuracy=sentenceAccuracy(target,answer);byId('sentenceWordStat').textContent=wordCount(answer);byId('sentenceCharStat').textContent=answer.length;byId('sentenceAccuracyStat').textContent=state.sentence.mode==='copy'&&accuracy!==null?accuracy+'%':'—';byId('sentenceCompletionStat').textContent=Math.min(999,Math.round(answer.length/Math.max(target.length,1)*100))+'%';}
      function sentenceDone(index){var s=state.sentence,answer=String(s.answers[index]||'').trim();if(!answer)return false;if(s.mode==='copy'){var target=s.segments[index]||'';return sentenceAccuracy(target,answer)>=95&&answer.length>=target.length*.9;}return wordCount(answer)>=Math.max(4,Math.round(wordCount(s.segments[index]||'')*.45));}
      function handleSentenceInput(){var s=state.sentence;s.answers[s.current]=byId('sentenceWriter').value;scheduleSave();renderSentenceTarget(s.segments[s.current]||'',s.answers[s.current]);renderSentenceStats(s.segments[s.current]||'',s.answers[s.current]);renderLeftPanel();}
      function renderSentenceAnalysis(text){var words=wordCount(text),sentences=sentenceSplit(text),avg=sentences.length?Math.round(words/sentences.length):0;byId('analysisWords').textContent=words;byId('analysisSentences').textContent=sentences.length;byId('analysisAvg').textContent=avg;byId('analysisLevel').textContent=avg>=30?'Long':avg>=18?'Medium':'Short';var lower=' '+String(text||'').toLowerCase()+' ';var connectors=[];connectorGroups.forEach(function(group){var found=group.values.filter(function(v){return lower.indexOf(' '+v+' ')>=0;});if(found.length)connectors.push(group.name+'：'+found.join(', '));});renderChips('connectorChips',connectors,'未识别到明显连接词');var patterns=[];if(/\bwhich\b|\bthat\b|\bwho\b/i.test(text))patterns.push('可能包含定语或名词性从句');if(/\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/i.test(text))patterns.push('可能包含被动语态');if(/\b(can|could|may|might|must|should|would)\b/i.test(text))patterns.push('使用了情态动词，注意语气强弱');if(/\balthough\b|\bthough\b|\bwhile\b|\bwhereas\b/i.test(text))patterns.push('包含让步或对比结构');if(/;|:/.test(text))patterns.push('使用分号或冒号组织信息');var list=byId('patternList');list.innerHTML='';if(!patterns.length)list.innerHTML='<li class="analysis-empty">未识别到明显结构；这不等于句子简单或有问题。</li>';else patterns.forEach(function(v){var li=document.createElement('li');li.textContent=v;list.appendChild(li);});var phrases=academicPhrases.filter(function(p){return lower.indexOf(' '+p+' ')>=0;});renderChips('phraseChips',phrases,'暂无规则匹配结果');}
      function renderChips(id,items,emptyText){var el=byId(id);el.innerHTML='';if(!items.length){el.innerHTML='<span class="analysis-empty">'+escapeHtml(emptyText)+'</span>';return;}items.forEach(function(item){var chip=document.createElement('span');chip.className='chip';chip.textContent=item;el.appendChild(chip);});}

      function renderParagraphLab(){var p=state.paragraph,has=p.paragraphs.length>0;byId('paragraphEmpty').style.display=has?'none':'grid';byId('paragraphPractice').style.display=has?'block':'none';if(!has){renderParagraphCoach();return;}p.current=clamp(p.current,0,p.paragraphs.length-1);ensureParagraphRecord(p.current);byId('paragraphUnitLabel').textContent='Paragraph '+(p.current+1)+' / '+p.paragraphs.length;var headings={breakdown:'段落拆解',guided:'引导式搭建',transfer:'骨架迁移',independent:'独立段落'};byId('paragraphHeading').textContent=headings[p.mode]||'段落训练';all('.mode-tab').forEach(function(btn){btn.classList.toggle('active',btn.dataset.paragraphMode===p.mode);});all('.paragraph-mode').forEach(function(el){el.classList.remove('active');});byId('paragraph'+p.mode.charAt(0).toUpperCase()+p.mode.slice(1)+'Mode').classList.add('active');byId('paragraphPrevBtn').disabled=p.current<=0;byId('paragraphNextBtn').disabled=p.current>=p.paragraphs.length-1;renderBreakdown();renderGuided();renderTransfer();renderIndependent();renderParagraphCoach();}
      function ensureParagraphRecord(index){var p=state.paragraph;while(p.records.length<p.paragraphs.length)p.records.push(emptyParagraphRecord(p.paragraphs[p.records.length]));var rec=p.records[index];var sentenceCount=sentenceSplit(p.paragraphs[index]||'').length;if(!Array.isArray(rec.roles))rec.roles=[];while(rec.roles.length<sentenceCount)rec.roles.push('');if(rec.roles.length>sentenceCount)rec.roles=rec.roles.slice(0,sentenceCount);rec.guided=Object.assign(emptyGuided(),rec.guided||{});rec.transfer=Object.assign({topic:'',writing:''},rec.transfer||{});rec.independent=Object.assign({prompt:'',hintLevel:'full',writing:''},rec.independent||{});}
      function currentParagraphRecord(){ensureParagraphRecord(state.paragraph.current);return state.paragraph.records[state.paragraph.current];}
      function renderBreakdown(){var p=state.paragraph,paragraph=p.paragraphs[p.current]||'',rec=currentParagraphRecord(),sentences=sentenceSplit(paragraph),container=byId('roleRows');container.innerHTML='';sentences.forEach(function(sentence,index){var row=document.createElement('div');row.className='sentence-role';var select='<select class="role-select" data-role-index="'+index+'">';ROLE_OPTIONS.forEach(function(option){select+='<option value="'+option[0]+'"'+(rec.roles[index]===option[0]?' selected':'')+'>'+option[1]+'</option>';});select+='</select>';row.innerHTML='<div class="sentence-text"><strong>'+(index+1)+'.</strong> '+escapeHtml(sentence)+'</div><div>'+select+'</div>';container.appendChild(row);});all('[data-role-index]').forEach(function(select){select.addEventListener('change',function(){rec.roles[Number(this.dataset.roleIndex)]=this.value;scheduleSave();renderParagraphCoach();renderLeftPanel();});});byId('breakdownNote').value=rec.breakdownNote||'';}
      function renderGuided(){var rec=currentParagraphRecord();all('[data-guided]').forEach(function(area){area.value=rec.guided[area.dataset.guided]||'';});updateGuidedPreview();}
      function updateGuidedPreview(){var rec=currentParagraphRecord(),parts=['claim','reason','mechanism','example','qualification','conclusion'].map(function(k){return String(rec.guided[k]||'').trim();}).filter(Boolean);byId('guidedPreview').textContent=parts.length?parts.join(' '):'填写上方内容后，这里会按顺序组合显示。网页不会替你自动润色。';renderParagraphCoach();}
      function roleLabel(value){var found=ROLE_OPTIONS.find(function(item){return item[0]===value;});return found?found[1]:'未标注';}
      function skeletonFromRecord(record){var rec=record||currentParagraphRecord(),roles=uniqueStrings((rec.roles||[]).filter(Boolean).map(roleLabel));return roles.length?roles.join(' → '):'提出主张 → 解释原因 → 展开机制 → 举例 → 限定 → 回扣';}
      function renderTransfer(){var rec=currentParagraphRecord();byId('skeletonBox').textContent='当前骨架：'+skeletonFromRecord();byId('transferTopic').value=rec.transfer.topic||'';byId('transferWriter').value=rec.transfer.writing||'';}
      function independentHint(level){if(level==='hidden')return '';if(level==='skeleton')return '观点 → 原因 → 机制 → 例子 → 限定 → 回扣';return '先写清本段主张；解释为什么成立；说明原因如何产生结果；给出具体例子；必要时承认限制；最后回到中心观点。';}
      function renderIndependent(){var rec=currentParagraphRecord();byId('independentPrompt').value=rec.independent.prompt||'';byId('hintLevelSelect').value=rec.independent.hintLevel||'full';byId('independentHint').textContent=independentHint(rec.independent.hintLevel||'full');byId('independentHint').style.display=rec.independent.hintLevel==='hidden'?'none':'block';byId('independentWriter').value=rec.independent.writing||'';}
      function paragraphRecordStarted(rec){return Boolean((rec.roles||[]).some(Boolean)||String(rec.breakdownNote||'').trim()||Object.keys(rec.guided||{}).some(function(k){return String(rec.guided[k]||'').trim();})||String((rec.transfer||{}).writing||'').trim()||String((rec.independent||{}).writing||'').trim());}
      function paragraphRecordDone(rec){if(state.paragraph.mode==='breakdown')return rec.roles.length>0&&rec.roles.filter(Boolean).length===rec.roles.length;if(state.paragraph.mode==='guided')return ['claim','reason','mechanism','example','conclusion'].every(function(k){return String(rec.guided[k]||'').trim();});if(state.paragraph.mode==='transfer')return wordCount(rec.transfer.writing)>=45;return wordCount(rec.independent.writing)>=45;}
      function paragraphWritingForRecord(rec,mode){if(mode==='guided')return ['claim','reason','mechanism','example','qualification','conclusion'].map(function(k){return rec.guided[k]||'';}).join(' ').trim();if(mode==='transfer')return rec.transfer.writing||'';if(mode==='independent')return rec.independent.writing||'';return rec.breakdownNote||'';}function currentParagraphWriting(){return paragraphWritingForRecord(currentParagraphRecord(),state.paragraph.mode);}
      function renderParagraphCoach(){var p=state.paragraph;if(!p.paragraphs.length){byId('paragraphSourceWords').textContent='0';byId('paragraphWritingWords').textContent='0';byId('paragraphSentences').textContent='0';byId('paragraphCoverage').textContent='0%';byId('paragraphChecklist').innerHTML='<li class="analysis-empty">选择材料后显示检查结果。</li>';renderChips('paragraphMetaChips',[],'暂无材料');byId('paragraphSourceNote').textContent='';return;}var paragraph=p.paragraphs[p.current]||'',rec=currentParagraphRecord(),writing=currentParagraphWriting(),coverage=0,checks=[];if(p.mode==='breakdown'){coverage=rec.roles.length?Math.round(rec.roles.filter(Boolean).length/rec.roles.length*100):0;checks.push(coverage===100?'每句话都已标注功能':'还有句子没有标注功能');checks.push(String(rec.breakdownNote||'').trim()?'已经记录段落推进心得':'建议写下整体推进路径');}else if(p.mode==='guided'){var required=['claim','reason','mechanism','example','conclusion'];coverage=Math.round(required.filter(function(k){return String(rec.guided[k]||'').trim();}).length/required.length*100);checks.push(String(rec.guided.claim||'').trim()?'中心观点已填写':'缺少明确中心观点');checks.push(String(rec.guided.reason||'').trim()?'原因已填写':'缺少直接原因');checks.push(String(rec.guided.mechanism||'').trim()?'已有机制解释':'原因还没有进一步展开');checks.push(String(rec.guided.example||'').trim()?'已有例子':'缺少具体例子');checks.push(String(rec.guided.conclusion||'').trim()?'已经回扣中心':'缺少结尾回扣');}else{coverage=Math.min(100,Math.round(wordCount(writing)/80*100));checks.push(wordCount(writing)>=45?'段落已经达到基本展开长度':'内容仍较短，可能尚未充分展开');checks.push(sentenceSplit(writing).length>=4?'包含多个推进步骤':'句子数量较少，检查是否只重复了观点');var lower=' '+writing.toLowerCase()+' ';var connectorHits=[];connectorGroups.forEach(function(g){g.values.forEach(function(v){if(lower.indexOf(' '+v+' ')>=0)connectorHits.push(v);});});checks.push(connectorHits.length?'使用了连接表达：'+uniqueStrings(connectorHits).slice(0,4).join(', '):'未识别到明显连接表达；逻辑也可以通过句意自然推进');var freq={};wordList(writing).map(function(w){return w.toLowerCase();}).filter(function(w){return w.length>5;}).forEach(function(w){freq[w]=(freq[w]||0)+1;});var repeated=Object.keys(freq).filter(function(w){return freq[w]>=3;}).slice(0,3);if(repeated.length)checks.push('检查重复词：'+repeated.join(', '));}
        byId('paragraphSourceWords').textContent=wordCount(paragraph);byId('paragraphWritingWords').textContent=wordCount(writing);byId('paragraphSentences').textContent=sentenceSplit(writing).length;byId('paragraphCoverage').textContent=coverage+'%';var list=byId('paragraphChecklist');list.innerHTML='';checks.forEach(function(v){var li=document.createElement('li');li.textContent=v;list.appendChild(li);});renderChips('paragraphMetaChips',[p.source||'Local material',p.license||'Personal study'].concat(p.tags||[]),'暂无元数据');byId('paragraphSourceNote').textContent='当前模式：'+({breakdown:'段落拆解',guided:'引导式搭建',transfer:'骨架迁移',independent:'独立段落'}[p.mode]||p.mode);}

      function renderLibrary(){if(!byId('libraryGrid'))return;if(window.WritingAssistantWorkspace&&window.WritingAssistantWorkspace.renderLibrary&&window.WritingAssistantWorkspace.renderLibrary())return;var query=String(byId('librarySearch').value||'').trim().toLowerCase(),category=byId('libraryCategory').value||'all';var items=libraryCache.filter(function(item){var hay=[item.title,item.category,item.source,item.license,(item.tags||[]).join(' '),item.text].join(' ').toLowerCase();return(!query||hay.indexOf(query)>=0)&&(category==='all'||item.category===category||(category==='Custom'&&!item.builtin));});byId('libraryCount').textContent=items.length+' items';var grid=byId('libraryGrid');grid.innerHTML='';if(!items.length){grid.innerHTML='<div class="analysis-empty">没有匹配的材料。</div>';return;}items.forEach(function(item){var card=document.createElement('article');card.className='library-card';var tags=(item.tags||[]).slice(0,5).map(function(t){return '<span class="chip">'+escapeHtml(t)+'</span>';}).join('');card.innerHTML='<h3>'+escapeHtml(item.title)+'</h3><div class="library-meta">'+escapeHtml(item.category)+' · '+escapeHtml(item.source||'Unknown source')+'<br />'+escapeHtml(item.license||'Personal study')+'</div><div class="chips" style="margin-top:8px">'+tags+'</div><div class="library-preview">'+escapeHtml(item.text)+'</div><div class="library-actions"><button class="btn small soft" data-use-sentence="'+escapeHtml(item.id)+'">句子练习</button><button class="btn small primary" data-use-paragraph="'+escapeHtml(item.id)+'">段落练习</button>'+(item.builtin?'':'<button class="btn small danger" data-delete-item="'+escapeHtml(item.id)+'">删除</button>')+'</div>';grid.appendChild(card);});all('[data-use-sentence]').forEach(function(btn){btn.addEventListener('click',function(){useLibraryItem(this.dataset.useSentence,'sentence');});});all('[data-use-paragraph]').forEach(function(btn){btn.addEventListener('click',function(){useLibraryItem(this.dataset.useParagraph,'paragraph');});});all('[data-delete-item]').forEach(function(btn){btn.addEventListener('click',async function(){var id=this.dataset.deleteItem;if(!window.confirm('确定从本地练习库删除这份材料吗？'))return;await dbDelete(LIBRARY_STORE,id);await refreshLibrary();showToast('材料已删除');});});}
      function findLibraryItem(id){return libraryCache.find(function(item){return item.id===id;});}
      function useLibraryItem(id,lab){var item=findLibraryItem(id);if(!item)return;if(lab==='sentence'){if(state.sentence.segments.length&&sentenceHasWork()&&!window.confirm('载入新材料会替换当前句子练习，是否继续？'))return;loadSentenceItem(item);}else{if(state.paragraph.paragraphs.length&&paragraphHasWork()&&!window.confirm('载入新材料会替换当前段落练习，是否继续？'))return;loadParagraphItem(item);}state.activeLab=lab;persistNow();renderAll();showToast('已载入：'+item.title);}
      function loadSentenceItem(item){var segments=splitSentenceMaterial(item.text,state.sentence.splitMode,state.sentence.targetWords).filter(function(v){return wordCount(v)>0;}).slice(0,300);state.sentence={materialId:item.id,title:item.title,text:item.text,source:item.source||'',license:item.license||'',tags:item.tags||[],splitMode:state.sentence.splitMode||'sentence',targetWords:45,segments:segments,answers:new Array(segments.length).fill(''),notes:new Array(segments.length).fill(''),current:0,mode:state.sentence.mode||'imitate'};}
      function loadParagraphItem(item){var paragraphs=paragraphSplit(item.text).filter(function(v){return wordCount(v)>0;}).slice(0,100);state.paragraph={materialId:item.id,title:item.title,text:item.text,source:item.source||'',license:item.license||'',tags:item.tags||[],paragraphs:paragraphs,records:paragraphs.map(emptyParagraphRecord),current:0,mode:state.paragraph.mode||'breakdown'};}
      function sentenceHasWork(){return state.sentence.answers.some(function(v){return String(v||'').trim();})||state.sentence.notes.some(function(v){return String(v||'').trim();});}
      function paragraphHasWork(){return state.paragraph.records.some(paragraphRecordStarted);}

      function commitVisibleFields(){if(state.activeLab==='sentence'&&state.sentence.segments.length){state.sentence.answers[state.sentence.current]=byId('sentenceWriter').value;state.sentence.notes[state.sentence.current]=byId('sentenceNote').value;}if(state.activeLab==='paragraph'&&state.paragraph.paragraphs.length){var rec=currentParagraphRecord();rec.breakdownNote=byId('breakdownNote').value;rec.transfer.topic=byId('transferTopic').value;rec.transfer.writing=byId('transferWriter').value;rec.independent.prompt=byId('independentPrompt').value;rec.independent.hintLevel=byId('hintLevelSelect').value;rec.independent.writing=byId('independentWriter').value;all('[data-guided]').forEach(function(area){rec.guided[area.dataset.guided]=area.value;});}}
      function buildSentenceCopy(indices){
        var s=state.sentence;
        var intro=s.mode==='copy'
          ?'请用简体中文反馈。比较参考原文与我的精准跟写，指出拼写、遗漏、大小写和标点问题；不要改写参考原文。'
          :'请用简体中文反馈。根据参考原文检查我的英语仿写，先诊断逻辑、语法、搭配和自然度，优先指出两个最重要的问题；尽量保留我的原意，不要一开始就整段重写。';
        var parts=[
          'Writing Assistant · Sentence Lab · 外部AI反馈材料',
          intro,
          '反馈顺序：先指出问题及原因，再给出可执行的修改建议；确有必要时，最后提供一个参考修改版本。',
          ''
        ];
        indices.forEach(function(index,order){
          parts.push(
            '--- 练习 '+(order+1)+'（原单元 '+(index+1)+'）---',
            '参考原文 Original:',
            s.segments[index]||'',
            '',
            '我的写作 My writing:',
            String(s.answers[index]||'').trim()
          );
          var note=String(s.notes[index]||'').trim();
          if(note)parts.push('','我的笔记 My analysis note:',note);
          parts.push('');
        });
        return parts.join('\n').trim();
      }

      function currentParagraphCopy(index){
        var p=state.paragraph,rec=p.records[index],source=p.paragraphs[index]||'';
        var parts=[
          'Writing Assistant · Paragraph Lab · 外部AI反馈材料',
          '当前模式：'+({breakdown:'段落拆解',guided:'引导式搭建',transfer:'骨架迁移',independent:'独立段落'}[p.mode]||p.mode),
          '请用简体中文反馈。先指出问题及原因，再给出修改方向；不要一开始就直接重写整个段落。',
          '',
          '参考段落 Original paragraph:',
          source,
          ''
        ];
        if(p.mode==='breakdown'){
          parts.push('我的逐句功能标注 My sentence-function labels:');
          sentenceSplit(source).forEach(function(sentence,i){
            parts.push((i+1)+'. ['+roleLabel(rec.roles[i])+'] '+sentence);
          });
          parts.push(
            '',
            '我的段落分析 My paragraph analysis:',
            rec.breakdownNote||'',
            '',
            '请检查我的功能标注和分析是否准确描述了段落推进；指出判断错误及理由，不要改写参考段落。'
          );
        }else if(p.mode==='guided'){
          parts.push('我的段落计划 My paragraph plan:');
          ['claim','reason','mechanism','example','qualification','conclusion'].forEach(function(k){
            parts.push(k+': '+(rec.guided[k]||''));
          });
          parts.push(
            '',
            '组合草稿 Combined draft:',
            paragraphWritingForRecord(rec,'guided'),
            '',
            '请检查每一步是否支持中心观点、哪些逻辑连接缺失，以及语法和搭配问题。'
          );
        }else if(p.mode==='transfer'){
          parts.push(
            '原段落逻辑骨架 Logical skeleton:',
            skeletonFromRecord(rec),
            '新主题 New topic:',
            rec.transfer.topic||'',
            '',
            '我的段落 My paragraph:',
            rec.transfer.writing||'',
            '',
            '请检查我是否真正迁移了逻辑结构，而不只是替换词语；同时检查论证推进、语法和搭配。'
          );
        }else{
          parts.push(
            '写作任务 Writing task:',
            rec.independent.prompt||'',
            '',
            '我的段落 My paragraph:',
            rec.independent.writing||'',
            '',
            '请检查每句话是否推动论证、例子是否支持观点、缺少哪个逻辑步骤，并指出语法、搭配和自然度问题。'
          );
        }
        return parts.join('\n').trim();
      }
      function fallbackCopy(text){var area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();var ok=document.execCommand('copy');document.body.removeChild(area);return ok;}
      function copyText(text,message){if(!text){showToast('没有可复制的内容');return;}if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(function(){showToast(message);}).catch(function(){showToast(fallbackCopy(text)?message:'复制失败，请手动选择文本');});}else showToast(fallbackCopy(text)?message:'复制失败，请手动选择文本');}

      function openMaterialModal(){byId('materialTitle').value='';byId('materialCategory').value='Custom';byId('materialSource').value='Personal import';byId('materialLicense').value='Personal study';byId('materialTags').value='';byId('materialText').value='';byId('materialTextFile').value='';byId('materialModal').classList.add('show');setTimeout(function(){byId('materialText').focus();},20);}
      function closeMaterialModal(){byId('materialModal').classList.remove('show');}
      async function saveMaterial(){var title=byId('materialTitle').value.trim(),text=byId('materialText').value.trim();if(!title||!text){showToast('请填写标题和正文');return;}var item={id:uid(),builtin:false,title:title,category:byId('materialCategory').value||'Custom',source:byId('materialSource').value.trim()||'Personal import',license:byId('materialLicense').value.trim()||'Personal study',tags:uniqueStrings(byId('materialTags').value.split(',').map(function(v){return v.trim();})),text:text,createdAt:new Date().toISOString()};if(window.WritingAssistantWorkspace&&window.WritingAssistantWorkspace.prepareLibraryItem)item=window.WritingAssistantWorkspace.prepareLibraryItem(item)||item;await dbPut(LIBRARY_STORE,item);closeMaterialModal();await refreshLibrary();state.activeLab='library';persistNow();renderAll();showToast('已保存到本地练习库');}

      async function chooseBackupDirectory(){if(typeof window.showDirectoryPicker!=='function'){showToast('当前浏览器不支持选择文件夹，将使用普通下载');return;}try{var handle=await window.showDirectoryPicker({id:'writing-assistant-backups',mode:'readwrite',startIn:'documents'});backupDirectoryHandle=handle;try{await storeDirectoryHandle(handle);}catch(e){}updateFolderButton();showToast('已选择文件夹：'+handle.name);}catch(e){if(!e||e.name!=='AbortError')showToast('未能选择文件夹');}}
      function updateFolderButton(){var btn=byId('chooseFolderBtn');if(!btn)return;if(typeof window.showDirectoryPicker!=='function'){btn.querySelector('strong').textContent='选择备份文件夹（不可用）';btn.disabled=true;updateDataMenuStatus('自动保存开启 · 备份将下载');return;}btn.disabled=false;btn.querySelector('strong').textContent=backupDirectoryHandle?'备份文件夹：'+backupDirectoryHandle.name:'选择备份文件夹';updateDataMenuStatus(backupDirectoryHandle?'自动保存开启 · 已记住文件夹':'浏览器实时保存已开启');}
      async function initializeFolder(){try{backupDirectoryHandle=await restoreDirectoryHandle();}catch(e){backupDirectoryHandle=null;}updateFolderButton();}
      async function folderPermission(handle,request){if(!handle)return false;var options={mode:'readwrite'};if(typeof handle.queryPermission==='function'&&(await handle.queryPermission(options))==='granted')return true;if(request&&typeof handle.requestPermission==='function')return(await handle.requestPermission(options))==='granted';return false;}
      function safeStem(value){return String(value||'writing-assistant').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50)||'writing-assistant';}
      function datedFileName(){var d=new Date();function p(v){return String(v).padStart(2,'0');}return safeStem((state.sentence.title||state.paragraph.title||'writing-assistant')+'-backup')+'_'+d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+'-'+p(d.getMinutes())+'-'+p(d.getSeconds())+'.json';}
      function downloadText(text,name){var blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},0);}
      async function saveBackup(){commitVisibleFields();persistNow();if(window.WritingAssistantWorkspace&&window.WritingAssistantWorkspace.saveCurrentProgress)await window.WritingAssistantWorkspace.saveCurrentProgress();var custom=[],folders=[],progress=[];try{custom=await dbGetAll(LIBRARY_STORE);}catch(e){}try{folders=await dbGetAll(FOLDER_STORE);}catch(e){}try{progress=await dbGetAll(PROGRESS_STORE);}catch(e){}var backup={schemaVersion:5,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),state:state,customLibrary:custom,customFolders:folders,progressRecords:progress};var text=JSON.stringify(backup,null,2),name=datedFileName();if(backupDirectoryHandle){try{if(await folderPermission(backupDirectoryHandle,true)){var fh=await backupDirectoryHandle.getFileHandle(name,{create:true});var writable=await fh.createWritable();await writable.write(text);await writable.close();showToast('备份已保存到：'+backupDirectoryHandle.name);return;}}catch(e){}}downloadText(text,name);showToast('备份已下载到浏览器默认目录');}
      async function importBackupFile(file){var text=await file.text(),data;try{data=JSON.parse(text);}catch(e){showToast('JSON 文件无法解析');return;}if(!window.confirm('恢复备份会替换当前练习状态、自建文件夹和自建练习库，是否继续？'))return;try{if((data.schemaVersion===5||data.schemaVersion===4)&&data.state){state=data.state;state.schemaVersion=5;normalizeState();await dbClear(LIBRARY_STORE);await dbClear(FOLDER_STORE);await dbClear(PROGRESS_STORE);var items=Array.isArray(data.customLibrary)?data.customLibrary:[];for(var i=0;i<items.length;i++){items[i].builtin=false;await dbPut(LIBRARY_STORE,items[i]);}var folders=Array.isArray(data.customFolders)?data.customFolders:[];for(var f=0;f<folders.length;f++)await dbPut(FOLDER_STORE,folders[f]);var progress=Array.isArray(data.progressRecords)?data.progressRecords:[];for(var r=0;r<progress.length;r++)await dbPut(PROGRESS_STORE,progress[r]);}else if(data.schemaVersion===1&&Array.isArray(data.segments)){state=defaultState();state.sentence.title=data.title||'Imported legacy practice';state.sentence.text=data.source||data.segments.map(function(x){return x.original||'';}).join(' ');state.sentence.segments=data.segments.map(function(x){return x.original||'';});state.sentence.answers=data.segments.map(function(x){return x.writing||'';});state.sentence.notes=data.segments.map(function(x){return x.note||'';});}else throw new Error('Unsupported backup');persistNow();await refreshLibrary();if(window.WritingAssistantWorkspace&&window.WritingAssistantWorkspace.afterBackupRestore)await window.WritingAssistantWorkspace.afterBackupRestore();renderAll();showToast('备份恢复完成');}catch(e){console.error(e);showToast('备份格式不受支持');}}
      async function importLibraryFile(file){var data;try{data=JSON.parse(await file.text());}catch(e){showToast('练习库 JSON 无法解析');return;}var items=Array.isArray(data)?data:Array.isArray(data.items)?data.items:[];var accepted=0;for(var i=0;i<items.length;i++){var raw=items[i];if(!raw||!raw.title||!raw.text)continue;var item={id:raw.id&&String(raw.id).indexOf('builtin-')!==0?String(raw.id):uid(),builtin:false,title:String(raw.title),category:['IELTS','Academic','Literature','Custom'].indexOf(raw.category)>=0?raw.category:'Custom',source:String(raw.source||'Imported library'),license:String(raw.license||'Personal study'),tags:Array.isArray(raw.tags)?uniqueStrings(raw.tags.map(String)):[],text:String(raw.text),folderId:raw.folderId?String(raw.folderId):'',chapters:Array.isArray(raw.chapters)?raw.chapters:undefined,createdAt:raw.createdAt||new Date().toISOString()};if(window.WritingAssistantWorkspace&&window.WritingAssistantWorkspace.prepareImportedItem)item=window.WritingAssistantWorkspace.prepareImportedItem(item,raw)||item;await dbPut(LIBRARY_STORE,item);accepted++;}await refreshLibrary();showToast('已导入 '+accepted+' 份材料');}


      function setDataMenu(open) {
        var menu=byId('dataMenu'),button=byId('dataMenuBtn');
        if(!menu||!button)return;
        menu.hidden=!open;
        button.setAttribute('aria-expanded',open?'true':'false');
      }
      function toggleDataMenu(){setDataMenu(byId('dataMenu').hidden);}
      function updateDataMenuStatus(message){var el=byId('dataMenuStatus');if(el)el.textContent=message;}
      async function clearLocalData(){
        if(!window.confirm('确定清空这台设备上的练习、笔记和自建材料吗？内置材料会保留。建议先保存备份。'))return;
        try{
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          await dbClear(LIBRARY_STORE);
          state=defaultState();
          normalizeState();
          persistNow();
          await refreshLibrary();
          renderAll();
          setDataMenu(false);
          showToast('本地练习数据已清空');
        }catch(e){showToast('清空失败，请稍后重试');}
      }

      function bindEvents(){
        byId('dataMenuBtn').addEventListener('click',function(e){e.stopPropagation();toggleDataMenu();});
        byId('dataMenu').addEventListener('click',function(e){e.stopPropagation();});
        document.addEventListener('click',function(){setDataMenu(false);});
        document.addEventListener('keydown',function(e){if(e.key==='Escape'){setDataMenu(false);closeMaterialModal();}});
        byId('clearLocalDataBtn').addEventListener('click',function(){clearLocalData();});
        all('.lab-tab').forEach(function(btn){btn.addEventListener('click',function(){setActiveLab(this.dataset.lab);});});
        byId('openLibraryBtn').addEventListener('click',function(){setActiveLab('library');});
        byId('sentenceChooseBtn').addEventListener('click',function(){setActiveLab('library');});
        byId('paragraphChooseBtn').addEventListener('click',function(){setActiveLab('library');});
        byId('addMaterialBtn').addEventListener('click',function(){setDataMenu(false);openMaterialModal();});byId('libraryAddBtn').addEventListener('click',openMaterialModal);byId('closeMaterialModalBtn').addEventListener('click',closeMaterialModal);byId('materialModal').addEventListener('click',function(e){if(e.target===byId('materialModal'))closeMaterialModal();});
        byId('materialTextFile').addEventListener('change',function(e){var file=e.target.files&&e.target.files[0];if(!file)return;if(file.size>3*1024*1024){showToast('文件请控制在 3 MB 以内');return;}var reader=new FileReader();reader.onload=function(){byId('materialText').value=String(reader.result||'');if(!byId('materialTitle').value.trim())byId('materialTitle').value=file.name.replace(/\.[^.]+$/,'');};reader.onerror=function(){showToast('文件读取失败');};reader.readAsText(file);});
        byId('fillOriginalSampleBtn').addEventListener('click',function(){byId('materialTitle').value='Original Sample · Slow Is Fast';byId('materialCategory').value='IELTS';byId('materialSource').value='Personal original';byId('materialLicense').value='Original personal study material';byId('materialTags').value='learning, anxiety, argument';byId('materialText').value='Students often assume that rapid progress requires constant pressure, yet anxiety can reduce the attention needed for difficult learning. A steadier approach is more effective because it allows learners to review mistakes and retain knowledge over time. For example, someone preparing for a language test may improve more by completing a manageable routine every day than by attempting an exhausting schedule for one week. This does not mean that intensive practice is useless; short periods of concentrated work can be valuable when they are followed by review. Therefore, learning slowly and consistently may ultimately produce faster progress.';});
        byId('saveMaterialBtn').addEventListener('click',function(){saveMaterial().catch(function(){showToast('材料保存失败');});});
        byId('librarySearch').addEventListener('input',renderLibrary);byId('libraryCategory').addEventListener('change',renderLibrary);
        byId('importLibraryBtn').addEventListener('click',function(){byId('libraryFileInput').click();});byId('libraryFileInput').addEventListener('change',function(e){var file=e.target.files&&e.target.files[0];if(file)importLibraryFile(file).catch(function(){showToast('练习库导入失败');});e.target.value='';});

        byId('sentenceWriter').addEventListener('input',handleSentenceInput);byId('sentenceNote').addEventListener('input',function(){state.sentence.notes[state.sentence.current]=this.value;scheduleSave();});
        byId('sentenceModeSelect').addEventListener('change',function(){commitVisibleFields();state.sentence.mode=this.value;scheduleSave();renderAll();});
        byId('fontSizeSelect').addEventListener('change',function(){state.fontSize=Number(this.value)||18;scheduleSave();renderAll();});
        byId('splitModeSelect').addEventListener('change',function(){state.sentence.splitMode=this.value;scheduleSave();});
        byId('resplitBtn').addEventListener('click',function(){if(!state.sentence.text)return;if(sentenceHasWork()&&!window.confirm('重新拆分会清空当前句子答案和笔记，是否继续？'))return;var segments=splitSentenceMaterial(state.sentence.text,state.sentence.splitMode,state.sentence.targetWords).filter(function(v){return wordCount(v)>0;}).slice(0,300);state.sentence.segments=segments;state.sentence.answers=new Array(segments.length).fill('');state.sentence.notes=new Array(segments.length).fill('');state.sentence.current=0;persistNow();renderAll();showToast('已重新拆分为 '+segments.length+' 个单元');});
        byId('sentencePrevBtn').addEventListener('click',function(){if(state.sentence.current<=0)return;commitVisibleFields();state.sentence.current--;scheduleSave();renderAll();});byId('sentenceNextBtn').addEventListener('click',function(){if(state.sentence.current>=state.sentence.segments.length-1)return;commitVisibleFields();state.sentence.current++;scheduleSave();renderAll();});
        byId('copySentenceOriginalBtn').addEventListener('click',function(){copyText(state.sentence.segments[state.sentence.current]||'','原文已复制');});byId('copySentenceCurrentBtn').addEventListener('click',function(){commitVisibleFields();if(!String(state.sentence.answers[state.sentence.current]||'').trim()){showToast('本单元还没有输入');return;}copyText(buildSentenceCopy([state.sentence.current]),'已复制反馈材料，可粘贴到外部AI平台');});byId('copySentenceAllBtn').addEventListener('click',function(){commitVisibleFields();var indices=[];state.sentence.answers.forEach(function(v,i){if(String(v||'').trim())indices.push(i);});copyText(buildSentenceCopy(indices),'已复制 '+indices.length+' 个练习单元，可粘贴到外部AI平台');});

        all('.mode-tab').forEach(function(btn){btn.addEventListener('click',function(){commitVisibleFields();state.paragraph.mode=this.dataset.paragraphMode;scheduleSave();renderAll();});});
        byId('breakdownNote').addEventListener('input',function(){currentParagraphRecord().breakdownNote=this.value;scheduleSave();renderParagraphCoach();});
        all('[data-guided]').forEach(function(area){area.addEventListener('input',function(){currentParagraphRecord().guided[this.dataset.guided]=this.value;scheduleSave();updateGuidedPreview();renderLeftPanel();});});
        byId('transferTopic').addEventListener('input',function(){currentParagraphRecord().transfer.topic=this.value;scheduleSave();});byId('transferWriter').addEventListener('input',function(){currentParagraphRecord().transfer.writing=this.value;scheduleSave();renderParagraphCoach();renderLeftPanel();});
        byId('independentPrompt').addEventListener('input',function(){currentParagraphRecord().independent.prompt=this.value;scheduleSave();});byId('hintLevelSelect').addEventListener('change',function(){currentParagraphRecord().independent.hintLevel=this.value;scheduleSave();renderIndependent();});byId('independentWriter').addEventListener('input',function(){currentParagraphRecord().independent.writing=this.value;scheduleSave();renderParagraphCoach();renderLeftPanel();});
        byId('paragraphPrevBtn').addEventListener('click',function(){if(state.paragraph.current<=0)return;commitVisibleFields();state.paragraph.current--;scheduleSave();renderAll();});byId('paragraphNextBtn').addEventListener('click',function(){if(state.paragraph.current>=state.paragraph.paragraphs.length-1)return;commitVisibleFields();state.paragraph.current++;scheduleSave();renderAll();});
        byId('copySourceParagraphBtn').addEventListener('click',function(){copyText(state.paragraph.paragraphs[state.paragraph.current]||'','原段落已复制');});byId('copyParagraphCurrentBtn').addEventListener('click',function(){commitVisibleFields();copyText(currentParagraphCopy(state.paragraph.current),'已复制当前段落反馈材料，可粘贴到外部AI平台');});byId('copyParagraphAllBtn').addEventListener('click',function(){commitVisibleFields();var parts=[];state.paragraph.records.forEach(function(rec,index){if(paragraphRecordStarted(rec))parts.push(currentParagraphCopy(index));});copyText(parts.join('\n\n====================\n\n'),'已复制 '+parts.length+' 个段落训练，可粘贴到外部AI平台');});

        byId('chooseFolderBtn').addEventListener('click',function(){setDataMenu(false);chooseBackupDirectory();});byId('saveBackupBtn').addEventListener('click',function(){setDataMenu(false);saveBackup().catch(function(){showToast('备份保存失败');});});byId('importBackupBtn').addEventListener('click',function(){setDataMenu(false);byId('backupFileInput').click();});byId('backupFileInput').addEventListener('change',function(e){var file=e.target.files&&e.target.files[0];if(file)importBackupFile(file).catch(function(){showToast('备份导入失败');});e.target.value='';});
        document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMaterialModal();if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();if(state.activeLab==='sentence')byId('copySentenceAllBtn').click();else if(state.activeLab==='paragraph')byId('copyParagraphCurrentBtn').click();}});
      }

      window.WritingAssistantCore={
        version:APP_VERSION,
        stores:{library:LIBRARY_STORE,handles:HANDLE_STORE,folders:FOLDER_STORE,progress:PROGRESS_STORE},
        getState:function(){return state;},
        replaceState:function(next){state=next||defaultState();normalizeState();},
        getLibrary:function(){return libraryCache;},
        getBuiltinLibrary:function(){return BUILTIN_LIBRARY;},
        helpers:{byId:byId,all:all,clamp:clamp,normalizeSpace:normalizeSpace,wordCount:wordCount,escapeHtml:escapeHtml,uid:uid,uniqueStrings:uniqueStrings,sentenceSplit:sentenceSplit,paragraphSplit:paragraphSplit,splitSentenceMaterial:splitSentenceMaterial,emptyParagraphRecord:emptyParagraphRecord},
        db:{get:dbGet,getAll:dbGetAll,put:dbPut,delete:dbDelete,clear:dbClear},
        actions:{renderAll:renderAll,renderLeftPanel:renderLeftPanel,renderSentenceLab:renderSentenceLab,renderParagraphLab:renderParagraphLab,renderLibrary:renderLibrary,refreshLibrary:refreshLibrary,commitVisibleFields:commitVisibleFields,persistNow:persistNow,scheduleSave:scheduleSave,showToast:showToast,copyText:copyText,findLibraryItem:findLibraryItem,loadSentenceItem:loadSentenceItem,loadParagraphItem:loadParagraphItem,sentenceDone:sentenceDone,paragraphRecordStarted:paragraphRecordStarted,paragraphRecordDone:paragraphRecordDone,roleLabel:roleLabel,skeletonFromRecord:skeletonFromRecord}
      };

      loadState();
      bindEvents();
      refreshLibrary().then(function(){renderAll();});
      initializeFolder();
    })();
