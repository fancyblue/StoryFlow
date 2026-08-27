// Local-only command search across loaded works, chapters, and publishing articles.
(function () {
  const trigger = document.getElementById('globalSearchBtn');
  if (!trigger || document.getElementById('globalSearchDialog')) return;

  const MAX_RESULTS = 40;
  let results = [];
  let activeIndex = -1;

  function shortcutLabel() {
    const platform = `${navigator.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`;
    return /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘ K' : 'Ctrl K';
  }

  const shortcutHint = trigger.querySelector('kbd');
  if (shortcutHint) {
    shortcutHint.textContent = shortcutLabel();
    shortcutHint.setAttribute('aria-hidden', 'true');
  }

  function normalize(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase('zh-Hant').trim();
  }

  function partKey(part) {
    return part?.id || `${part?.title || 'part'}:${part?.startBlock ?? ''}:${part?.endBlock ?? ''}`;
  }

  function clipped(value, limit = 88) {
    const compact = String(value || '').replace(/\s+/g, ' ').trim();
    return compact.length > limit ? `${compact.slice(0, limit).trimEnd()}…` : compact;
  }

  function excerpt(value, query) {
    const source = String(value || '').replace(/\s+/g, ' ').trim();
    if (!source) return '';
    const index = normalize(source).indexOf(query);
    if (index < 0) return clipped(source);
    const start = Math.max(0, index - 28);
    const end = Math.min(source.length, index + query.length + 48);
    return `${start ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`;
  }

  function projectSnapshots() {
    const snapshots = window.StoryFlowProjects?.searchSnapshot?.();
    if (Array.isArray(snapshots)) return snapshots;
    return [{
      id: window.StoryFlowProjects?.activeId?.() || 'active',
      title: state?.projectTitle || '未命名作品',
      updatedAt: null,
      state: structuredClone(state)
    }];
  }

  function searchableRecords() {
    const records = [];
    projectSnapshots().forEach((project, projectIndex) => {
      const projectTitle = project.title || project.state?.projectTitle || '未命名作品';
      const orderBase = Date.parse(project.updatedAt || '') || projectIndex;
      records.push({
        kind: 'project', label: '作品', projectId: project.id, projectTitle,
        title: projectTitle, subtitle: '開啟作品工作台', titleFields: [projectTitle],
        bodyFields: [], order: orderBase
      });

      (project.state?.chapters || []).forEach((chapter, chapterIndex) => {
        const chapterTitle = chapter.title || `第 ${chapterIndex + 1} 章`;
        records.push({
          kind: 'chapter', label: '章節', projectId: project.id, projectTitle,
          chapterId: chapter.id, chapterTitle, title: chapterTitle,
          subtitle: projectTitle, titleFields: [chapterTitle],
          bodyFields: [chapter.draft || ''], order: orderBase + chapterIndex / 1000
        });

        (chapter.parts || []).forEach((part, partIndex) => {
          const publishTitle = String(part.publishTitle || '').trim();
          const platformTitles = Object.values(part.platformTitles || {}).map(value => String(value || '').trim()).filter(Boolean);
          const internalTitle = part.title || `第 ${partIndex + 1} 篇`;
          const displayTitle = publishTitle || platformTitles[0] || internalTitle;
          records.push({
            kind: 'part', label: '發布文章', projectId: project.id, projectTitle,
            chapterId: chapter.id, chapterTitle, partKey: partKey(part),
            title: displayTitle,
            internalTitle,
            subtitle: `${projectTitle} · ${chapterTitle}${displayTitle !== internalTitle ? ` · 內部名稱：${internalTitle}` : ''}`,
            titleFields: [publishTitle, ...platformTitles, internalTitle],
            bodyFields: [part.raw || part.formatted || ''],
            order: orderBase + chapterIndex / 1000 + partIndex / 100000
          });
        });
      });
    });
    return records;
  }

  function search(query, includeBody) {
    const term = normalize(query);
    const records = searchableRecords();
    if (!term) return records.sort((a, b) => b.order - a.order).slice(0, 12);

    return records.map(record => {
      const normalizedTitles = record.titleFields.map(normalize).filter(Boolean);
      const exact = normalizedTitles.some(value => value === term);
      const prefix = normalizedTitles.some(value => value.startsWith(term));
      const titleMatch = normalizedTitles.some(value => value.includes(term));
      const bodySource = includeBody
        ? record.bodyFields.find(value => normalize(value).includes(term)) || ''
        : '';
      if (!titleMatch && !bodySource) return null;
      return {
        ...record,
        matchScope: titleMatch ? 'title' : 'body',
        snippet: bodySource ? excerpt(bodySource, term) : '',
        score: exact ? 4 : prefix ? 3 : titleMatch ? 2 : 1
      };
    }).filter(Boolean).sort((a, b) => b.score - a.score || b.order - a.order).slice(0, MAX_RESULTS);
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'globalSearchDialog';
  dialog.className = 'global-search-dialog';
  dialog.innerHTML = `
    <div class="dialog-card global-search-card">
      <div class="global-search-head">
        <span class="global-search-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg></span>
        <input id="globalSearchInput" type="search" autocomplete="off" aria-label="搜尋作品、章節與文章" aria-controls="globalSearchResults" aria-autocomplete="list" placeholder="搜尋作品、章節與文章…" />
        <button id="closeGlobalSearch" class="global-search-close" type="button" aria-label="關閉搜尋"><span aria-hidden="true">×</span></button>
      </div>
      <div class="global-search-options">
        <label><input id="globalSearchIncludeBody" type="checkbox" /><span>同時搜尋正文</span></label>
        <span id="globalSearchCount"></span>
      </div>
      <div id="globalSearchResults" class="global-search-results" role="listbox" aria-label="搜尋結果"></div>
      <div class="global-search-foot"><span>↑↓ 選擇</span><span>Enter 開啟</span><span>Esc 關閉</span><strong>只搜尋目前載入的私人資料</strong></div>
    </div>`;
  document.body.appendChild(dialog);

  const input = dialog.querySelector('#globalSearchInput');
  const includeBody = dialog.querySelector('#globalSearchIncludeBody');
  const resultList = dialog.querySelector('#globalSearchResults');
  const count = dialog.querySelector('#globalSearchCount');

  function setActive(index, { scroll = true } = {}) {
    const buttons = [...resultList.querySelectorAll('.global-search-result')];
    activeIndex = buttons.length ? Math.max(0, Math.min(index, buttons.length - 1)) : -1;
    buttons.forEach((button, buttonIndex) => {
      const active = buttonIndex === activeIndex;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    if (scroll && activeIndex >= 0) buttons[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function resultButton(record, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'global-search-result';
    button.dataset.index = String(index);
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.tabIndex = -1;

    const type = document.createElement('span');
    type.className = `global-search-result-type ${record.kind}`;
    type.textContent = record.label;
    const copy = document.createElement('span');
    copy.className = 'global-search-result-copy';
    const title = document.createElement('strong');
    title.textContent = record.title;
    const subtitle = document.createElement('span');
    subtitle.textContent = record.subtitle;
    copy.append(title, subtitle);
    if (record.snippet) {
      const snippet = document.createElement('small');
      snippet.textContent = record.snippet;
      copy.appendChild(snippet);
    }
    const arrow = document.createElement('span');
    arrow.className = 'global-search-result-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    button.append(type, copy, arrow);
    button.addEventListener('mouseenter', () => setActive(index, { scroll: false }));
    button.addEventListener('click', () => openResult(record));
    return button;
  }

  function renderResults({ preserveSelection = false } = {}) {
    results = search(input.value, includeBody.checked);
    resultList.replaceChildren();
    const hasQuery = Boolean(normalize(input.value));
    count.textContent = hasQuery ? `${results.length} 個結果` : '最近內容';
    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'global-search-empty';
      empty.innerHTML = hasQuery
        ? '<strong>找不到符合內容</strong><span>可以換個關鍵字，或開啟「同時搜尋正文」。</span>'
        : '<strong>尚未有可搜尋內容</strong><span>建立作品與文章後，就能從這裡快速開啟。</span>';
      resultList.appendChild(empty);
      activeIndex = -1;
      return;
    }
    results.forEach((record, index) => resultList.appendChild(resultButton(record, index)));
    setActive(preserveSelection && activeIndex >= 0 ? activeIndex : 0, { scroll: false });
  }

  function focusDraftMatch(query) {
    const draft = document.getElementById('draft');
    if (!draft || !query) return;
    const index = normalize(draft.value).indexOf(normalize(query));
    if (index < 0) return;
    draft.focus({ preventScroll: true });
    draft.setSelectionRange(index, Math.min(draft.value.length, index + query.length));
    draft.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function openResult(record) {
    const api = window.StoryFlowProjects;
    if (api?.activeId?.() !== record.projectId) api?.switchProject?.(record.projectId, { quiet: true });

    if (record.chapterId && state.chapters?.some(chapter => chapter.id === record.chapterId)) {
      state.activeChapterId = record.chapterId;
      suggestion = null;
      renderAll();
      saveState('工作位置已更新');
    }

    const query = input.value;
    dialog.close();
    if (record.kind === 'part') {
      window.StoryFlowNavigate?.('publishing');
      window.setTimeout(() => {
        window.StoryFlowPublishing?.openPart?.(record.partKey, { preview: record.matchScope === 'body' });
      }, 80);
      return;
    }

    window.StoryFlowNavigate?.('workspace');
    if (record.kind === 'chapter' && record.matchScope === 'body') {
      window.setTimeout(() => focusDraftMatch(query), 80);
    }
  }

  function openSearch() {
    const blockingDialog = [...document.querySelectorAll('dialog[open]')]
      .find(node => node !== dialog && !node.closest('[hidden]') && node.getClientRects().length > 0);
    if (blockingDialog) return;
    input.value = '';
    includeBody.checked = false;
    activeIndex = -1;
    renderResults();
    dialog.showModal();
    window.setTimeout(() => input.focus(), 0);
  }

  trigger.addEventListener('click', openSearch);
  dialog.querySelector('#closeGlobalSearch').addEventListener('click', () => dialog.close());
  input.addEventListener('input', () => renderResults());
  includeBody.addEventListener('change', () => renderResults());
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(activeIndex <= 0 ? results.length - 1 : activeIndex - 1);
    } else if (event.key === 'Enter' && event.target === input) {
      event.preventDefault();
      if (results[activeIndex]) openResult(results[activeIndex]);
    }
  });
  window.addEventListener('keydown', event => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'k') return;
    event.preventDefault();
    if (dialog.open) dialog.close();
    else openSearch();
  });

  window.StoryFlowSearch = { open: openSearch, refresh: renderResults, shortcutLabel };
})();
