// Publishing preview: the preview-and-copy panel inside the article being managed.
//
// The panel shows one version of one article — StoryFlow's default output or a platform's —
// and carries that version's title, copy options, optional helpers and the copy / mark
// published actions. The publishing data it changes is written by publishing-flow.js, which
// hands over those actions once through configure(); this module only renders and wires them.
// Output and status rules live in publishing-output.js.
(function () {
  const {
    isVisualPart,
    visualContentComplete,
    pendingMarks,
    includeAfterwordFor,
    outputSections,
    outputFor,
    afterwordChars,
    platformLabel,
    publishTitleFor,
    hasPlatformHashtagsOverride,
    hasPlatformSummaryOverride,
    summaryFor,
    copyTitleStyleFor,
    setCopyTitleStyle,
    hashtagsFor,
    outputWithTitle,
    richOutputHtml,
    writeClipboard,
    normalizePartStatus
  } = window.StoryFlowPublishingOutput;

  // Set by publishing-flow.js: entryFor, savePlatformTitle, savePlatformHashtags,
  // savePlatformSummary, openPublicationRecord, setPlatformPublished, persistPublicationChange,
  // togglePlatformPublished, writeArticleMarkdown, writeVisualEntry.
  let actions = null;

  let visualPreviewUrls = [];

  // Preview and copy is a panel inside the row being managed, not a dialog over it. The
  // rail on the right picks which version the panel shows; nothing opens on top of the
  // thing you already opened.
  function buildPublishPreviewPanel() {
    const panel = document.createElement('section');
    panel.className = 'publish-preview-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="publish-preview-panel-head">
        <h3 id="platformPreviewTitle">預覽與複製</h3>
      </div>
      <div class="platform-preview-body">
        <p id="platformPreviewMeta" class="muted platform-preview-meta" hidden></p>
        <section id="platformPreviewSettings" class="platform-preview-settings" aria-label="發布與複製設定">
          <div class="platform-preview-title-copy" aria-label="發布標題">
          <div>
            <span id="platformPreviewTitleSource">發布標題</span>
            <strong id="platformPreviewPublishTitle"></strong>
          </div>
          <div class="platform-preview-title-actions">
            <button id="copyPlatformTitle" class="button tiny ghost" type="button" aria-label="複製標題">複製</button>
            <button id="editPlatformTitle" class="button tiny ghost" type="button" aria-label="修改此平台標題">編輯</button>
          </div>
          </div>
        <div id="platformPreviewTitleEditor" class="platform-preview-title-editor" hidden>
          <label class="field-label" for="platformPreviewTitleInput">此平台標題</label>
          <div class="platform-preview-title-editor-controls">
            <input id="platformPreviewTitleInput" class="text-input" type="text" maxlength="200" />
            <button id="savePlatformPreviewTitle" class="button primary" type="button">保存標題</button>
            <button id="resetPlatformPreviewTitle" class="button ghost" type="button">改回沿用</button>
          </div>
          <small>只影響目前平台，不修改來源文章名稱或 Markdown 檔名。</small>
        </div>
        <div id="platformPreviewOptions" class="platform-preview-options">
          <span id="platformPreviewOptionsSummary" hidden>使用預設</span>
          <div class="platform-preview-options-body">
            <div class="platform-preview-copy-title-option">
              <label>
                <input id="platformPreviewIncludeTitle" type="checkbox" />
                <span>內容前附上標題</span>
              </label>
              <select id="platformPreviewTitleStyle" class="text-input" disabled aria-label="標題格式">
                <option value="heading">大標題</option>
                <option value="bold">粗體</option>
              </select>
            </div>
            <label id="platformPreviewAfterwordOption" class="platform-preview-afterword-option" hidden>
              <input id="platformPreviewIncludeAfterword" type="checkbox" />
              <span>附上後記</span>
              <small id="platformPreviewAfterwordCount"></small>
            </label>
          </div>
        </div>
        </section>
        <div class="platform-preview-content-head"><strong>內容預覽</strong><span>主要內容</span></div>
        <div id="platformPreviewContent" class="platform-preview-content"></div>
        <section id="platformPreviewVisualExtras" class="platform-preview-visual-extras" aria-label="此平台的摘要與 Hashtags" hidden>
          <div class="platform-preview-visual-extras-head">
            <strong id="platformPreviewExtrasTitle">此平台的摘要與 Hashtags</strong>
            <span>未另外調整時，沿用「這篇文章」的共用設定。</span>
          </div>
          <div id="platformPreviewSummaryBlock" class="platform-preview-extra-block" hidden>
            <div class="platform-preview-extra-row">
              <button id="copyPlatformSummary" class="platform-preview-extra-copy" type="button">
                <span>摘要</span><p id="platformPreviewSummary"></p><small>點一下複製</small>
              </button>
              <button id="editPlatformPreviewSummary" class="button tiny ghost" type="button" aria-expanded="false" hidden>編輯</button>
            </div>
            <section id="platformPreviewSummaryEditor" class="platform-preview-extra-editor" hidden>
              <div class="platform-preview-extra-editor-head">
                <label for="platformPreviewSummaryInput">此平台摘要</label>
                <span id="platformPreviewSummaryState"></span>
              </div>
              <textarea id="platformPreviewSummaryInput" class="text-input" rows="3" maxlength="500"></textarea>
              <div class="platform-preview-extra-editor-actions">
                <button id="savePlatformPreviewSummary" class="button tiny primary" type="button">儲存</button>
                <button id="resetPlatformPreviewSummary" class="button tiny ghost" type="button">沿用共用</button>
              </div>
              <small>未自訂時沿用共用摘要；儲存空白也會改回沿用。</small>
            </section>
          </div>
          <div id="platformPreviewHashtagsBlock" class="platform-preview-extra-block platform-preview-hashtags-block" hidden>
            <div class="platform-preview-extra-row platform-preview-hashtags-row">
              <button id="copyPlatformHashtags" class="platform-preview-extra-copy" type="button">
                <span>Hashtags</span><p id="platformPreviewHashtags"></p><small>點一下複製</small>
              </button>
              <button id="editPlatformPreviewHashtags" class="button tiny ghost" type="button" aria-expanded="false">編輯</button>
            </div>
            <section id="platformPreviewHashtagsEditor" class="platform-preview-extra-editor platform-preview-platform-hashtags" hidden>
              <div class="platform-preview-extra-editor-head platform-preview-platform-hashtags-head">
                <label for="platformPreviewHashtagsInput">此平台 Hashtags</label>
                <span id="platformPreviewHashtagsState"></span>
              </div>
              <input id="platformPreviewHashtagsInput" class="text-input" type="text" maxlength="500" placeholder="#創作 #小說" />
              <div class="platform-preview-extra-editor-actions platform-preview-platform-hashtags-actions">
                <button id="savePlatformPreviewHashtags" class="button tiny primary" type="button">儲存</button>
                <button id="resetPlatformPreviewHashtags" class="button tiny ghost" type="button">沿用共用</button>
              </div>
              <small>未自訂時沿用共用值；儲存空白代表此平台不使用 Hashtags。</small>
            </section>
          </div>
        </section>
      </div>
      <div class="platform-preview-actions">
        <button id="platformPreviewRecordBtn" class="button ghost" type="button" hidden>記錄發布</button>
        <button id="togglePlatformPublished" class="button ghost" type="button">標註已發布</button>
        <span class="platform-preview-actions-spacer"></span>
        <button id="confirmPlatformCopy" class="button primary" type="button">複製內容</button>
      </div>`;
    return panel;
  }

  function renderPublishPreview(panel, part, platform, contentMode = '') {
    const {
      entryFor, savePlatformTitle, savePlatformHashtags, savePlatformSummary, openPublicationRecord,
      setPlatformPublished, persistPublicationChange, togglePlatformPublished,
      writeArticleMarkdown, writeVisualEntry
    } = actions;
    const visual = contentMode === StoryFlowContentModel.CONTENT_MODES.VISUAL || isVisualPart(part);
    const platformSpecific = Boolean(platform);
    normalizePartStatus(part);
    const entry = entryFor(part);
    const toggle = panel.querySelector('#togglePlatformPublished');
    const settings = panel.querySelector('#platformPreviewSettings');
    const afterwordOption = panel.querySelector('#platformPreviewAfterwordOption');
    const includeAfterword = panel.querySelector('#platformPreviewIncludeAfterword');
    const includeTitle = panel.querySelector('#platformPreviewIncludeTitle');
    const titleStyle = panel.querySelector('#platformPreviewTitleStyle');
    const titleEditor = panel.querySelector('#platformPreviewTitleEditor');
    const titleInput = panel.querySelector('#platformPreviewTitleInput');
    const options = panel.querySelector('#platformPreviewOptions');
    const optionsSummary = panel.querySelector('#platformPreviewOptionsSummary');
    const editTitle = panel.querySelector('#editPlatformTitle');
    const summaryBlock = panel.querySelector('#platformPreviewSummaryBlock');
    const hashtagsBlock = panel.querySelector('#platformPreviewHashtagsBlock');
    const hashtagsEditor = panel.querySelector('#platformPreviewHashtagsEditor');
    const hashtagsInput = panel.querySelector('#platformPreviewHashtagsInput');
    const hashtagsState = panel.querySelector('#platformPreviewHashtagsState');
    const editHashtags = panel.querySelector('#editPlatformPreviewHashtags');
    const resetHashtags = panel.querySelector('#resetPlatformPreviewHashtags');
    const visualExtras = panel.querySelector('#platformPreviewVisualExtras');
    const summaryCard = panel.querySelector('#copyPlatformSummary');
    const summaryEditor = panel.querySelector('#platformPreviewSummaryEditor');
    const summaryInput = panel.querySelector('#platformPreviewSummaryInput');
    const summaryState = panel.querySelector('#platformPreviewSummaryState');
    const editSummary = panel.querySelector('#editPlatformPreviewSummary');
    const resetSummary = panel.querySelector('#resetPlatformPreviewSummary');
    // Only a visual article's summary can differ by platform; a longform one is shared.
    const summaryEditable = platformSpecific && visual;
    const hashtagsCard = panel.querySelector('#copyPlatformHashtags');
    let summaryText = summaryFor(part, platform);
    let hashtagsText = hashtagsFor(part, platform);
    const afterwordCount = afterwordChars(part);
    const isPublished = platform ? Boolean(part.platformStatus[platform]) : false;

    const refreshContent = () => {
      const container = panel.querySelector('#platformPreviewContent');
      const sections = outputSections(part, platform, includeAfterword.checked);
      if (visual && !part.images?.length) {
        renderOneImagePreview(container, part, includeTitle.checked ? titleStyle.value : '', platform, includeAfterword.checked);
      } else if (visual) {
        renderVisualPublishPreview(container, part, outputFor(part, platform, includeAfterword.checked), includeTitle.checked ? titleStyle.value : '', platform);
      } else if (window.StoryFlowArticleImages?.renderPreview) {
        window.StoryFlowArticleImages.renderPreview(container, part, sections, {
          projectTitle: state.projectTitle,
          chapterTitle: entryFor(part)?.chapter?.title || ''
        });
      } else {
        container.textContent = outputFor(part, platform, includeAfterword.checked);
      }
      if (includeTitle.checked && !visual) {
        if (container.dataset.sfPreviewManaged === 'article-images') {
          const titleNode = document.createElement(titleStyle.value === 'bold' ? 'strong' : 'h1');
          titleNode.className = `platform-preview-included-title ${titleStyle.value}`;
          titleNode.textContent = publishTitleFor(part, platform);
          container.prepend(titleNode);
        } else {
          container.textContent = outputWithTitle(part, platform, includeAfterword.checked, titleStyle.value);
        }
      }
      window.StoryFlowPreviewMode?.refresh?.();
    };

    const refreshTitle = () => {
      const currentTitle = publishTitleFor(part, platform);
      const platformOverride = platform && String(part.platformTitles?.[platform] || '').trim();
      const legacyOverride = String(part.publishTitle || '').trim();
      panel.querySelector('#platformPreviewTitle').textContent = platformSpecific
        ? `預覽與複製 · ${platformLabel(platform)}`
        : '預覽';
      panel.querySelector('#platformPreviewPublishTitle').textContent = currentTitle;
      panel.querySelector('#platformPreviewTitleSource').textContent = platformOverride
        ? '發布標題 · 此平台自訂'
        : legacyOverride ? '發布標題 · 沿用既有共用標題' : `發布標題 · 沿用${visual ? '圖文' : '文章'}名稱`;
      titleInput.value = platformOverride || '';
      refreshContent();
    };

    const previewMeta = panel.querySelector('#platformPreviewMeta');
    previewMeta.textContent = platform
      ? `${platform} · ${visual ? '文字與圖片順序' : '貼文內容'}`
      : '預設輸出預覽 · 不會變更發布狀態';
    if (publishTitleFor(part, platform) !== part.title) {
      previewMeta.textContent += ` · 內部名稱：${part.title}`;
    }
    previewMeta.hidden = true;
    settings.hidden = !platformSpecific;
    settings.classList.toggle('hidden', !platformSpecific);
    editTitle.hidden = !platformSpecific;
    titleEditor.hidden = true;
    hashtagsEditor.hidden = true;
    summaryEditor.hidden = true;
    editSummary.hidden = !summaryEditable;
    editSummary.setAttribute('aria-expanded', 'false');
    editSummary.textContent = '編輯';
    editHashtags.hidden = !platformSpecific;
    editHashtags.setAttribute('aria-expanded', 'false');
    editHashtags.textContent = '編輯';
    summaryBlock.hidden = !platformSpecific;
    summaryBlock.classList.toggle('hidden', !platformSpecific);
    visualExtras.hidden = !platformSpecific;
    visualExtras.classList.toggle('hidden', !platformSpecific);

    const setExtraEditorExpanded = (button, editor, expanded, input) => {
      editor.hidden = !expanded;
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = expanded ? '收合' : '編輯';
      if (expanded) {
        input.focus();
        editor.scrollIntoView({ block: 'nearest' });
      }
    };

    const refreshSummaryView = () => {
      summaryText = summaryFor(part, platform);
      const ownSummary = hasPlatformSummaryOverride(part, platform);
      summaryCard.disabled = !summaryText;
      panel.querySelector('#platformPreviewSummary').textContent = summaryText || '尚未設定';
      // Both content types write their shared summary in one place: 摘要與 Hashtags, beside the
      // text rather than in the editor of it. A visual platform may then write its own here.
      summaryCard.querySelector('small').textContent = summaryText ? '點一下複製' : summaryEditable ? '' : '在「這篇文章」的摘要與 Hashtags 設定';
      summaryInput.value = summaryText;
      summaryState.textContent = ownSummary ? '此平台自訂' : '沿用共用';
      resetSummary.disabled = !ownSummary;
      summaryCard.onclick = async () => {
        if (!summaryText) return;
        try {
          await writeClipboard(summaryText);
          notify('已複製摘要');
        } catch (error) {
          notify(`複製摘要失敗：${error.message}`, true);
        }
      };
    };
    refreshSummaryView();
    const refreshHashtagsView = () => {
      hashtagsText = hashtagsFor(part, platform);
      const overridden = hasPlatformHashtagsOverride(part, platform);
      hashtagsBlock.hidden = !platformSpecific;
      hashtagsBlock.classList.toggle('hidden', !platformSpecific);
      hashtagsCard.disabled = !hashtagsText;
      visualExtras.hidden = !platformSpecific;
      visualExtras.classList.toggle('hidden', !platformSpecific);
      // Named for the platform it belongs to: these rows sit in that platform's version, while
      // the article's own summary and Hashtags are set once for every platform in the rail.
      if (platformSpecific) panel.querySelector('#platformPreviewExtrasTitle').textContent = `「${platform}」的摘要與 Hashtags`;
      panel.querySelector('#platformPreviewHashtags').textContent = hashtagsText || '尚未設定';
      // Empty, the value already reads 尚未設定 and 編輯 sits beside it; a hint repeating it adds nothing.
      hashtagsCard.querySelector('small').textContent = hashtagsText ? '點一下複製' : '';
      hashtagsInput.value = hashtagsText;
      hashtagsState.textContent = overridden
        ? (hashtagsText ? '此平台自訂' : '此平台不使用')
        : '沿用共用';
      resetHashtags.disabled = !overridden;
      panel.querySelector('#copyPlatformHashtags').onclick = async () => {
        if (!hashtagsText) return;
        try {
          await writeClipboard(hashtagsText);
          notify('已複製 Hashtags');
        } catch (error) {
          notify(`複製 Hashtags 失敗：${error.message}`, true);
        }
      };
    };
    refreshHashtagsView();
    // Whether the copy starts with the title is the platform's own habit, remembered in its
    // formatting; the StoryFlow default output never carries one.
    const savedTitleStyle = copyTitleStyleFor(platform);
    includeTitle.checked = Boolean(savedTitleStyle);
    titleStyle.value = savedTitleStyle || 'heading';
    titleStyle.disabled = !includeTitle.checked;
    const rememberTitleStyle = () => {
      if (!platformSpecific) return;
      setCopyTitleStyle(platform, includeTitle.checked ? titleStyle.value : '');
      saveState('複製標題設定已更新');
    };
    const refreshOptionsSummary = () => {
      const labels = [];
      if (includeTitle.checked) labels.push(titleStyle.value === 'bold' ? '含粗體標題' : '含大標題');
      if (!afterwordOption.hidden && includeAfterword.checked) labels.push('含後記');
      optionsSummary.textContent = labels.length ? labels.join(' · ') : '使用預設';
    };
    editTitle.onclick = () => {
      titleEditor.hidden = !titleEditor.hidden;
      if (!titleEditor.hidden) titleInput.focus();
    };
    editSummary.onclick = () => {
      if (!summaryEditable) return;
      setExtraEditorExpanded(editSummary, summaryEditor, summaryEditor.hidden, summaryInput);
    };
    panel.querySelector('#savePlatformPreviewSummary').onclick = window.StoryFlowShared.whileSaving(async () => {
      if (!summaryEditable) return;
      await savePlatformSummary(part, platform, summaryInput);
      refreshSummaryView();
      setExtraEditorExpanded(editSummary, summaryEditor, false, summaryInput);
    });
    resetSummary.onclick = window.StoryFlowShared.whileSaving(async () => {
      if (!summaryEditable) return;
      await savePlatformSummary(part, platform, summaryInput, true);
      refreshSummaryView();
      setExtraEditorExpanded(editSummary, summaryEditor, false, summaryInput);
    });
    editHashtags.onclick = () => {
      if (!platformSpecific) return;
      setExtraEditorExpanded(editHashtags, hashtagsEditor, hashtagsEditor.hidden, hashtagsInput);
    };
    panel.querySelector('#savePlatformPreviewTitle').onclick = window.StoryFlowShared.whileSaving(async () => {
      if (!entry || !platform) return;
      await savePlatformTitle(entry.chapter, part, platform, titleInput);
      titleEditor.hidden = true;
      refreshTitle();
    });
    panel.querySelector('#resetPlatformPreviewTitle').onclick = window.StoryFlowShared.whileSaving(async () => {
      if (!entry || !platform) return;
      titleInput.value = '';
      await savePlatformTitle(entry.chapter, part, platform, titleInput);
      titleEditor.hidden = true;
      refreshTitle();
    });
    panel.querySelector('#savePlatformPreviewHashtags').onclick = window.StoryFlowShared.whileSaving(async () => {
      if (!entry || !platformSpecific) return;
      await savePlatformHashtags(entry.chapter, entry.part, platform, hashtagsInput);
      refreshHashtagsView();
      refreshOptionsSummary();
      setExtraEditorExpanded(editHashtags, hashtagsEditor, false, hashtagsInput);
    });
    resetHashtags.onclick = window.StoryFlowShared.whileSaving(async () => {
      if (!entry || !platformSpecific) return;
      await savePlatformHashtags(entry.chapter, entry.part, platform, hashtagsInput, true);
      refreshHashtagsView();
      refreshOptionsSummary();
      setExtraEditorExpanded(editHashtags, hashtagsEditor, false, hashtagsInput);
    });
    panel.querySelector('#copyPlatformTitle').onclick = async () => {
      try {
        await writeClipboard(publishTitleFor(part, platform));
        notify('已複製發布標題');
      } catch (error) {
        notify(`複製標題失敗：${error.message}`, true);
      }
    };
    includeTitle.onchange = () => {
      rememberTitleStyle();
      titleStyle.disabled = !includeTitle.checked;
      refreshOptionsSummary();
      refreshContent();
    };
    titleStyle.onchange = () => {
      rememberTitleStyle();
      refreshOptionsSummary();
      refreshContent();
    };
    afterwordOption.hidden = !platformSpecific || afterwordCount === 0;
    includeAfterword.checked = includeAfterwordFor(part, platform);
    panel.querySelector('#platformPreviewAfterwordCount').textContent = `${afterwordCount.toLocaleString()} 字`;
    includeAfterword.onchange = async () => {
      if (!platformSpecific) return;
      // This platform's own choice. Choosing what the shared default already says drops the
      // platform's entry, so it goes back to following the article.
      part.platformIncludeAfterword ||= {};
      if (includeAfterword.checked === (part.includeAfterword !== false)) delete part.platformIncludeAfterword[platform];
      else part.platformIncludeAfterword[platform] = includeAfterword.checked;
      saveState('後記輸出設定已更新');
      // Rebuilt rather than refreshed: the rail notes which platforms decided differently.
      renderParts();
      const entry = entryFor(part);
      if (!entry) return;
      try {
        const updated = visual ? await writeVisualEntry(part) : await writeArticleMarkdown(entry.chapter, part);
        if (updated) notify('後記輸出設定已更新');
        else notify('輸出設定目前只保留在畫面；請重新連接資料夾後再調整一次。', true);
      } catch (error) {
        notify(`輸出設定已更新，但文章 Markdown 尚未寫入：${error.message}`, true);
      }
    };
    refreshOptionsSummary();
    refreshTitle();
    const blockedByIncompleteVisual = Boolean(platform && visual && !isPublished && !visualContentComplete(part));
    const recordButton = panel.querySelector('#platformPreviewRecordBtn');
    recordButton.hidden = !platform;
    recordButton.textContent = isPublished ? '發布紀錄' : '記錄發布';
    recordButton.setAttribute('aria-label', `${isPublished ? '查看' : '記錄'}「${platform}」發布紀錄`);
    recordButton.disabled = blockedByIncompleteVisual;
    recordButton.title = blockedByIncompleteVisual ? '請先完成圖文內容' : '';
    recordButton.onclick = () => {
      if (!entry || !platform) return;
      openPublicationRecord(entry.chapter, part, platform);
    };
    toggle.hidden = !platform;
    toggle.textContent = isPublished ? '取消已發布標記' : '標註已發布';
    // The button's text is about the selected version; its accessible name has to say
    // which one, because nothing in the sentence "取消已發布標記" names a platform.
    toggle.setAttribute('aria-label', `${isPublished ? '取消' : '標註'}「${platform}」已發布`);
    toggle.classList.toggle('is-published', isPublished);
    toggle.disabled = blockedByIncompleteVisual;
    toggle.title = toggle.disabled ? '請先完成圖文標題，並加入正文或至少一張圖片' : '';

    panel.querySelector('#confirmPlatformCopy').onclick = async () => {
      try {
        const selectedTitleStyle = includeTitle.checked ? titleStyle.value : '';
        await writeClipboard(
          outputWithTitle(part, platform, includeAfterword.checked, selectedTitleStyle),
          richOutputHtml(part, platform, includeAfterword.checked, selectedTitleStyle)
        );
        notify(visual
          ? `已複製 ${platformLabel(platform)} 文字；圖片請依下方順序手動上傳`
          : `已複製 ${platformLabel(platform)} 內容`);
      } catch (error) {
        notify(`複製失敗：${error.message}`, true);
        return;
      }
      if (platform && !part.platformStatus?.[platform] && (!visual || visualContentComplete(part))) {
        const pending = pendingMarks(part);
        const markPublished = window.confirm(`已複製「${platform}」版本。\n\n${pending ? `這篇還有 ${pending} 處【待補】／【待確認】。\n\n` : ''}要將這個平台標註為已發布嗎？`);
        if (markPublished) {
          setPlatformPublished(part, platform, true);
          renderParts();
          await persistPublicationChange(part, `${platform} 已標註為已發布並記錄時間`);
        }
      }
    };

    toggle.onclick = () => {
      if (!platform) return;
      togglePlatformPublished(part, platform);
    };

    window.StoryFlowPreviewMode?.refresh?.();
    return panel;
  }

  // A visual entry's copy is plain text rather than the Markdown preview a longform part
  // gets, so its scene marker used to sit at the left margin while the same marker in an
  // article above it was centred. Marker lines are centred here the way the Markdown preview
  // centres them; every other line stays exactly the text that will be copied.
  function visualCopyHTML(body) {
    const marker = String(state?.sceneMarker || '').trim();
    return String(body || '').split('\n').map(line => {
      const value = line.trim();
      const isMarker = value && ((marker && value === marker) || /^[＊*]{3,}$/.test(value));
      return isMarker ? `<span class="visual-publish-scene">${escapeHtml(value)}</span>` : escapeHtml(line);
    }).join('<br>');
  }

  // A one-image article (REDESIGN_PROPOSAL C6) is previewed as the reader will see it — the
  // same renderer as the workspace's live preview — with its photo read from Google Drive
  // into memory. The photo cannot travel in the copied text, so it can be downloaded here and
  // uploaded on the platform at the 〔圖片〕 mark.
  function renderOneImagePreview(container, entry, titleStyle, platform, includeAfterword) {
    container.dataset.sfPreviewManaged = 'visual';
    container.innerHTML = '<article class="visual-article-preview visual-publish-article" data-width="desktop"></article><section class="visual-upload-order visual-photo-download"></section>';
    window.StoryFlowVisualWorkspace?.renderArticle?.(container.querySelector('article'), entry, {
      platform, includeAfterword, titleStyle: titleStyle ? 'heading' : ''
    });
    const photo = window.StoryFlowVisualPhotos?.byId?.(entry.photoId);
    const download = container.querySelector('.visual-photo-download');
    if (!photo) {
      download.innerHTML = `<div><strong>圖片</strong><span>${entry.photoId ? '照片庫裡已沒有這張照片。' : '這則圖文沒有圖片。'}</span></div>`;
      return;
    }
    download.innerHTML = `<div><strong>圖片</strong><span>圖片不會被複製或自動上傳；請在平台上、〔圖片〕的位置自行上傳這張照片。</span></div>
      <button class="button tiny ghost visual-photo-download-btn" type="button">下載圖片</button>`;
    download.querySelector('button').addEventListener('click', async event => {
      event.stopPropagation();
      const url = await window.StoryFlowVisualPhotos.load(photo);
      if (!url) return notify('無法從 Google Drive 讀取這張照片；請確認已登入 Google，且照片仍在 Drive。', true);
      const link = document.createElement('a');
      link.href = url;
      link.download = photo.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  function renderVisualPublishPreview(container, entry, body, titleStyle, platform) {
    visualPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    visualPreviewUrls = [];
    const title = titleStyle ? publishTitleFor(entry, platform) : '';
    container.dataset.sfPreviewManaged = 'visual';
    container.innerHTML = `
      ${title ? `<${titleStyle === 'bold' ? 'strong' : 'h1'} class="platform-preview-included-title ${titleStyle}">${escapeHtml(title)}</${titleStyle === 'bold' ? 'strong' : 'h1'}>` : ''}
      <div class="visual-publish-copy">${visualCopyHTML(body)}</div>
      <section class="visual-upload-order">
        <div><strong>圖片上傳順序</strong><span>圖片不會被複製或自動上傳，請依序手動選取。</span></div>
        <ol>${entry.images.length ? entry.images.map(image => `<li data-visual-publish-image="${escapeHtml(image.id)}"><div class="visual-upload-thumb"><span>載入中</span></div><div><strong>${escapeHtml(image.storedName)}</strong>${entry.coverImageId === image.id ? '<em>封面</em>' : ''}<small>${escapeHtml(image.alt || '尚未填寫替代文字')}${image.caption ? ` · ${escapeHtml(image.caption)}` : ''}</small></div></li>`).join('') : '<li class="visual-upload-empty">這則圖文沒有圖片。</li>'}</ol>
      </section>`;
    entry.images.forEach(async image => {
      const item = container.querySelector(`[data-visual-publish-image="${CSS.escape(image.id)}"]`);
      try {
        const file = await StoryFlowIntegrations.getVisualImageFile({ projectTitle: state.projectTitle, entryId: entry.id, storedName: image.storedName });
        const url = URL.createObjectURL(file);
        visualPreviewUrls.push(url);
        if (item?.isConnected) item.querySelector('.visual-upload-thumb').innerHTML = `<img src="${url}" alt="${escapeHtml(image.alt || '')}" />`;
      } catch (_) {
        if (item?.isConnected) item.querySelector('.visual-upload-thumb').innerHTML = '<span class="missing">找不到圖片檔</span>';
      }
    });
  }

  // The preview panel lives inside the list, so emptying it discards whatever object URLs
  // a visual preview was holding.
  function releaseUrls() {
    visualPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    visualPreviewUrls = [];
  }

  window.StoryFlowPublishingPreview = {
    configure(next) { actions = next; },
    buildPanel: buildPublishPreviewPanel,
    render: renderPublishPreview,
    releaseUrls
  };
})();
