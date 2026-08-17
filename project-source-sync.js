// Whole-project Google Docs sync: compare every linked source scope before applying changes.
// This intentionally treats Google Docs as source-of-truth input while preserving local
// publishing history. Missing workspace chapters can be restored; source-side deletions
// never silently delete local work.
(function () {
  const TOKEN_KEY = 'storyflow.google.access-token.v1';
  let pendingDiff = null;
  let syncing = false;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  }

  function normalizeTitle(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeDraft(value) {
    return String(value || '').replace(/\r\n/g, '\n').trimEnd();
  }

  function scopeKey(scope) {
    return `${scope.docId || ''}::${scope.tabId || ''}`;
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

  function ensureSourceScopes({ persist = false } = {}) {
    const current = Array.isArray(state.sourceScopes) ? state.sourceScopes : [];
    const map = new Map(current.filter(item => item?.docId && item?.tabId).map(item => [scopeKey(item), { ...item }]));
    for (const chapter of state.chapters || []) {
      for (const source of [chapter?.source, chapter?.detachedSource]) {
        const scope = sourceScope(source);
        if (scope) map.set(scopeKey(scope), { ...map.get(scopeKey(scope)), ...scope });
      }
    }
    const next = [...map.values()];
    const before = JSON.stringify(current);
    const after = JSON.stringify(next);
    state.sourceScopes = next;
    if (persist && before !== after) saveState('來源範圍已更新');
    return next;
  }

  function syncSourcePanelUi() {
    const scopes = ensureSourceScopes();
    const refresh = document.getElementById('refreshSourceBtn');
    if (refresh) {
      const shouldHide = !scopes.length;
      const shouldDisable = !scopes.length || syncing;
      const nextText = syncing ? '檢查中…' : '更新作品來源';
      if (refresh.hidden !== shouldHide) refresh.hidden = shouldHide;
      if (refresh.disabled !== shouldDisable) refresh.disabled = shouldDisable;
      if (refresh.textContent !== nextText) refresh.textContent = nextText;
      refresh.setAttribute('aria-label', '檢查整個作品的 Google Docs 來源差異');
      refresh.title = '比較整個作品與已連結 Google Docs 的差異';
    }

    const label = document.querySelector('.source-panel label[for="projectTitle"]');
    if (label && label.textContent !== '作品名稱') label.textContent = '作品名稱';

    // Work switching belongs to the dedicated Works page. The workspace only edits
    // the active work, so a second "current work" selector is redundant and was a
    // source of stale-title confusion.
    const switcher = document.getElementById('projectSwitcher');
    if (switcher && !switcher.hidden) switcher.hidden = true;
  }

  function syncLoadSourceDialogUi() {
    const scopes = ensureSourceScopes();
    const area = document.getElementById('detachSourceArea');
    const refresh = document.getElementById('refreshLinkedSourceBtn');
    const detach = document.getElementById('detachSourceBtn');
    if (!area || !refresh) return;

    if (scopes.length) {
      area.classList.remove('hidden');
      const strong = area.querySelector('strong');
      const label = document.getElementById('detachSourceLabel');
      if (strong) strong.textContent = '目前作品已有 Google Docs 來源';
      if (label) {
        const docs = [...new Set(scopes.map(item => item.docName).filter(Boolean))];
        label.textContent = `${docs.join('、')} · 更新前會先比較整個作品的差異`;
      }
      refresh.textContent = '更新作品來源';
      refresh.onclick = () => {
        document.getElementById('sourceDialog')?.close();
        refreshWholeProject();
      };
      if (detach) {
        const hasActiveSource = Boolean(activeChapter?.()?.source);
        detach.hidden = !hasActiveSource;
        if (hasActiveSource) detach.textContent = '解除目前章節連結';
      }
    }
  }

  async function accessToken() {
    if (!StoryFlowIntegrations.hasGoogleToken?.()) {
      await StoryFlowIntegrations.restoreGoogleAccess?.();
    }
    let token = '';
    try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) {}
    if (!token) throw new Error('Google 登入已失效，請先重新登入後再更新作品來源。');
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

  function blocksToDraft(blocks) {
    const lines = [];
    for (const block of blocks) {
      if (block.empty) {
        if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      } else if (!/^HEADING_[1-6]$/.test(block.namedStyle)) {
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
    const headingIndexes = [];
    blocks.forEach((block, index) => {
      if (block.namedStyle === 'HEADING_1' && !block.empty) headingIndexes.push(index);
    });
    if (!headingIndexes.length) {
      return {
        chapters: [{ title: tab.tabProperties?.title || '未命名章節', draft: blocksToDraft(blocks), headingOrdinal: null }],
        warnings: [...warnings]
      };
    }
    return {
      chapters: headingIndexes.map((start, ordinal) => ({
        title: blocks[start].plain.trim() || `第 ${ordinal + 1} 章`,
        draft: blocksToDraft(blocks.slice(start + 1, headingIndexes[ordinal + 1] ?? blocks.length)),
        headingOrdinal: ordinal
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

  function sourceMeta(scope, incoming) {
    return {
      id: scope.docId,
      name: scope.docName || 'Google Docs',
      url: scope.docUrl || `https://docs.google.com/document/d/${scope.docId}/edit`,
      tabId: scope.tabId,
      tabTitle: scope.tabTitle,
      headingOrdinal: incoming.headingOrdinal,
      headingTitle: incoming.title,
      syncedAt: new Date().toISOString()
    };
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
      const draftChanged = normalizeDraft(match.draft) !== normalizeDraft(incoming.draft);
      const titleChanged = normalizeTitle(match.title) !== normalizeTitle(incoming.title);
      if (detached) {
        changes.push({
          id: crypto.randomUUID(), kind: 'relink', selected: false, scope: syncedScope, incoming, chapterId: match.id,
          label: '章節已解除來源連結', detail: `可重新連結「${match.title}」${draftChanged || titleChanged ? '並套用來源內容' : ''}`,
          confirmedChanged: (draftChanged || titleChanged) && confirmedRangeChanged(match, incoming.draft)
        });
      } else if (draftChanged || titleChanged) {
        const details = [];
        if (titleChanged) details.push(`標題：${match.title} → ${incoming.title}`);
        if (draftChanged) details.push(`內容 ${charCount(match.draft).toLocaleString()} → ${charCount(incoming.draft).toLocaleString()} 字`);
        changes.push({
          id: crypto.randomUUID(), kind: 'update', selected: true, scope: syncedScope, incoming, chapterId: match.id,
          label: '來源內容有更新', detail: details.join(' · '),
          confirmedChanged: confirmedRangeChanged(match, incoming.draft)
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
    const scopes = ensureSourceScopes({ persist: true });
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
    return { changes, errors, checkedAt: new Date().toISOString() };
  }

  function ensureDiffDialog() {
    let dialog = document.getElementById('projectSourceDiffDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'projectSourceDiffDialog';
    dialog.className = 'project-source-diff-dialog';
    dialog.innerHTML = `
      <div class="project-source-diff-card">
        <header class="project-source-diff-head">
          <div><p class="eyebrow">SOURCE / PROJECT SYNC</p><h3>更新作品來源</h3><p class="muted">先比較 Google Docs 與目前工作區，再決定要套用哪些變更。</p></div>
          <button id="closeProjectSourceDiff" class="icon-button" type="button" aria-label="關閉">×</button>
        </header>
        <div id="projectSourceDiffSummary" class="project-source-diff-summary"></div>
        <div id="projectSourceDiffErrors" class="project-source-diff-errors hidden"></div>
        <div class="project-source-diff-toolbar">
          <button id="selectAllProjectSourceChanges" class="button tiny ghost" type="button">選取可套用變更</button>
          <button id="clearProjectSourceChanges" class="button tiny ghost" type="button">全部取消</button>
        </div>
        <div id="projectSourceDiffList" class="project-source-diff-list"></div>
        <footer class="project-source-diff-actions">
          <button id="cancelProjectSourceDiff" class="button ghost" type="button">先不要更新</button>
          <button id="applyProjectSourceDiff" class="button primary" type="button">套用所選變更</button>
        </footer>
      </div>`;
    document.body.appendChild(dialog);

    const close = () => { pendingDiff = null; dialog.close(); };
    dialog.querySelector('#closeProjectSourceDiff').onclick = close;
    dialog.querySelector('#cancelProjectSourceDiff').onclick = close;
    dialog.querySelector('#selectAllProjectSourceChanges').onclick = () => {
      if (!pendingDiff) return;
      pendingDiff.changes.forEach(change => { if (change.kind !== 'source-missing') change.selected = true; });
      renderDiffDialog();
    };
    dialog.querySelector('#clearProjectSourceChanges').onclick = () => {
      if (!pendingDiff) return;
      pendingDiff.changes.forEach(change => { change.selected = false; });
      renderDiffDialog();
    };
    dialog.querySelector('#applyProjectSourceDiff').onclick = applySelectedChanges;
    return dialog;
  }

  function changeBadge(change) {
    if (change.kind === 'add') return ['缺少', 'missing'];
    if (change.kind === 'update') return ['更新', 'changed'];
    if (change.kind === 'relink') return ['可重連', 'relink'];
    return ['保留', 'warning'];
  }

  function renderDiffDialog() {
    const dialog = ensureDiffDialog();
    const summary = dialog.querySelector('#projectSourceDiffSummary');
    const errors = dialog.querySelector('#projectSourceDiffErrors');
    const list = dialog.querySelector('#projectSourceDiffList');
    const apply = dialog.querySelector('#applyProjectSourceDiff');
    const changes = pendingDiff?.changes || [];
    const actionable = changes.filter(change => change.kind !== 'source-missing');
    const selected = actionable.filter(change => change.selected);

    const added = changes.filter(change => change.kind === 'add').length;
    const updated = changes.filter(change => change.kind === 'update').length;
    const relink = changes.filter(change => change.kind === 'relink').length;
    const missing = changes.filter(change => change.kind === 'source-missing').length;

    if (!changes.length && !(pendingDiff?.errors || []).length) {
      summary.innerHTML = '<strong>作品來源已是最新狀態</strong><span>Google Docs 與目前工作區沒有可套用的差異。</span>';
    } else {
      summary.innerHTML = `<strong>找到 ${changes.length} 項差異</strong><span>${added} 個工作區缺少章節 · ${updated} 個內容更新 · ${relink} 個可重新連結 · ${missing} 個來源缺少對應</span>`;
    }

    const errorItems = pendingDiff?.errors || [];
    errors.classList.toggle('hidden', !errorItems.length);
    errors.innerHTML = errorItems.map(item => `<div>${esc(item)}</div>`).join('');

    list.innerHTML = '';
    changes.forEach(change => {
      const [badgeText, badgeClass] = changeBadge(change);
      const row = document.createElement('label');
      row.className = `project-source-diff-row ${change.kind === 'source-missing' ? 'readonly' : ''}`;
      row.innerHTML = `
        <input type="checkbox" ${change.selected ? 'checked' : ''} ${change.kind === 'source-missing' ? 'disabled' : ''} />
        <span class="project-source-diff-badge ${badgeClass}">${badgeText}</span>
        <span class="project-source-diff-copy">
          <strong>${esc(change.label)}</strong>
          <span>${esc(change.scope.docName)} › ${esc(change.scope.tabTitle)} · ${esc(change.detail)}</span>
          ${change.confirmedChanged ? '<em>包含已確認發布範圍；既有 Markdown／發布狀態不會自動改寫。</em>' : ''}
        </span>`;
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
    const selected = pendingDiff.changes.filter(change => change.selected && change.kind !== 'source-missing');
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
        const chapter = {
          id: crypto.randomUUID(),
          title: incoming.title || '未命名章節',
          draft: normalizeDraft(incoming.draft),
          confirmedBlockCount: 0,
          parts: [],
          source: sourceMeta(change.scope, incoming)
        };
        insertRestoredChapter(chapter, change.scope, incoming.headingOrdinal);
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

    // Refresh persisted scope labels but retain scopes whose local chapters were
    // intentionally removed, so a later sync can still offer recovery.
    const scopeMap = new Map(ensureSourceScopes().map(item => [scopeKey(item), item]));
    for (const change of pendingDiff.changes) {
      scopeMap.set(scopeKey(change.scope), { ...scopeMap.get(scopeKey(change.scope)), ...change.scope });
    }
    state.sourceScopes = [...scopeMap.values()];

    pendingDiff = null;
    suggestion = null;
    document.getElementById('projectSourceDiffDialog')?.close();
    saveState('作品來源已更新');
    renderAll();
    syncSourcePanelUi();
    if (activeChapter()?.draft) suggestNextPart();
    notify(`作品來源已更新：重新加入 ${added} 個章節，更新 ${updated} 個章節`);
  }

  async function refreshWholeProject() {
    if (syncing) return;
    syncing = true;
    syncSourcePanelUi();
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
      syncSourcePanelUi();
    }
  }

  // Register source provenance before a chapter is removed. This means deleting the
  // last local chapter from a linked tab is still recoverable on the next project sync.
  document.addEventListener('click', event => {
    const deleteButton = event.target.closest?.('.chapter-delete-button');
    if (deleteButton) ensureSourceScopes({ persist: true });

    if (event.target.closest?.('#refreshSourceBtn')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      refreshWholeProject();
    }

    if (event.target.closest?.('#loadSourceBtn')) {
      setTimeout(syncLoadSourceDialogUi, 0);
    }
  }, true);

  // source-flow.js can toggle the button based on the active chapter after renders;
  // keep the whole-project affordance tied to project provenance instead.
  const observer = new MutationObserver(() => syncSourcePanelUi());
  const sourcePanel = document.querySelector('.source-panel');
  if (sourcePanel) observer.observe(sourcePanel, { subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });

  window.addEventListener('storyflow:projects-changed', () => {
    ensureSourceScopes({ persist: true });
    syncSourcePanelUi();
  });

  ensureSourceScopes({ persist: false });
  syncSourcePanelUi();
  window.StoryFlowProjectSourceSync = { refresh: refreshWholeProject, ensureSourceScopes };
})();
