const STORAGE_KEY = 'storyflow.state.v1';
const platforms = ['巴哈小屋', 'EP', '方格子', 'Matters', 'CxC', 'Penana'];

const defaultState = {
  projectTitle: '未命名作品',
  chapters: [
    {
      id: crypto.randomUUID(),
      title: '第一章',
      draft: '',
      confirmedBlockCount: 0,
      parts: []
    }
  ],
  activeChapterId: null,
  minChars: 1000,
  maxChars: 3000,
  sceneMarker: '＊＊＊'
};
defaultState.activeChapterId = defaultState.chapters[0].id;

let state = loadState();
let suggestion = null;

const $ = (id) => document.getElementById(id);
const els = {
  projectTitle: $('projectTitle'), chapterTitle: $('chapterTitle'), draft: $('draft'), chapterList: $('chapterList'),
  minChars: $('minChars'), maxChars: $('maxChars'), sceneMarker: $('sceneMarker'), chapterChars: $('chapterChars'),
  publishedChars: $('publishedChars'), remainingChars: $('remainingChars'), partCount: $('partCount'), draftMeta: $('draftMeta'),
  suggestionEmpty: $('suggestionEmpty'), suggestionCard: $('suggestionCard'), suggestionName: $('suggestionName'),
  suggestionChars: $('suggestionChars'), suggestionStatus: $('suggestionStatus'), suggestionReason: $('suggestionReason'), preview: $('preview'),
  partsList: $('partsList'), saveState: $('saveState'), docsDialog: $('docsDialog')
};

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed?.chapters?.length) return parsed;
  } catch (_) {}
  return structuredClone(defaultState);
}

function saveState(label = '已儲存') {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  els.saveState.textContent = label;
  window.setTimeout(() => { els.saveState.textContent = '已儲存'; }, 900);
}

function activeChapter() {
  return state.chapters.find(c => c.id === state.activeChapterId) || state.chapters[0];
}

function charCount(text) {
  return text.replace(/\s/g, '').length;
}

function parseBlocks(text) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const groups = normalized.split(/\n\s*\n+/);
  return groups.map((raw, index) => ({
    id: `block-${index + 1}`,
    raw: raw.trim(),
    chars: charCount(raw),
    strongBoundaryAfter: index < groups.length - 1
  }));
}

function webFormat(text, marker = state.sceneMarker) {
  const blocks = parseBlocks(text);
  return blocks.map(b => b.raw
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
    return;
  }

  const min = Number(state.minChars) || 1000;
  const max = Number(state.maxChars) || 3000;
  let end = start;
  let chars = 0;
  let bestEnd = null;
  let bestScore = Infinity;

  while (end < blocks.length) {
    chars += blocks[end].chars;
    end += 1;
    const distance = chars < min ? (min - chars) * 2 : Math.abs(chars - ((min + max) / 2));
    const overflow = chars > max ? (chars - max) * 1.35 : 0;
    const boundaryBonus = end < blocks.length ? -180 : 0;
    const score = distance + overflow + boundaryBonus;
    if (chars >= Math.max(400, min * 0.65) && score < bestScore) {
      bestScore = score;
      bestEnd = end;
    }
    if (chars > max * 1.8) break;
  }

  const chosenEnd = bestEnd || Math.min(start + 1, blocks.length);
  suggestion = buildSuggestion(start, chosenEnd, blocks);
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
  const isNatural = end < blocks.length;
  return {
    start, end, raw, formatted: webFormat(raw), chars,
    name: `${chapter.title}（${chapter.parts.length + 1}）`,
    status,
    reason: isNatural ? '切點位於原稿空白行／段落群組之間，可手動前後調整。' : '目前已到章節最新內容，可直接確認或等待追加內容。'
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

function confirmSuggestion() {
  if (!suggestion) return;
  const chapter = activeChapter();
  chapter.parts.push({
    id: crypto.randomUUID(),
    title: suggestion.name,
    startBlock: suggestion.start,
    endBlock: suggestion.end,
    chars: suggestion.chars,
    raw: suggestion.raw,
    formatted: suggestion.formatted,
    published: false,
    platformStatus: Object.fromEntries(platforms.map(p => [p, false]))
  });
  chapter.confirmedBlockCount = suggestion.end;
  suggestion = null;
  saveState('已確認');
  renderAll();
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
      const badge = document.createElement('span');
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
      els.saveState.textContent = '已複製網路版';
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

function renderAll() {
  const chapter = activeChapter();
  els.projectTitle.value = state.projectTitle;
  els.chapterTitle.value = chapter.title;
  els.draft.value = chapter.draft;
  els.minChars.value = state.minChars;
  els.maxChars.value = state.maxChars;
  els.sceneMarker.value = state.sceneMarker;
  renderChapters(); renderStats(); renderParts(); renderSuggestion();
}

function createChapter() {
  const next = state.chapters.length + 1;
  const chapter = { id: crypto.randomUUID(), title: `第${next}章`, draft: '', confirmedBlockCount: 0, parts: [] };
  state.chapters.push(chapter);
  state.activeChapterId = chapter.id;
  suggestion = null;
  saveState('已新增章節');
  renderAll();
}

function escapeHtml(s) {
  return s.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
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
$('docsPlaceholderBtn').onclick = () => els.docsDialog.showModal();
$('pasteSampleBtn').onclick = () => {
  activeChapter().draft = '　　雨停了。她站在門邊，看著街上的積水。\n　　風從巷口吹進來，帶著潮濕的味道。\n\n　　三天以前，他還坐在這張桌子旁。\n　　她記得那天下午的光線，也記得那句沒有說完的話。\n\n　　電話忽然響了。\n　　她沒有立刻接。\n　　直到第三聲，她才伸出手。\n\n　　「喂？」\n　　另一端沉默了很久。\n　　然後，一個熟悉的聲音說：「我回來了。」';
  activeChapter().confirmedBlockCount = 0;
  activeChapter().parts = [];
  suggestion = null;
  saveState('已載入範例');
  renderAll();
};

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
}));

renderAll();
