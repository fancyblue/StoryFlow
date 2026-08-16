const STORAGE_KEY = 'storyflow.state.v2';
const platforms = ['巴哈小屋', 'EP', '方格子', 'Matters', 'CxC', 'Penana'];

const defaultState = {
  projectTitle: '未命名作品',
  chapters: [{
    id: crypto.randomUUID(),
    title: '第一章',
    draft: '',
    confirmedBlockCount: 0,
    parts: [],
    source: null
  }],
  activeChapterId: null,
  minChars: 1000,
  maxChars: 3000,
  sceneMarker: '＊＊＊'
};
defaultState.activeChapterId = defaultState.chapters[0].id;

let state = loadState();
let suggestion = null;
let outputFolderState = { supported: true, connected: false };

const $ = (id) => document.getElementById(id);
const els = {
  projectTitle: $('projectTitle'), chapterTitle: $('chapterTitle'), draft: $('draft'), chapterList: $('chapterList'),
  minChars: $('minChars'), maxChars: $('maxChars'), sceneMarker: $('sceneMarker'), chapterChars: $('chapterChars'),
  publishedChars: $('publishedChars'), remainingChars: $('remainingChars'), partCount: $('partCount'), draftMeta: $('draftMeta'),
  suggestionEmpty: $('suggestionEmpty'), suggestionCard: $('suggestionCard'), suggestionName: $('suggestionName'),
  suggestionChars: $('suggestionChars'), suggestionStatus: $('suggestionStatus'), suggestionReason: $('suggestionReason'), preview: $('preview'),
  partsList: $('partsList'), saveState: $('saveState'), sourceMeta: $('sourceMeta'), syncGoogleBtn: $('syncGoogleBtn'),
  googleDot: $('googleDot'), googleStatus: $('googleStatus'), folderDot: $('folderDot'), folderStatus: $('folderStatus'),
  settingsDialog: $('settingsDialog'), pickerApiKeyInput: $('pickerApiKeyInput')
};

function loadState() {
  for (const key of [STORAGE_KEY, 'storyflow.state.v1']) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (parsed?.chapters?.length) {
        parsed.chapters.forEach(c => { c.source ||= null; c.parts ||= []; });
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
  els.saveState.textContent = message;
  els.saveState.classList.toggle('error-text', isError);
  window.setTimeout(() => {
    els.saveState.textContent = '已儲存';
    els.saveState.classList.remove('error-text');
  }, 2800);
}

function activeChapter() {
  return state.chapters.find(c => c.id === state.activeChapterId) || state.chapters[0];
}

function charCount(text) { return String(text || '').replace(/\s/g, '').length; }

function normalizeImportedMarkdown(markdown) {
  return String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+.*\n+/, '')
    .replace(/\\([*_])/g, '$1')
    .trim();
}

function parseBlocks(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  return normalized.split(/\n\s*\n+/).map((raw, index) => ({
    id: `block-${index + 1}`,
    raw: raw.trim(),
    chars: charCount(raw),
    strongBoundaryAfter: true
  }));
}

function webFormat(text, marker = state.sceneMarker) {
  return parseBlocks(text).map(b => b.raw
    .split('\n')
    .map(line => line.replace(/^[\u3000 ]{1,2}/, '').trimEnd())
    .filter(Boolean)
    .join('\n\n'))
    .join(`\n\n${marker}\n\n`);
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
    const distance = chars < min ? (min - chars) * 1.8 : Math.abs(chars - target);
    const overflow = chars > max ? (chars - max) * 1.25 : 0;
    const score = distance + overflow;
    if (chars >= Math.max(400, min * 0.6) && score < bestScore) {
      bestScore = score;
      bestEnd = end;
    }
    if (chars > max * 1.8) break;
  }

  suggestion = buildSuggestion(start, bestEnd || Math.min(start + 1, blocks.length), blocks);
  renderSuggestion();
}

function buildSuggestion(start, end, blocks = parseBlocks(activeChapter().draft)) {
  const chapter = activeChapter();
  const selected = blocks.slice(start, end);
  const raw = selected.map(b => b.raw).join('\n\n');
  const chars = charCount(raw);
  const max = Number(state.maxChars) || 3000;
  const min = Number(state.minChars) || 1000;
  let status = '建議';
  if (chars > max) status = '超過偏好';
  else if (chars < min) status = '低於偏好';
  return {
    start, end, raw, formatted: webFormat(raw), chars,
    name: `${chapter.title}（${chapter.parts.length + 1}）`,
    status,
    reason: end < blocks.length ? '切點位於原稿的自然空白段落邊界。你可以繼續把後面的段落拉進來，即使超過偏好字數。' : '目前已到章節最新內容；可以確認，或等待原稿繼續增加。'
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
    schemaVersion: 1,
    projectTitle: state.projectTitle,
    chapter: chapter.title,
    source: chapter.source,
    confirmedBlockCount: chapter.confirmedBlockCount,
    updatedAt: new Date().toISOString(),
    parts: chapter.parts.map(p => ({
      id: p.id, title: p.title, startBlock: p.startBlock, endBlock: p.endBlock,
      chars: p.chars, published: p.published, platformStatus: p.platformStatus
    }))
  };
}

async function confirmSuggestion() {
  if (!suggestion) return;
  const chapter = activeChapter();
  const part = {
    id: crypto.randomUUID(), title: suggestion.name, startBlock: suggestion.start, endBlock: suggestion.end,
    chars: suggestion.chars, raw: suggestion.raw, formatted: suggestion.formatted, published: false,
    platformStatus: Object.fromEntries(platforms.map(p => [p, false]))
  };
  chapter.parts.push(part);
  chapter.confirmedBlockCount = suggestion.end;
  suggestion = null;
  saveState('正在保存…');
  renderAll();

  try {
    const path = await StoryFlowIntegrations.savePart({
      projectTitle: state.projectTitle,
      chapter,
      part,
      metadata: chapterMetadata(chapter)
    });
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
    platforms.forEach(p => {
      const badge = document.createElement('button');
      badge.className = `platform-badge ${part.platformStatus?.[p] ? 'done' : ''}`;
      badge.textContent = `${p}${part.platformStatus?.[p] ? ' ✓' : ''}`;
      badge.onclick = () => {
        part.platformStatus[p] = !part.platformStatus[p];
        part.published = Object.values(part.platformStatus).some(Boolean);
        saveState(); renderAll();
      };
      pbox.appendChild(badge);
    });
    node.querySelector('.copy-btn').onclick = async () => {
      await navigator.clipboard.writeText(part.formatted);
      notify('已複製網路版');
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
  const confirmed = blocks.slice(0, chapter.confirmedBlockCount || 0).map(b => b.raw).join('\n\n');
  const remaining = blocks.slice(chapter.confirmedBlockCount || 0).map(b => b.raw).join('\n\n');
  els.chapterChars.textContent = charCount(chapter.draft).toLocaleString();
  els.publishedChars.textContent = charCount(confirmed).toLocaleString();
  els.remainingChars.textContent = charCount(remaining).toLocaleString();
  els.partCount.textContent = chapter.parts.length.toLocaleString();
  els.draftMeta.textContent = `${charCount(chapter.draft).toLocaleString()} 字 · ${blocks.length} 段落群組`;
}

function renderSource() {
  const source = activeChapter().source;
  if (!source) {
    els.sourceMeta.textContent = '尚未綁定 Google Docs';
    els.syncGoogleBtn.disabled = true;
    return;
  }
  els.sourceMeta.textContent = `來源：${source.name} · 上次同步 ${new Date(source.syncedAt).toLocaleString('zh-TW')}`;
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

function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}

async function loginGoogle() {
  try {
    await StoryFlowIntegrations.requestAccessToken();
    els.googleDot.classList.add('connected');
    els.googleStatus.textContent = '本次工作階段已授權';
    $('googleLoginBtn').textContent = '已登入';
    notify('Google 授權完成');
  } catch (error) { notify(error.message, true); }
}

async function importGoogleDoc() {
  try {
    if (!StoryFlowIntegrations.pickerApiKey()) {
      openSettings();
      notify('請先在整合設定輸入 Picker API Key', true);
      return;
    }
    notify('正在開啟 Google Docs…');
    const doc = await StoryFlowIntegrations.importGoogleDoc();
    const chapter = activeChapter();
    const nextDraft = normalizeImportedMarkdown(doc.markdown);
    if (chapter.draft && chapter.draft !== nextDraft && !confirm('這會更新目前章節的原稿快照，但不會動到已確認的切篇。確定繼續？')) return;
    chapter.draft = nextDraft;
    chapter.source = { id: doc.id, name: doc.name, url: doc.url, syncedAt: new Date().toISOString() };
    suggestion = null;
    saveState('Google Docs 已匯入');
    renderAll();
    await loginGoogleStatusOnly();
  } catch (error) {
    if (!/取消選取/.test(error.message)) notify(error.message, true);
  }
}

async function syncGoogleDoc() {
  const chapter = activeChapter();
  if (!chapter.source?.id) return;
  try {
    notify('正在同步 Google Docs…');
    const markdown = await StoryFlowIntegrations.exportGoogleDocAsMarkdown(chapter.source.id);
    chapter.draft = normalizeImportedMarkdown(markdown);
    chapter.source.syncedAt = new Date().toISOString();
    suggestion = null;
    saveState('同步完成');
    renderAll();
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

async function chooseFolder() {
  try {
    const result = await StoryFlowIntegrations.chooseOutputDirectory();
    notify(`已連接 ${result.name}`);
    await refreshFolderStatus();
  } catch (error) {
    if (error.name !== 'AbortError') notify(error.message, true);
  }
}

function openSettings() {
  els.pickerApiKeyInput.value = StoryFlowIntegrations.pickerApiKey();
  els.settingsDialog.showModal();
}

els.projectTitle.addEventListener('input', e => { state.projectTitle = e.target.value; saveState(); });
els.chapterTitle.addEventListener('input', e => { activeChapter().title = e.target.value; suggestion = null; saveState(); renderChapters(); });
els.draft.addEventListener('input', e => { activeChapter().draft = e.target.value; suggestion = null; saveState(); renderStats(); });
els.minChars.addEventListener('change', e => { state.minChars = Number(e.target.value); suggestion = null; saveState(); });
els.maxChars.addEventListener('change', e => { state.maxChars = Number(e.target.value); suggestion = null; saveState(); });
els.sceneMarker.addEventListener('input', e => { state.sceneMarker = e.target.value || '＊＊＊'; saveState(); if (suggestion) suggestNextPart(); });
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
$('folderBtn').onclick = chooseFolder;
$('settingsFolderBtn').onclick = chooseFolder;
$('openSettingsBtn').onclick = openSettings;
$('settingsNav').onclick = openSettings;
$('savePickerKeyBtn').onclick = () => {
  StoryFlowIntegrations.setPickerApiKey(els.pickerApiKeyInput.value);
  notify('Picker API Key 已保存在這台瀏覽器');
};
$('clearPickerKeyBtn').onclick = () => {
  StoryFlowIntegrations.setPickerApiKey('');
  els.pickerApiKeyInput.value = '';
  notify('已清除本機 API Key');
};
$('pasteSampleBtn').onclick = () => {
  const chapter = activeChapter();
  chapter.draft = '　　雨停了。她站在門邊，看著街上的積水。\n　　風從巷口吹進來，帶著潮濕的味道。\n\n　　三天以前，他還坐在這張桌子旁。\n　　她記得那天下午的光線，也記得那句沒有說完的話。\n\n　　電話忽然響了。\n　　她沒有立刻接。\n　　直到第三聲，她才伸出手。\n\n　　「喂？」\n　　另一端沉默了很久。\n　　然後，一個熟悉的聲音說：「我回來了。」';
  chapter.confirmedBlockCount = 0; chapter.parts = []; chapter.source = null; suggestion = null;
  saveState('已載入範例'); renderAll();
};

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
}));

renderAll();
refreshFolderStatus();
