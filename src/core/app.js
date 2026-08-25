const STORAGE_KEY = 'storyflow.state.v4';
const platforms = ['巴哈姆特', '方格子'];

function defaultPlatformFormatting() {
  return Object.fromEntries(platforms.map(platform => [platform, {
    indent: 'inherit',
    paragraphSpacing: true,
    sceneSeparator: true
  }]));
}

const defaultState = {
  projectTitle: '未命名作品',
  chapters: [{ id: crypto.randomUUID(), title: '第一章', draft: '', confirmedBlockCount: 0, parts: [], source: null }],
  activeChapterId: null,
  minChars: 1000,
  maxChars: 3000,
  sceneMarker: '＊＊＊',
  formatting: {
    defaultIndent: 'none',
    defaultParagraphSpacing: true,
    defaultSceneSeparator: true,
    platforms: defaultPlatformFormatting()
  }
};
defaultState.activeChapterId = defaultState.chapters[0].id;

let state = loadState();
let suggestion = null;
let outputFolderState = { supported: true, connected: false };
let pendingGoogleDoc = null;

const $ = (id) => document.getElementById(id);
const els = {
  projectTitle: $('projectTitle'), chapterTitle: $('chapterTitle'), draft: $('draft'), chapterList: $('chapterList'),
  minChars: $('minChars'), maxChars: $('maxChars'), sceneMarker: $('sceneMarker'), chapterChars: $('chapterChars'),
  publishedChars: $('publishedChars'), remainingChars: $('remainingChars'), partCount: $('partCount'), draftMeta: $('draftMeta'),
  suggestionEmpty: $('suggestionEmpty'), suggestionCard: $('suggestionCard'), suggestionName: $('suggestionName'),
  suggestionChars: $('suggestionChars'), suggestionStatus: $('suggestionStatus'), suggestionReason: $('suggestionReason'), preview: $('preview'),
  partsList: $('partsList'), saveState: $('saveState'), sourceMeta: $('sourceMeta'), syncGoogleBtn: $('syncGoogleBtn'),
  googleDot: $('googleDot'), googleStatus: $('googleStatus'), folderDot: $('folderDot'), folderStatus: $('folderStatus'),
  settingsDialog: $('settingsDialog'), pickerApiKeyInput: $('pickerApiKeyInput'), defaultIndent: $('defaultIndent'),
  defaultParagraphSpacing: $('defaultParagraphSpacing'), defaultSceneSeparator: $('defaultSceneSeparator'),
  platformFormatSettings: $('platformFormatSettings'), tabDialog: $('tabDialog'), tabList: $('tabList'), tabDialogTitle: $('tabDialogTitle')
};

function loadState() {
  for (const key of [STORAGE_KEY, 'storyflow.state.v3', 'storyflow.state.v2', 'storyflow.state.v1']) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (parsed?.chapters?.length) {
        parsed.chapters.forEach(chapter => {
          chapter.source ||= null;
          chapter.parts ||= [];
          chapter.parts.forEach(normalizePublishingPart);
        });
        parsed.formatting ||= {};
        parsed.formatting.defaultIndent ||= 'none';
        if (typeof parsed.formatting.defaultParagraphSpacing !== 'boolean') parsed.formatting.defaultParagraphSpacing = true;
        if (typeof parsed.formatting.defaultSceneSeparator !== 'boolean') parsed.formatting.defaultSceneSeparator = true;
        parsed.formatting.platforms ||= {};
        platforms.forEach(platform => {
          const current = parsed.formatting.platforms[platform] || {};
          parsed.formatting.platforms[platform] = {
            indent: current.indent || 'inherit',
            paragraphSpacing: typeof current.paragraphSpacing === 'boolean' ? current.paragraphSpacing : parsed.formatting.defaultParagraphSpacing,
            sceneSeparator: typeof current.sceneSeparator === 'boolean' ? current.sceneSeparator : parsed.formatting.defaultSceneSeparator
          };
        });
        return parsed;
      }
    } catch (_) {}
  }
  return structuredClone(defaultState);
}

function saveState(label = '已儲存') {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  els.saveState.textContent = label;
  window.setTimeout(() => { els.saveState.textContent = '已儲存'; }, 1100);
}

function notify(message, isError = false) {
  const previousStatus = els.saveState.textContent;
  els.saveState.textContent = message;
  els.saveState.classList.toggle('error-text', isError);
  window.setTimeout(() => {
    if (window.StoryFlowSaveStatus?.render) window.StoryFlowSaveStatus.render();
    else els.saveState.textContent = previousStatus;
    els.saveState.classList.remove('error-text');
  }, 3200);
}

function activeChapter() {
  return state.chapters.find(chapter => chapter.id === state.activeChapterId) || state.chapters[0];
}

function charCount(text) {
  return String(text || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`>#\s]/g, '')
    .length;
}

function normalizePublishingPart(part) {
  if (!part || typeof part !== 'object') return part;
  if (typeof part.afterword !== 'string') part.afterword = '';
  if (typeof part.includeAfterword !== 'boolean') part.includeAfterword = true;
  if (!part.publicationRecords || typeof part.publicationRecords !== 'object' || Array.isArray(part.publicationRecords)) {
    part.publicationRecords = {};
  }
  Object.entries(part.publicationRecords).forEach(([platform, record]) => {
    part.publicationRecords[platform] = {
      publishedAt: typeof record?.publishedAt === 'string' ? record.publishedAt : '',
      url: typeof record?.url === 'string' ? record.url : ''
    };
  });
  return part;
}

function parseBlocks(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (blocks.length) blocks[blocks.length - 1].strongBoundaryAfter = true;
      continue;
    }
    const raw = line.trimEnd();
    blocks.push({ id: `block-${blocks.length + 1}`, raw, chars: charCount(raw), strongBoundaryAfter: false });
  }
  return blocks;
}

function stripParagraphIndent(text) {
  return String(text || '').replace(/^(?:　{1,2}| {1,4})/, '');
}

function applyIndent(text, indent) {
  const clean = stripParagraphIndent(text);
  if (indent !== 'two') return clean;
  if (/^(?:>|!\[|[-*+]\s|\d+\.\s|#{1,6}\s)/.test(clean)) return clean;
  return `　　${clean}`;
}

function webFormat(text, options = {}) {
  const indent = options.indent ?? state.formatting.defaultIndent;
  const paragraphSpacing = options.paragraphSpacing ?? state.formatting.defaultParagraphSpacing;
  const sceneSeparator = options.sceneSeparator ?? state.formatting.defaultSceneSeparator;
  const marker = options.marker ?? state.sceneMarker;
  const blocks = parseBlocks(text);
  let output = '';

  blocks.forEach((block, index) => {
    output += applyIndent(block.raw, indent);
    if (index >= blocks.length - 1) return;
    if (block.strongBoundaryAfter && sceneSeparator) {
      output += paragraphSpacing ? `\n\n${marker}\n\n` : `\n${marker}\n`;
    } else {
      output += paragraphSpacing ? '\n\n' : '\n';
    }
  });
  return output;
}

function platformOptions(platform) {
  const config = state.formatting.platforms?.[platform] || {};
  return {
    indent: config.indent === 'inherit' || !config.indent ? state.formatting.defaultIndent : config.indent,
    paragraphSpacing: typeof config.paragraphSpacing === 'boolean' ? config.paragraphSpacing : state.formatting.defaultParagraphSpacing,
    sceneSeparator: typeof config.sceneSeparator === 'boolean' ? config.sceneSeparator : state.formatting.defaultSceneSeparator,
    marker: state.sceneMarker
  };
}

function platformFormat(raw, platform) {
  return webFormat(raw, platformOptions(platform));
}

function suggestNextPart() {
  const chapter = activeChapter();
  const blocks = parseBlocks(chapter.draft);
  const start = Math.min(chapter.confirmedBlockCount || 0, blocks.length);
  if (start >= blocks.length) {
    suggestion = null;
    renderSuggestion();
    notify(blocks.length ? '目前沒有新的未處理內容' : '請先匯入或貼上原稿');
    return;
  }

  const min = Number(state.minChars) || 1000;
  const max = Number(state.maxChars) || 3000;
  const target = (min + max) / 2;
  let end = start, chars = 0, bestEnd = null, bestScore = Infinity;

  while (end < blocks.length) {
    chars += blocks[end].chars;
    end += 1;
    const atChapterEnd = end >= blocks.length;
    if (chars >= min || atChapterEnd) {
      const distance = Math.abs(chars - target);
      const overflow = chars > max ? (chars - max) * 1.35 : 0;
      const underflow = chars < min ? (min - chars) * 3 : 0;
      const naturalBonus = blocks[end - 1]?.strongBoundaryAfter ? -260 : 0;
      const score = distance + overflow + underflow + naturalBonus;
      if (score < bestScore) {
        bestScore = score;
        bestEnd = end;
      }
    }
    if (chars > max * 1.8 && bestEnd != null) break;
  }

  suggestion = buildSuggestion(start, bestEnd || blocks.length, blocks);
  renderSuggestion();
}

function buildSuggestion(start, end, blocks = parseBlocks(activeChapter().draft)) {
  const chapter = activeChapter();
  const selected = blocks.slice(start, end);
  const raw = selected.map((block, index) => {
    const suffix = block.strongBoundaryAfter && index < selected.length - 1 ? '\n\n' : '\n';
    return block.raw + suffix;
  }).join('').trim();
  const chars = selected.reduce((sum, block) => sum + block.chars, 0);
  const max = Number(state.maxChars) || 3000;
  const min = Number(state.minChars) || 1000;
  let status = '建議';
  if (chars > max) status = '超過偏好';
  else if (chars < min) status = '低於偏好';
  const natural = Boolean(blocks[end - 1]?.strongBoundaryAfter);
  return {
    start, end, raw, formatted: webFormat(raw), chars,
    name: `${chapter.title}（${chapter.parts.length + 1}）`,
    status,
    reason: end >= blocks.length
      ? (chars < min ? '已到章節最新內容，因此允許低於偏好最少字數。' : '目前已到章節最新內容；可以確認，或等待原稿繼續增加。')
      : natural
        ? '目前切點是原稿中的空白段落，且已達偏好最少字數。仍可手動往前或往後調整。'
        : '目前切點是一般段落結尾。你可以把後面的段落拉進來，即使超過偏好字數。'
  };
}

function renderSuggestion() {
  if (!suggestion) {
    els.suggestionEmpty.classList.remove('hidden');
    els.suggestionCard.classList.add('hidden');
    return;
  }
  els.suggestionEmpty.classList.add('hidden');
  els.suggestionCard.classList.remove('hidden');
  els.suggestionName.textContent = suggestion.name;
  els.suggestionChars.textContent = `${suggestion.chars.toLocaleString()} 字`;
  els.suggestionStatus.textContent = suggestion.status;
  els.suggestionReason.textContent = suggestion.reason;
  els.preview.textContent = suggestion.formatted;
}

function adjustSuggestion(delta) {
  if (!suggestion) return;
  const blocks = parseBlocks(activeChapter().draft);
  const end = Math.max(suggestion.start + 1, Math.min(blocks.length, suggestion.end + delta));
  suggestion = buildSuggestion(suggestion.start, end, blocks);
  renderSuggestion();
}

function chapterMetadata(chapter) {
  return {
    schemaVersion: 5,
    projectTitle: state.projectTitle,
    chapter: chapter.title,
    source: chapter.source,
    confirmedBlockCount: chapter.confirmedBlockCount,
    formatting: state.formatting,
    sceneMarker: state.sceneMarker,
    updatedAt: new Date().toISOString(),
    parts: chapter.parts.map(part => ({
      id: part.id, title: part.title, startBlock: part.startBlock, endBlock: part.endBlock,
      chars: part.chars, afterwordChars: charCount(part.afterword), includeAfterword: part.includeAfterword !== false,
      publicationRecords: structuredClone(part.publicationRecords || {}),
      published: part.published, platformStatus: part.platformStatus
    }))
  };
}

async function confirmSuggestion() {
  if (!suggestion) return;
  const chapter = activeChapter();
  const part = {
    id: crypto.randomUUID(), title: suggestion.name, startBlock: suggestion.start, endBlock: suggestion.end,
    chars: suggestion.chars, raw: suggestion.raw, formatted: suggestion.formatted, published: false,
    afterword: '', includeAfterword: true,
    publicationRecords: {},
    platformStatus: Object.fromEntries(platforms.map(platform => [platform, false]))
  };
  chapter.parts.push(part);
  chapter.confirmedBlockCount = suggestion.end;
  suggestion = null;
  saveState('正在保存…');
  renderAll();
  try {
    const path = await StoryFlowIntegrations.savePart({ projectTitle: state.projectTitle, chapter, part, metadata: chapterMetadata(chapter) });
    notify(`已保存：${path}`);
    await refreshFolderStatus();
  } catch (error) {
    notify(`已確認，但尚未寫入資料夾：${error.message}`, true);
  }
}

function renderChapters() {
  els.chapterList.innerHTML = '';
  for (const chapter of state.chapters) {
    const button = document.createElement('button');
    button.className = `chapter-item ${chapter.id === state.activeChapterId ? 'active' : ''}`;
    button.innerHTML = `<span>${escapeHtml(chapter.title)}</span><small>${charCount(chapter.draft).toLocaleString()} 字</small>`;
    button.onclick = () => { state.activeChapterId = chapter.id; suggestion = null; saveState(); renderAll(); };
    els.chapterList.appendChild(button);
  }
}

function renderParts() {
  els.partsList.innerHTML = '';
  const parts = activeChapter().parts;
  if (!parts.length) {
    els.partsList.innerHTML = '<div class="empty-state" style="min-height:120px"><span>尚未建立發布篇。先按「產生下一篇」。</span></div>';
    return;
  }
  const template = $('partTemplate');
  for (const part of parts) {
    const node = template.content.cloneNode(true);
    node.querySelector('.part-name').textContent = part.title;
    node.querySelector('.part-info').textContent = `${part.chars.toLocaleString()} 字 · ${part.published ? '已發布' : '已確認、未發布'}`;
    const pbox = node.querySelector('.platforms');
    platforms.forEach(platform => {
      const badge = document.createElement('button');
      badge.className = `platform-badge ${part.platformStatus?.[platform] ? 'done' : ''}`;
      badge.textContent = `${platform}${part.platformStatus?.[platform] ? ' ✓' : ''}`;
      badge.onclick = () => {
        normalizePublishingPart(part);
        const next = !part.platformStatus[platform];
        part.platformStatus[platform] = next;
        part.publicationRecords[platform] ||= { publishedAt: '', url: '' };
        if (next && !part.publicationRecords[platform].publishedAt) part.publicationRecords[platform].publishedAt = new Date().toISOString();
        if (!next) part.publicationRecords[platform] = { publishedAt: '', url: '' };
        part.published = Object.values(part.platformStatus).some(Boolean);
        saveState(); renderAll();
      };
      pbox.appendChild(badge);
    });
    const select = node.querySelector('.copy-platform');
    platforms.forEach(platform => select.add(new Option(platform, platform)));
    node.querySelector('.copy-btn').onclick = async () => {
      const platform = select.value;
      const output = window.StoryFlowPublishingOutput?.forPart?.(part, platform)
        || platformFormat(part.raw, platform);
      await navigator.clipboard.writeText(output);
      notify(`已複製 ${platform} 版本`);
    };
    const toggle = node.querySelector('.toggle-btn');
    toggle.textContent = part.published ? '取消已發布' : '標記已發布';
    toggle.onclick = () => { part.published = !part.published; saveState(); renderAll(); };
    els.partsList.appendChild(node);
  }
}

function renderStats() {
  const chapter = activeChapter();
  const blocks = parseBlocks(chapter.draft);
  const confirmed = blocks.slice(0, chapter.confirmedBlockCount || 0).reduce((sum, block) => sum + block.chars, 0);
  const remaining = blocks.slice(chapter.confirmedBlockCount || 0).reduce((sum, block) => sum + block.chars, 0);
  els.chapterChars.textContent = charCount(chapter.draft).toLocaleString();
  els.publishedChars.textContent = confirmed.toLocaleString();
  els.remainingChars.textContent = remaining.toLocaleString();
  els.partCount.textContent = chapter.parts.length.toLocaleString();
  const strong = blocks.filter(block => block.strongBoundaryAfter).length;
  els.draftMeta.textContent = `${charCount(chapter.draft).toLocaleString()} 字 · ${blocks.length} 段 · ${strong} 個空白切點`;
}

function renderSource() {
  const source = activeChapter().source;
  if (!source) {
    els.sourceMeta.textContent = '尚未綁定 Google Docs';
    els.syncGoogleBtn.disabled = true;
    return;
  }
  const tab = source.tabTitle ? ` › ${source.tabTitle}` : '';
  els.sourceMeta.textContent = `來源：${source.name}${tab} · 上次同步 ${new Date(source.syncedAt).toLocaleString('zh-TW')}`;
  els.syncGoogleBtn.disabled = false;
}

function renderAll() {
  const chapter = activeChapter();
  els.projectTitle.value = state.projectTitle;
  els.chapterTitle.value = chapter.title;
  els.draft.value = chapter.draft;
  els.minChars.value = state.minChars;
  els.maxChars.value = state.maxChars;
  els.sceneMarker.value = state.sceneMarker;
  renderChapters(); renderStats(); renderParts(); renderSuggestion(); renderSource();
}

function createChapter() {
  const next = state.chapters.length + 1;
  const chapter = { id: crypto.randomUUID(), title: `第${next}章`, draft: '', confirmedBlockCount: 0, parts: [], source: null };
  state.chapters.push(chapter);
  state.activeChapterId = chapter.id;
  suggestion = null;
  saveState('已新增章節');
  renderAll();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
}

async function loginGoogle() {
  try {
    await StoryFlowIntegrations.requestAccessToken();
    await loginGoogleStatusOnly();
    notify('Google 授權完成');
  } catch (error) { notify(error.message, true); }
}

function renderTabPicker(doc) {
  pendingGoogleDoc = doc;
  els.tabDialogTitle.textContent = `選擇「${doc.title}」的分頁`;
  els.tabList.innerHTML = '';
  if (!doc.tabs.length) {
    els.tabList.innerHTML = '<div class="empty-state" style="min-height:120px">這份文件沒有可讀取的分頁內容。</div>';
  }
  doc.tabs.forEach(tab => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-choice';
    button.style.marginLeft = `${tab.depth * 18}px`;
    const count = tab.chapters.length;
    const words = tab.chapters.reduce((sum, chapter) => sum + charCount(chapter.draft), 0);
    button.innerHTML = `<span><strong>${escapeHtml(tab.title)}</strong><small>${count} 個章節 · ${words.toLocaleString()} 字</small></span><span>匯入 →</span>`;
    button.onclick = () => importSelectedTab(tab.id);
    els.tabList.appendChild(button);
  });
  els.tabDialog.showModal();
}

async function importGoogleDoc() {
  try {
    if (!StoryFlowIntegrations.pickerApiKey()) {
      openSettings();
      notify('請先在整合設定輸入 Picker API Key', true);
      return;
    }
    notify('正在讀取 Google Docs 分頁…');
    const doc = await StoryFlowIntegrations.inspectGoogleDoc();
    renderTabPicker(doc);
    await loginGoogleStatusOnly();
  } catch (error) {
    if (!/取消選取/.test(error.message)) notify(error.message, true);
  }
}

function importSelectedTab(tabId) {
  const doc = pendingGoogleDoc;
  const tab = doc?.tabs?.find(item => item.id === tabId);
  if (!doc || !tab) return;
  const existingHasWork = state.chapters.some(chapter => chapter.draft || chapter.parts?.length || chapter.source);
  if (existingHasWork && !confirm(`將以「${tab.title}」偵測到的 ${tab.chapters.length} 個章節取代目前章節清單。已確認的切篇也會從工作區移除。確定匯入？`)) return;

  const syncedAt = new Date().toISOString();
  state.chapters = tab.chapters.map((chapter, index) => ({
    id: crypto.randomUUID(),
    title: chapter.title || `第${index + 1}章`,
    draft: chapter.draft,
    confirmedBlockCount: 0,
    parts: [],
    source: {
      id: doc.id, name: doc.name, url: doc.url, tabId: tab.id, tabTitle: tab.title,
      headingOrdinal: chapter.headingOrdinal, headingTitle: chapter.title, syncedAt
    }
  }));
  if (!state.chapters.length) state.chapters = [{ id: crypto.randomUUID(), title: tab.title, draft: '', confirmedBlockCount: 0, parts: [], source: null }];
  state.activeChapterId = state.chapters[0].id;
  if (!state.projectTitle || state.projectTitle === '未命名作品') state.projectTitle = doc.title;
  suggestion = null;
  saveState('Google Docs 分頁已匯入');
  els.tabDialog.close();
  renderAll();
  if (tab.warnings?.length) alert(`StoryFlow 匯入提醒：\n\n${tab.warnings.join('\n')}`);
  notify(`已匯入 ${tab.title}：${state.chapters.length} 個章節`);
}

async function syncGoogleDoc() {
  const chapter = activeChapter();
  if (!chapter.source?.id) return;
  try {
    notify('正在同步 Google Docs…');
    const refreshed = await StoryFlowIntegrations.refreshChapterSource(chapter.source);
    const nextDraft = refreshed.draft;
    const oldBlockCount = parseBlocks(chapter.draft).length;
    const newBlockCount = parseBlocks(nextDraft).length;
    if (chapter.confirmedBlockCount > 0 && newBlockCount < chapter.confirmedBlockCount) {
      if (!confirm('新的原稿段落數少於已確認的發布進度。為避免切點錯位，建議先取消。仍要更新工作快照嗎？')) return;
    }
    chapter.draft = nextDraft;
    chapter.source.syncedAt = new Date().toISOString();
    chapter.source.tabTitle = refreshed.tabTitle || chapter.source.tabTitle;
    suggestion = null;
    saveState('同步完成');
    renderAll();
    if (refreshed.warnings?.length) alert(`StoryFlow 同步提醒：\n\n${refreshed.warnings.join('\n')}`);
    if (oldBlockCount !== newBlockCount) notify(`同步完成：${oldBlockCount} → ${newBlockCount} 段`);
    await loginGoogleStatusOnly();
  } catch (error) { notify(error.message, true); }
}

async function loginGoogleStatusOnly() {
  if (StoryFlowIntegrations.hasGoogleToken()) {
    els.googleDot.classList.add('connected');
    els.googleStatus.textContent = '本次工作階段已授權';
    $('googleLoginBtn').textContent = '已登入';
  }
}

async function refreshFolderStatus() {
  outputFolderState = await StoryFlowIntegrations.restoreOutputDirectory();
  els.folderDot.classList.toggle('connected', Boolean(outputFolderState.connected));
  if (!outputFolderState.supported) {
    els.folderStatus.textContent = '此瀏覽器不支援直接寫入';
    $('folderBtn').textContent = '需 Chrome / Edge';
    return;
  }
  if (outputFolderState.connected) {
    els.folderStatus.textContent = `${outputFolderState.name} · 已連接`;
    $('folderBtn').textContent = '重新選擇';
  } else if (outputFolderState.needsPermission) {
    els.folderStatus.textContent = `${outputFolderState.name} · 需要重新授權`;
    $('folderBtn').textContent = '重新連接';
  } else {
    els.folderStatus.textContent = '尚未連接';
    $('folderBtn').textContent = '選擇資料夾';
  }
}

async function chooseFolder(options = {}) {
  try {
    const result = await StoryFlowIntegrations.chooseOutputDirectory(options);
    notify(`已連接 ${result.name}`);
    await refreshFolderStatus();
    window.dispatchEvent(new CustomEvent('storyflow:connection-changed', {
      detail: { kind: 'folder', connected: true, name: result.name, restored: Boolean(result.restored) }
    }));
    return result;
  } catch (error) {
    if (error.name !== 'AbortError') notify(error.message, true);
    return null;
  }
}

function checkboxControl(labelText, checked, onChange) {
  const label = document.createElement('label');
  label.className = 'format-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.onchange = () => onChange(input.checked);
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(input, text);
  return label;
}

function renderFormattingSettings() {
  els.defaultIndent.value = state.formatting.defaultIndent;
  els.defaultParagraphSpacing.checked = state.formatting.defaultParagraphSpacing;
  els.defaultSceneSeparator.checked = state.formatting.defaultSceneSeparator;
  els.platformFormatSettings.innerHTML = '';
  platforms.forEach(platform => {
    const config = state.formatting.platforms[platform];
    const row = document.createElement('div');
    row.className = 'platform-setting-row';
    const name = document.createElement('strong');
    name.textContent = platform;
    const controls = document.createElement('div');
    controls.className = 'platform-format-controls';
    const select = document.createElement('select');
    select.className = 'text-input';
    select.innerHTML = '<option value="inherit">段首跟隨預設</option><option value="none">段首不縮排</option><option value="two">段首全形兩格</option>';
    select.value = config.indent || 'inherit';
    select.onchange = () => { config.indent = select.value; saveState('排版設定已更新'); };
    const spacing = checkboxControl('段落間空一行', config.paragraphSpacing, checked => { config.paragraphSpacing = checked; saveState('排版設定已更新'); });
    const scene = checkboxControl('顯示場景分隔符', config.sceneSeparator, checked => { config.sceneSeparator = checked; saveState('排版設定已更新'); });
    controls.append(select, spacing, scene);
    row.append(name, controls);
    els.platformFormatSettings.appendChild(row);
  });
}

function refreshSuggestionFormatting() {
  if (suggestion) suggestion = buildSuggestion(suggestion.start, suggestion.end);
  renderSuggestion();
}

function openSettings() {
  els.pickerApiKeyInput.value = StoryFlowIntegrations.pickerApiKey();
  renderFormattingSettings();
  els.settingsDialog.showModal();
}

els.projectTitle.addEventListener('input', event => { state.projectTitle = event.target.value; saveState(); });
els.chapterTitle.addEventListener('input', event => { activeChapter().title = event.target.value; suggestion = null; saveState(); renderChapters(); });
els.draft.addEventListener('input', event => { activeChapter().draft = event.target.value; suggestion = null; saveState(); renderStats(); });
els.minChars.addEventListener('change', event => { state.minChars = Number(event.target.value); suggestion = null; saveState(); });
els.maxChars.addEventListener('change', event => { state.maxChars = Number(event.target.value); suggestion = null; saveState(); });
els.sceneMarker.addEventListener('input', event => { state.sceneMarker = event.target.value || '＊＊＊'; saveState(); refreshSuggestionFormatting(); });
els.defaultIndent.addEventListener('change', event => { state.formatting.defaultIndent = event.target.value; saveState('排版設定已更新'); refreshSuggestionFormatting(); });
els.defaultParagraphSpacing.addEventListener('change', event => { state.formatting.defaultParagraphSpacing = event.target.checked; saveState('排版設定已更新'); refreshSuggestionFormatting(); });
els.defaultSceneSeparator.addEventListener('change', event => { state.formatting.defaultSceneSeparator = event.target.checked; saveState('排版設定已更新'); refreshSuggestionFormatting(); });
$('generateBtn').onclick = suggestNextPart;
$('shrinkBtn').onclick = () => adjustSuggestion(-1);
$('expandBtn').onclick = () => adjustSuggestion(1);
$('confirmBtn').onclick = confirmSuggestion;
$('saveBtn').onclick = () => saveState('已手動儲存');
$('addChapterBtn').onclick = createChapter;
$('newChapterBtn').onclick = createChapter;
$('googleLoginBtn').onclick = loginGoogle;
$('importGoogleBtn').onclick = importGoogleDoc;
els.syncGoogleBtn.onclick = syncGoogleDoc;
const chooseFolderFromUi = () => chooseFolder(
  outputFolderState?.remembered && !outputFolderState?.connected ? { reuseRemembered: true } : {}
);
$('folderBtn').onclick = chooseFolderFromUi;
$('settingsFolderBtn').onclick = chooseFolderFromUi;
$('openSettingsBtn').onclick = openSettings;
$('settingsNav').onclick = openSettings;
$('savePickerKeyBtn').onclick = () => { StoryFlowIntegrations.setPickerApiKey(els.pickerApiKeyInput.value); notify('Picker API Key 已保存在這台瀏覽器'); };
$('clearPickerKeyBtn').onclick = () => { StoryFlowIntegrations.setPickerApiKey(''); els.pickerApiKeyInput.value = ''; notify('已清除本機 API Key'); };
$('pasteSampleBtn').onclick = () => {
  const chapter = activeChapter();
  chapter.draft = '　　雨停了。她站在門邊，看著街上的積水。\n　　風從巷口吹進來，帶著潮濕的味道。\n\n　　三天以前，他還坐在這張桌子旁。\n　　她記得那天下午的光線，也記得那句沒有說完的話。\n\n　　電話忽然響了。\n　　她沒有立刻接。\n　　直到第三聲，她才伸出手。\n\n　　「喂？」\n　　另一端沉默了很久。\n　　然後，一個熟悉的聲音說：「我回來了。」';
  chapter.confirmedBlockCount = 0; chapter.parts = []; chapter.source = null; suggestion = null;
  saveState('已載入範例'); renderAll();
};

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
}));

renderAll();
refreshFolderStatus();
window.StoryFlowFolderConnection = { choose: chooseFolder, refresh: refreshFolderStatus };
