// Project source-mode v2: a work is created as either Manual or Google Docs.
// Manual works only add manual articles. Google works retain document provenance,
// can refresh the whole source, and may also contain manual articles that are never
// removed or overwritten by source refresh.
(function () {
  const TOKEN_KEY = 'storyflow.google.access-token.v1';
  let syncing = false;
  let pendingDiff = null;
  let confirmContext = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[char]));

  function normalizeTitle(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeDraft(value) {
    return String(value || '').replace(/\r\n/g, '\n').trimEnd();
  }

  function scopeKey(scope) {
    return `${scope?.docId || ''}::${scope?.tabId || ''}`;
  }

  function sourceScope(source) {
    if (!source?.id || !source?.tabId) return null;
    return {
      docId: source.id,
      docName: source.name || 'Google Docs',
      docUrl: source.url || '',
      tabId: source.tabId,
      tabTitle: source.tabTitle || '未命名分頁'
    };
  }

  function meaningfulManualChapter(chapter) {
    return Boolean(
      chapter && !chapter.source && !chapter.detachedSource
      && (String(chapter.draft || '').trim() || (chapter.parts || []).length)
    );
  }

  function isBlankStarter() {
    if (!Array.isArray(state?.chapters) || state.chapters.length !== 1) return false;
    const chapter = state.chapters[0];
    return Boolean(chapter && !chapter.source && !chapter.detachedSource
      && !String(chapter.draft || '').trim() && !(chapter.parts || []).length);
  }

  function inferGoogleMetadata() {
    const scopes = Array.isArray(state?.sourceScopes) ? state.sourceScopes : [];
    const source = (state?.chapters || [])
      .flatMap(chapter => [chapter?.source, chapter?.detachedSource])
      .find(item => item?.id && item?.tabId);
    const scope = scopes.find(item => item?.docId && item?.tabId);
    if (!source && !scope) return null;
    return {
      type: 'google',
      docId: source?.id || scope?.docId || '',
      docName: source?.name || scope?.docName || 'Google Docs',
      docUrl: source?.url || scope?.docUrl || '',
      syncedAt: source?.syncedAt || null
    };
  }

  function projectMode({ migrate = true } = {}) {
    const explicit = state?.projectSource?.type;
    if (explicit === 'google' || explicit === 'manual') return explicit;

    const google = inferGoogleMetadata();
    if (google) {
      if (migrate) {
        state.projectSource = google;
        try { saveState(); } catch (_) {}
      }
      return 'google';
    }

    const hasManual = (state?.chapters || []).some(meaningfulManualChapter);
    if (hasManual) {
      if (migrate) {
        state.projectSource = { type: 'manual' };
        try { saveState(); } catch (_) {}
      }
      return 'manual';
    }
    return null;
  }

  function ensureScopesFromChapters() {
    const map = new Map((Array.isArray(state?.sourceScopes) ? state.sourceScopes : [])
      .filter(scope => scope?.docId && scope?.tabId)
      .map(scope => [scopeKey(scope), { ...scope }]));

    for (const chapter of state?.chapters || []) {
      for (const source of [chapter?.source, chapter?.detachedSource]) {
        const scope = sourceScope(source);
        if (scope) map.set(scopeKey(scope), { ...map.get(scopeKey(scope)), ...scope });
      }
    }
    state.sourceScopes = [...map.values()];
    return state.sourceScopes;
  }

  function setManualMode() {
    if (projectMode({ migrate: false }) === 'google') return;
    state.projectSource = { type: 'manual' };
    state.sourceScopes = [];
    saveState('已選擇手動建立');
    renderAll();
    requestAnimationFrame(() => {
      syncUi();
      const title = document.getElementById('projectTitle');
      title?.focus();
      title?.select();
    });
  }

  function startGoogleMode() {
    if (projectMode({ migrate: false }) === 'manual') return;
    if (typeof window.importGoogleDoc === 'function') window.importGoogleDoc();
    else notify('Google Docs 載入功能尚未準備完成', true);
  }

  function projectSourceName() {
    const meta = state?.projectSource || inferGoogleMetadata();
    return meta?.docName || 'Google Docs';
  }

  function ensureModeUi() {
    const panel = document.querySelector('.source-panel');
    if (!panel) return null;
    panel.classList.add('project-source-mode-v2');

    // Remove the older mixed-purpose action row. Source mode v2 owns this area.
    document.getElementById('sourcePanelActions')?.remove();
    document.getElementById('manualSourceSyncHint')?.remove();

    const head = panel.querySelector(':scope > .panel-head');
    const titleLabel = panel.querySelector('label[for="projectTitle"]');
    const titleInput = document.getElementById('projectTitle');
    if (!head || !titleLabel || !titleInput) return panel;

    let chooser = document.getElementById('projectCreationChooser');
    if (!chooser) {
      chooser = document.createElement('section');
      chooser.id = 'projectCreationChooser';
      chooser.className = 'project-creation-chooser';
      chooser.setAttribute('aria-labelledby', 'projectCreationChooserTitle');
      chooser.innerHTML = `
        <div class="project-creation-copy">
          <strong id="projectCreationChooserTitle">選擇作品建立方式</strong>
          <span>建立後會固定使用這種來源模式，讓後續操作保持一致。</span>
        </div>
        <div class="project-creation-options">
          <button id="createProjectFromGoogle" class="project-creation-option" type="button">
            <span class="project-creation-option-icon" aria-hidden="true">G</span>
            <span class="project-creation-option-copy"><strong>從 Google Docs 建立</strong><small>帶入作品名稱與章節，之後可更新整個作品來源。</small></span>
            <span class="project-creation-option-arrow" aria-hidden="true">›</span>
          </button>
          <button id="createProjectManually" class="project-creation-option" type="button">
            <span class="project-creation-option-icon" aria-hidden="true">＋</span>
            <span class="project-creation-option-copy"><strong>手動建立</strong><small>作品名稱自行編輯，文章一篇一篇手動新增。</small></span>
            <span class="project-creation-option-arrow" aria-hidden="true">›</span>
          </button>
        </div>`;
      head.insertAdjacentElement('afterend', chooser);
      chooser.querySelector('#createProjectFromGoogle').addEventListener('click', startGoogleMode);
      chooser.querySelector('#createProjectManually').addEventListener('click', setManualMode);
    }

    let origin = document.getElementById('projectSourceOrigin');
    if (!origin) {
      origin = document.createElement('div');
      origin.id = 'projectSourceOrigin';
      origin.className = 'project-source-origin';
      origin.innerHTML = `
        <div class="project-source-origin-copy">
          <span class="project-source-origin-label">Google Docs 來源</span>
          <span id="projectSourceOriginName" class="project-source-origin-name"></span>
        </div>
        <button id="projectRefreshSourceBtnV2" class="button ghost project-source-refresh-v2" type="button">更新作品來源</button>`;
      titleInput.insertAdjacentElement('afterend', origin);
      origin.querySelector('#projectRefreshSourceBtnV2').addEventListener('click', refreshWholeProjectV2);
    }

    const add = document.getElementById('addChapterBtn');
    if (add) add.textContent = '＋ 新增文章';
    return panel;
  }

  function syncBlankChapterPresentation(mode) {
    const list = document.getElementById('chapterList');
    if (!list || mode === null || !isBlankStarter()) return;
    list.innerHTML = '<div class="project-source-empty-articles">尚未新增文章</div>';
  }

  function syncUi() {
    const panel = ensureModeUi();
    if (!panel) return;
    const mode = projectMode();
    panel.classList.toggle('project-source-unset', mode === null);
    panel.classList.toggle('project-source-manual', mode === 'manual');
    panel.classList.toggle('project-source-google', mode === 'google');

    const chooser = document.getElementById('projectCreationChooser');
    const origin = document.getElementById('projectSourceOrigin');
    const add = document.getElementById('addChapterBtn');
    const originName = document.getElementById('projectSourceOriginName');
    if (chooser) chooser.hidden = mode !== null;
    if (origin) origin.hidden = mode !== 'google';
    if (add) add.hidden = mode === null;
    if (originName && mode === 'google') originName.textContent = projectSourceName();

    syncBlankChapterPresentation(mode);
    ensureStyleLast();
  }

  function markConfirmedPreview() {
    const target = document.getElementById('confirmSourcePreviewBtn');
    if (!target) return;
    if (target.dataset.sourceModeV2Bound === '1') return;
    target.dataset.sourceModeV2Bound = '1';
    target.addEventListener('click', () => {
      const summaryText = document.getElementById('sourcePreviewSummary')?.textContent || '';
      confirmContext = {
        wasUnset: projectMode({ migrate: false }) === null,
        google: /Google Docs/.test(summaryText),
        manual: /手動內容/.test(summaryText),
        docTitle: window.pendingGoogleDoc?.title || window.pendingGoogleDoc?.name || '',
        docId: window.pendingGoogleDoc?.id || '',
        docName: window.pendingGoogleDoc?.name || window.pendingGoogleDoc?.title || '',
        docUrl: window.pendingGoogleDoc?.url || ''
      };
      window.setTimeout(finalizeConfirmedPreview, 0);
    }, true);
  }

  function finalizeConfirmedPreview() {
    const context = confirmContext;
    confirmContext = null;
    if (!context) return;

    const google = inferGoogleMetadata();
    if (context.google && google) {
      const firstSource = (state.chapters || []).map(chapter => chapter.source).find(Boolean);
      state.projectSource = {
        type: 'google',
        docId: firstSource?.id || context.docId || google.docId,
        docName: context.docTitle || firstSource?.name || context.docName || google.docName || 'Google Docs',
        docUrl: firstSource?.url || context.docUrl || google.docUrl || '',
        syncedAt: firstSource?.syncedAt || new Date().toISOString()
      };
      ensureScopesFromChapters();
      if (context.wasUnset && (context.docTitle || context.docName)) {
        state.projectTitle = context.docTitle || context.docName;
      }
      saveState('Google Docs 作品已建立');
      renderAll();
    } else if (context.manual && context.wasUnset) {
      state.projectSource = { type: 'manual' };
      state.sourceScopes = [];
      saveState('手動作品已建立');
      renderAll();
    }
    syncUi();
  }

  async function accessToken() {
    if (!StoryFlowIntegrations.hasGoogleToken?.()) {
      await StoryFlowIntegrations.restoreGoogleAccess?.();
    }
    let token = '';
    try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) {}
    if (!token) throw new Error('Google 登入已失效，請重新登入後再更新作品來源。');
    return token;
  }

  async function fetchGoogleDocument(fileId) {
    const token = await accessToken();
    const response = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}?includeTabsContent=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 401) {
      window.StoryFlowSessionAuth?.forgetSession?.();
      window.StoryFlowSessionAuth?.syncSignedOutUi?.();
      throw new Error('Google 登入已失效，請重新登入後再試一次。');
    }
    if (!response.ok) throw new Error(`Google Docs 讀取失敗（${response.status}）`);
    return response.json();
  }

  function escapeMarkdown(text) {
    return String(text || '').replace(/([\\`])/g, '\\$1');
  }

  function styleText(text, style, warnings) {
    let value = escapeMarkdown(text);
    if (!value) return '';
    if (style?.weightedFontFamily?.fontFamily) warnings.add('原稿含有字型設定；StoryFlow 會保留文字內容，但不保存字型。');
    if (style?.strikethrough) value = `~~${value}~~`;
    if (style?.bold && style?.italic) value = `***${value}***`;
    else if (style?.bold) value = `**${value}**`;
    else if (style?.italic) value = `*${value}*`;
    if (style?.link?.url) value = `[${value}](${style.link.url})`;
    return value;
  }

  function paragraphToBlock(paragraph, inlineObjects, warnings) {
    const namedStyle = paragraph?.paragraphStyle?.namedStyleType || 'NORMAL_TEXT';
    let markdown = '';
    let plain = '';
    for (const element of paragraph?.elements || []) {
      if (element.textRun) {
        const text = (element.textRun.content || '').replace(/\n$/, '');
        markdown += styleText(text, element.textRun.textStyle || {}, warnings);
        plain += text;
      } else if (element.inlineObjectElement) {
        const objectId = element.inlineObjectElement.inlineObjectId;
        const object = inlineObjects?.[objectId];
        const title = object?.inlineObjectProperties?.embeddedObject?.title || '圖片';
        markdown += `![${title}](storyflow-google-image:${objectId})`;
        plain += '[圖片]';
        warnings.add('原稿含有 Google Docs 內嵌圖片；目前會保留圖片位置。');
      }
    }
    return { markdown: markdown.trimEnd(), plain: plain.trimEnd(), namedStyle, empty: !plain.trim() && !markdown.trim() };
  }

  function detectChapterHeadingStyle(blocks) {
    const counts = new Map();
    for (const block of blocks) {
      const match = /^HEADING_([1-6])$/.exec(block.namedStyle || '');
      if (!match || block.empty) continue;
      const level = Number(match[1]);
      counts.set(level, (counts.get(level) || 0) + 1);
    }
    const levels = [...counts.keys()].sort((a, b) => a - b);
    if (!levels.length) return null;
    const repeated = levels.find(level => counts.get(level) >= 2);
    return `HEADING_${repeated ?? levels[0]}`;
  }

  function blocksToDraft(blocks, chapterHeadingStyle = null) {
    const lines = [];
    for (const block of blocks) {
      if (block.empty) {
        if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      } else if (!chapterHeadingStyle || block.namedStyle !== chapterHeadingStyle) {
        lines.push(block.markdown);
      }
    }
    while (lines[0] === '') lines.shift();
    while (lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  function chaptersFromTab(tab) {
    const content = tab?.documentTab?.body?.content || [];
    const inlineObjects = tab?.documentTab?.inlineObjects || {};
    const warnings = new Set();
    const blocks = [];
    for (const structural of content) {
      if (structural.paragraph) blocks.push(paragraphToBlock(structural.paragraph, inlineObjects, warnings));
    }
    const headingStyle = detectChapterHeadingStyle(blocks);
    const headingIndexes = [];
    if (headingStyle) {
      blocks.forEach((block, index) => {
        if (block.namedStyle === headingStyle && !block.empty) headingIndexes.push(index);
      });
    }
    if (!headingIndexes.length) {
      return {
        chapters: [{ title: tab.tabProperties?.title || '未命名章節', draft: blocksToDraft(blocks), headingOrdinal: null }],
        warnings: [...warnings]
      };
    }
    return {
      chapters: headingIndexes.map((start, ordinal) => ({
        title: blocks[start].plain.trim() || `第 ${ordinal + 1} 章`,
        draft: blocksToDraft(blocks.slice(start + 1, headingIndexes[ordinal + 1] ?? blocks.length), headingStyle),
        headingOrdinal: ordinal,
        headingStyle
      })),
      warnings: [...warnings]
    };
  }

  function flattenTabs(tabs, depth = 0, output = []) {
    for (const tab of tabs || []) {
      const parsed = chaptersFromTab(tab);
      output.push({
        id: tab.tabProperties?.tabId,
        title: tab.tabProperties?.title || '未命名分頁',
        depth,
        chapters: parsed.chapters,
        warnings: parsed.warnings
      });
      flattenTabs(tab.childTabs || [], depth + 1, output);
    }
    return output;
  }

  function blockSignature(block) {
    return `${block?.raw || ''}\u0000${block?.strongBoundaryAfter ? '1' : '0'}`;
  }

  function confirmedRangeChanged(chapter, nextDraft) {
    const confirmed = Number(chapter?.confirmedBlockCount || 0);
    if (!confirmed) return false;
    const before = parseBlocks(chapter.draft || '');
    const after = parseBlocks(nextDraft || '');
    if (before.length < confirmed || after.length < confirmed) return true;
    for (let index = 0; index < confirmed; index += 1) {
      if (blockSignature(before[index]) !== blockSignature(after[index])) return true;
    }
    return false;
  }

  function chapterBelongsToScope(chapter, scope) {
    const source = chapter?.source || chapter?.detachedSource;
    return source?.id === scope.docId && source?.tabId === scope.tabId;
  }

  function findMatch(incoming, workspaceChapters, used) {
    const incomingTitle = normalizeTitle(incoming.title);
    let match = workspaceChapters.find(chapter => {
      if (used.has(chapter.id)) return false;
      const source = chapter.source || chapter.detachedSource;
      return normalizeTitle(source?.headingTitle) === incomingTitle || normalizeTitle(chapter.title) === incomingTitle;
    });
    if (match) return match;
    if (incoming.headingOrdinal != null) {
      match = workspaceChapters.find(chapter => {
        if (used.has(chapter.id)) return false;
        const source = chapter.source || chapter.detachedSource;
        return source?.headingOrdinal === incoming.headingOrdinal;
      });
    }
    return match || null;
  }

  function sourceMeta(scope, incoming) {
    return {
      id: scope.docId,
      name: scope.docName || 'Google Docs',
      url: scope.docUrl || `https://docs.google.com/document/d/${scope.docId}/edit`,
      tabId: scope.tabId,
      tabTitle: scope.tabTitle,
      headingOrdinal: incoming.headingOrdinal,
      headingTitle: incoming.title,
      headingStyle: incoming.headingStyle || null,
      syncedAt: new Date().toISOString()
    };
  }

  function buildScopeDiff(scope, tab) {
    const workspaceChapters = (state.chapters || []).filter(chapter => chapterBelongsToScope(chapter, scope));
    const used = new Set();
    const changes = [];
    const syncedScope = { ...scope, tabTitle: tab.title || scope.tabTitle };

    for (const incoming of tab.chapters || []) {
      const match = findMatch(incoming, workspaceChapters, used);
      if (!match) {
        changes.push({
          id: crypto.randomUUID(), kind: 'add', selected: true, scope: syncedScope, incoming,
          label: '工作區缺少章節', detail: `重新加入「${incoming.title}」`, confirmedChanged: false
        });
        continue;
      }
      used.add(match.id);
      const detached = !match.source && Boolean(match.detachedSource);
      const preview = StoryFlowSourceDiff.compareChapter(match, incoming, { countChars: charCount });
      const { draftChanged, titleChanged } = preview;
      if (detached) {
        changes.push({
          id: crypto.randomUUID(), kind: 'relink', selected: false, scope: syncedScope, incoming, chapterId: match.id,
          label: '章節已解除來源連結', detail: `可重新連結「${match.title}」${draftChanged || titleChanged ? '並套用來源內容' : ''}`,
          confirmedChanged: (draftChanged || titleChanged) && confirmedRangeChanged(match, incoming.draft), preview
        });
      } else if (draftChanged || titleChanged) {
        changes.push({
          id: crypto.randomUUID(), kind: 'update', selected: true, scope: syncedScope, incoming, chapterId: match.id,
          label: '來源內容有更新', detail: StoryFlowSourceDiff.summaryText(preview),
          confirmedChanged: confirmedRangeChanged(match, incoming.draft), preview
        });
      }
    }

    for (const chapter of workspaceChapters) {
      if (used.has(chapter.id)) continue;
      changes.push({
        id: crypto.randomUUID(), kind: 'source-missing', selected: false, scope: syncedScope, chapterId: chapter.id,
        label: '來源找不到對應章節', detail: `「${chapter.title}」會保留在工作區，不會自動刪除。`, confirmedChanged: false
      });
    }
    return changes;
  }

  async function buildProjectDiff() {
    const scopes = ensureScopesFromChapters();
    if (!scopes.length) throw new Error('目前作品還沒有已連結的 Google Docs 來源。');

    const docs = new Map();
    for (const scope of scopes) {
      if (!docs.has(scope.docId)) docs.set(scope.docId, await fetchGoogleDocument(scope.docId));
    }

    const changes = [];
    const errors = [];
    for (const scope of scopes) {
      const doc = docs.get(scope.docId);
      const tabs = flattenTabs(doc?.tabs || []);
      const tab = tabs.find(item => item.id === scope.tabId);
      if (!tab) {
        errors.push(`${scope.docName} › ${scope.tabTitle}：來源分頁已不存在，工作區內容保持不變。`);
        continue;
      }
      const syncedScope = { ...scope, docName: doc.title || scope.docName, tabTitle: tab.title || scope.tabTitle };
      changes.push(...buildScopeDiff(syncedScope, tab));
    }

    for (const chapter of state.chapters || []) {
      if (!meaningfulManualChapter(chapter)) continue;
      changes.push({
        id: crypto.randomUUID(), kind: 'manual', selected: false, chapterId: chapter.id,
        label: '手動文章', detail: `「${chapter.title}」不參與 Google Docs 更新，會完整保留。`, confirmedChanged: false
      });
    }
    return { changes, errors, checkedAt: new Date().toISOString() };
  }

  function ensureDiffDialog() {
    let dialog = document.getElementById('projectSourceDiffDialogV2');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'projectSourceDiffDialogV2';
    dialog.className = 'project-source-diff-dialog';
    dialog.innerHTML = `
      <div class="project-source-diff-card">
        <header class="project-source-diff-head">
          <div><p class="eyebrow">SOURCE / PROJECT SYNC</p><h3>更新作品來源</h3><p class="muted">Google Docs 章節可以更新；手動文章永遠保留，不參與來源比對。</p></div>
          <button id="closeProjectSourceDiffV2" class="icon-button" type="button" aria-label="關閉">×</button>
        </header>
        <div id="projectSourceDiffSummaryV2" class="project-source-diff-summary"></div>
        <div id="projectSourceDiffErrorsV2" class="project-source-diff-errors hidden"></div>
        <div class="project-source-diff-toolbar">
          <button id="selectAllProjectSourceChangesV2" class="button tiny ghost" type="button">選取可套用變更</button>
          <button id="clearProjectSourceChangesV2" class="button tiny ghost" type="button">全部取消</button>
        </div>
        <div id="projectSourceDiffListV2" class="project-source-diff-list"></div>
        <footer class="project-source-diff-actions">
          <button id="cancelProjectSourceDiffV2" class="button ghost" type="button">先不要更新</button>
          <button id="applyProjectSourceDiffV2" class="button primary" type="button">套用所選變更</button>
        </footer>
      </div>`;
    document.body.appendChild(dialog);

    const close = () => { pendingDiff = null; dialog.close(); };
    dialog.querySelector('#closeProjectSourceDiffV2').onclick = close;
    dialog.querySelector('#cancelProjectSourceDiffV2').onclick = close;
    dialog.querySelector('#selectAllProjectSourceChangesV2').onclick = () => {
      if (!pendingDiff) return;
      pendingDiff.changes.forEach(change => {
        if (['add','update','relink'].includes(change.kind)) change.selected = true;
      });
      renderDiffDialog();
    };
    dialog.querySelector('#clearProjectSourceChangesV2').onclick = () => {
      if (!pendingDiff) return;
      pendingDiff.changes.forEach(change => { change.selected = false; });
      renderDiffDialog();
    };
    dialog.querySelector('#applyProjectSourceDiffV2').onclick = applySelectedChanges;
    return dialog;
  }

  function changeBadge(change) {
    if (change.kind === 'add') return ['缺少', 'missing'];
    if (change.kind === 'update') return ['更新', 'changed'];
    if (change.kind === 'relink') return ['可重連', 'relink'];
    if (change.kind === 'manual') return ['手動', 'manual'];
    return ['保留', 'warning'];
  }

  function renderDiffDialog() {
    const dialog = ensureDiffDialog();
    const summary = dialog.querySelector('#projectSourceDiffSummaryV2');
    const errors = dialog.querySelector('#projectSourceDiffErrorsV2');
    const list = dialog.querySelector('#projectSourceDiffListV2');
    const apply = dialog.querySelector('#applyProjectSourceDiffV2');
    const changes = pendingDiff?.changes || [];
    const actionable = changes.filter(change => ['add','update','relink'].includes(change.kind));
    const selected = actionable.filter(change => change.selected);
    const manual = changes.filter(change => change.kind === 'manual');
    const sourceRows = changes.filter(change => change.kind !== 'manual');

    const added = changes.filter(change => change.kind === 'add').length;
    const updated = changes.filter(change => change.kind === 'update').length;
    const relink = changes.filter(change => change.kind === 'relink').length;
    const missing = changes.filter(change => change.kind === 'source-missing').length;

    if (!sourceRows.length && !(pendingDiff?.errors || []).length) {
      summary.innerHTML = `<strong>作品來源已是最新狀態</strong><span>${manual.length ? `另有 ${manual.length} 篇手動文章，更新時會保留。` : 'Google Docs 與目前工作區沒有差異。'}</span>`;
    } else {
      summary.innerHTML = `<strong>來源差異 ${sourceRows.length} 項</strong><span>${added} 個缺少章節 · ${updated} 個內容更新 · ${relink} 個可重新連結 · ${missing} 個來源缺少對應${manual.length ? ` · ${manual.length} 篇手動文章保留` : ''}</span>`;
    }

    const errorItems = pendingDiff?.errors || [];
    errors.classList.toggle('hidden', !errorItems.length);
    errors.innerHTML = errorItems.map(item => `<div>${esc(item)}</div>`).join('');

    list.innerHTML = '';
    changes.forEach(change => {
      const [badgeText, badgeClass] = changeBadge(change);
      const readonly = change.kind === 'source-missing' || change.kind === 'manual';
      const row = document.createElement('article');
      row.className = `project-source-diff-row ${readonly ? 'readonly' : ''} ${change.kind === 'manual' ? 'manual-row' : ''}`;
      const context = change.kind === 'manual'
        ? 'StoryFlow · 手動建立'
        : `${esc(change.scope?.docName || 'Google Docs')} › ${esc(change.scope?.tabTitle || '未命名分頁')}`;
      row.innerHTML = `
        <label class="project-source-diff-select">
          <input type="checkbox" ${change.selected ? 'checked' : ''} ${readonly ? 'disabled' : ''} />
          <span class="project-source-diff-badge ${badgeClass}">${badgeText}</span>
          <span class="project-source-diff-copy">
            <strong>${esc(change.label)}</strong>
            <span>${context} · ${esc(change.detail)}</span>
            ${change.confirmedChanged ? '<em>包含已確認發布範圍；既有 Markdown／發布狀態不會自動改寫。</em>' : ''}
          </span>
        </label>
        ${StoryFlowSourceDiff.renderPreviewHtml(change.preview)}`;
      const checkbox = row.querySelector('input');
      if (checkbox && !checkbox.disabled) {
        checkbox.addEventListener('change', () => {
          change.selected = checkbox.checked;
          renderDiffDialog();
        });
      }
      list.appendChild(row);
    });

    apply.disabled = selected.length === 0;
    apply.textContent = selected.length ? `套用所選 ${selected.length} 項變更` : '沒有選取變更';
  }

  function insertRestoredChapter(chapter, scope, headingOrdinal) {
    const chapters = state.chapters || [];
    let lastSameScope = -1;
    for (let index = 0; index < chapters.length; index += 1) {
      const existing = chapters[index];
      const source = existing?.source || existing?.detachedSource;
      if (source?.id !== scope.docId || source?.tabId !== scope.tabId) continue;
      const ordinal = Number.isFinite(source.headingOrdinal) ? source.headingOrdinal : Number.MAX_SAFE_INTEGER;
      if (headingOrdinal != null && ordinal > headingOrdinal) {
        chapters.splice(index, 0, chapter);
        return;
      }
      lastSameScope = index;
    }
    if (lastSameScope >= 0) chapters.splice(lastSameScope + 1, 0, chapter);
    else chapters.push(chapter);
  }

  async function applySelectedChanges() {
    if (!pendingDiff) return;
    const selected = pendingDiff.changes.filter(change => change.selected && ['add','update','relink'].includes(change.kind));
    if (!selected.length) return;
    const affectsConfirmed = selected.some(change => change.confirmedChanged);
    if (affectsConfirmed) {
      const ok = confirm('所選更新包含已確認發布範圍。\n\nStoryFlow 會更新工作區原稿，但既有 Markdown 與發布狀態保持不變。確定套用？');
      if (!ok) return;
    }

    let added = 0;
    let updated = 0;
    for (const change of selected) {
      const incoming = change.incoming;
      if (change.kind === 'add') {
        insertRestoredChapter({
          id: crypto.randomUUID(),
          title: incoming.title || '未命名章節',
          draft: normalizeDraft(incoming.draft),
          confirmedBlockCount: 0,
          parts: [],
          source: sourceMeta(change.scope, incoming)
        }, change.scope, incoming.headingOrdinal);
        added += 1;
        continue;
      }

      const chapter = (state.chapters || []).find(item => item.id === change.chapterId);
      if (!chapter) continue;
      chapter.title = incoming.title || chapter.title;
      chapter.draft = normalizeDraft(incoming.draft);
      chapter.source = sourceMeta(change.scope, incoming);
      delete chapter.detachedSource;
      updated += 1;
    }

    const scopeMap = new Map(ensureScopesFromChapters().map(item => [scopeKey(item), item]));
    for (const change of pendingDiff.changes) {
      if (!change.scope?.docId || !change.scope?.tabId) continue;
      scopeMap.set(scopeKey(change.scope), { ...scopeMap.get(scopeKey(change.scope)), ...change.scope });
    }
    state.sourceScopes = [...scopeMap.values()];
    state.projectSource = {
      ...(state.projectSource || {}),
      type: 'google',
      syncedAt: new Date().toISOString()
    };

    pendingDiff = null;
    suggestion = null;
    document.getElementById('projectSourceDiffDialogV2')?.close();
    saveState('作品來源已更新');
    renderAll();
    syncUi();
    if (activeChapter()?.draft) suggestNextPart();
    notify(`作品來源已更新：重新加入 ${added} 個章節，更新 ${updated} 個章節；手動文章保持不變`);
  }

  async function refreshWholeProjectV2() {
    if (syncing) return;
    if (projectMode() !== 'google') return;
    syncing = true;
    const button = document.getElementById('projectRefreshSourceBtnV2');
    if (button) {
      button.disabled = true;
      button.textContent = '檢查中…';
    }
    try {
      notify('正在比較整個作品與 Google Docs…');
      pendingDiff = await buildProjectDiff();
      renderDiffDialog();
      ensureDiffDialog().showModal();
    } catch (error) {
      pendingDiff = null;
      notify(`作品來源檢查失敗：${error.message}`, true);
    } finally {
      syncing = false;
      if (button) {
        button.disabled = false;
        button.textContent = '更新作品來源';
      }
    }
  }

  function ensureStyleLast() {
    const link = document.getElementById('storyflowProjectSourceModeV2Css');
    if (link && link.parentElement === document.head && document.head.lastElementChild !== link) {
      document.head.appendChild(link);
    }
  }

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function' && !baseRenderAll.__projectSourceModeV2) {
    const wrapped = function (...args) {
      const result = baseRenderAll.apply(this, args);
      queueMicrotask(syncUi);
      return result;
    };
    wrapped.__projectSourceModeV2 = true;
    window.renderAll = wrapped;
  }

  window.addEventListener('storyflow:projects-changed', () => queueMicrotask(syncUi));
  window.addEventListener('storyflow:view-changed', () => queueMicrotask(syncUi));
  document.addEventListener('change', event => {
    if (event.target?.id === 'projectTitle') queueMicrotask(syncUi);
  });

  markConfirmedPreview();
  syncUi();
  window.StoryFlowProjectSourceModeV2 = {
    mode: () => projectMode(),
    chooseManual: setManualMode,
    chooseGoogle: startGoogleMode,
    refresh: refreshWholeProjectV2,
    syncUi
  };
})();
