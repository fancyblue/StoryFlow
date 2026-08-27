// Private article image assets copied into the connected StoryFlow folder.
(function () {
  const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const ACCEPTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
  const PLACEMENTS = [
    ['before-body', '正文前'],
    ['after-body', '正文後、後記前'],
    ['after-afterword', '後記後']
  ];
  let removeTarget = null;
  let lightboxUrl = '';

  function extension(filename) {
    return String(filename || '').toLocaleLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  }

  function supported(file) {
    return ACCEPTED_TYPES.has(String(file?.type || '').toLocaleLowerCase())
      || ACCEPTED_EXTENSIONS.has(extension(file?.name));
  }

  function displaySize(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value >= 10240 ? 0 : 1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function defaultAlt(filename) {
    return String(filename || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  }

  function escapeMarkdownText(value) {
    return String(value || '').replace(/[\r\n]+/g, ' ').replace(/([\\\[\]])/g, '\\$1').trim();
  }

  function markdownForImage(image) {
    const alt = escapeMarkdownText(image.alt || defaultAlt(image.originalName || image.fileName));
    const path = String(image.relativePath || `./assets/${image.fileName}`).replace(/[<>\r\n]/g, '');
    const caption = escapeMarkdownText(image.caption);
    return `![${alt}](<${path}>)${caption ? `\n\n_${caption}_` : ''}`;
  }

  function markdownForPart(part, sections) {
    normalizePublishingPart(part);
    const groups = Object.fromEntries(PLACEMENTS.map(([value]) => [value, []]));
    part.images.forEach(image => groups[image.placement]?.push(markdownForImage(image)));
    const blocks = [];
    if (groups['before-body'].length) blocks.push(groups['before-body'].join('\n\n'));
    if (sections.body) blocks.push(sections.body);
    if (groups['after-body'].length) blocks.push(groups['after-body'].join('\n\n'));
    if (sections.afterword) blocks.push(`---\n\n後記\n\n${sections.afterword}`);
    if (groups['after-afterword'].length) blocks.push(groups['after-afterword'].join('\n\n'));
    return blocks.join('\n\n');
  }

  function imageContext(chapter, part, image = null) {
    return {
      projectTitle: state.projectTitle,
      chapterTitle: chapter.title,
      partId: part.id,
      fileName: image?.fileName
    };
  }

  async function imageDimensions(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        const result = { width: bitmap.width, height: bitmap.height };
        bitmap.close?.();
        return result;
      } catch (_) {}
    }
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const result = { width: image.naturalWidth, height: image.naturalHeight };
        URL.revokeObjectURL(url);
        resolve(result);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0 });
      };
      image.src = url;
    });
  }

  async function loadImageElement(element, chapter, part, image, onState) {
    try {
      const file = await StoryFlowIntegrations.getPartImageFile(imageContext(chapter, part, image));
      const url = URL.createObjectURL(file);
      element.onload = () => {
        URL.revokeObjectURL(url);
        onState?.('available');
      };
      element.onerror = () => {
        URL.revokeObjectURL(url);
        onState?.('missing');
      };
      element.src = url;
    } catch (_) {
      onState?.('missing');
    }
  }

  async function persistImages(chapter, part, successMessage, onChange) {
    saveState('文章圖片已更新');
    renderParts();
    onChange?.();
    try {
      const written = await window.StoryFlowPublishing?.persistPart?.(chapter, part);
      if (written) notify(successMessage);
      else notify('圖片資訊目前只保留在畫面；請重新連接資料夾後再操作一次。', true);
      return written;
    } catch (error) {
      notify(`圖片資訊已更新，但文章 Markdown 尚未寫入：${error.message}`, true);
      return false;
    }
  }

  async function importFiles(chapter, part, files, button, onChange) {
    const candidates = Array.from(files || []);
    const unsupported = candidates.filter(file => !supported(file));
    const accepted = candidates.filter(supported);
    if (!accepted.length) {
      notify(unsupported.length ? '沒有可匯入的圖片；支援 JPG、PNG、WebP 與 GIF。' : '沒有選擇圖片。', true);
      return;
    }
    if (!part.id) {
      notify('這篇文章缺少固定 ID，請重新建立文章後再加入圖片。', true);
      return;
    }

    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = '正在匯入…';
    const imported = [];
    const failures = [];
    let largeCount = 0;
    try {
      for (const file of accepted) {
        try {
          const dimensions = await imageDimensions(file);
          const [stored] = await StoryFlowIntegrations.importPartImages({
            ...imageContext(chapter, part), files: [file]
          });
          if (stored.large) largeCount += 1;
          imported.push({
            id: crypto.randomUUID(),
            ...stored,
            ...dimensions,
            alt: defaultAlt(file.name),
            caption: '',
            placement: 'after-body',
            createdAt: new Date().toISOString()
          });
        } catch (error) {
          failures.push(`${file.name}：${error.message}`);
        }
      }
      if (imported.length) {
        normalizePublishingPart(part);
        part.images.push(...imported);
        const notes = [
          `已匯入 ${imported.length} 張圖片`,
          largeCount ? `其中 ${largeCount} 張超過 8 MB` : '',
          unsupported.length ? `${unsupported.length} 個格式不支援` : '',
          failures.length ? `${failures.length} 個匯入失敗` : ''
        ].filter(Boolean).join('；');
        await persistImages(chapter, part, notes, onChange);
      } else {
        notify(`圖片匯入失敗：${failures[0] || '請確認資料夾連線。'}`, true);
      }
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  function moveImage(chapter, part, index, delta, onChange) {
    const target = index + delta;
    if (target < 0 || target >= part.images.length) return;
    [part.images[index], part.images[target]] = [part.images[target], part.images[index]];
    persistImages(chapter, part, '圖片順序已更新', onChange);
  }

  function removeFromState(chapter, part, image, message, onChange) {
    const index = part.images.findIndex(item => item.id === image.id);
    if (index < 0) return;
    part.images.splice(index, 1);
    persistImages(chapter, part, message, onChange);
  }

  function ensureRemoveDialog() {
    let dialog = document.getElementById('articleImageRemoveDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'articleImageRemoveDialog';
    dialog.className = 'article-image-remove-dialog';
    dialog.innerHTML = `
      <div class="dialog-card article-image-remove-card">
        <div class="panel-head">
          <div><p class="eyebrow">IMAGE ASSET</p><h3>移除圖片</h3></div>
          <button class="icon-button" type="button" data-image-remove-cancel aria-label="關閉">×</button>
        </div>
        <p id="articleImageRemoveMessage"></p>
        <div class="article-image-remove-note">只從文章移除會保留私人資料夾中的檔案；刪除檔案則會先備份到 <code>Recovery/Assets</code>。</div>
        <div class="article-image-remove-actions">
          <button class="button ghost" type="button" data-image-remove-cancel>取消</button>
          <button class="button ghost" type="button" id="detachArticleImage">只從文章移除</button>
          <button class="button danger" type="button" id="deleteArticleImageFile">備份後刪除檔案</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll('[data-image-remove-cancel]').forEach(button => {
      button.addEventListener('click', () => dialog.close());
    });
    dialog.querySelector('#detachArticleImage').addEventListener('click', () => {
      if (!removeTarget) return;
      const { chapter, part, image, onChange } = removeTarget;
      dialog.close();
      removeFromState(chapter, part, image, '圖片已從文章移除；原始檔仍保留在私人 assets 資料夾', onChange);
    });
    dialog.querySelector('#deleteArticleImageFile').addEventListener('click', async event => {
      if (!removeTarget) return;
      const button = event.currentTarget;
      const { chapter, part, image, onChange } = removeTarget;
      button.disabled = true;
      try {
        const recoveryPath = await StoryFlowIntegrations.removePartImage(imageContext(chapter, part, image));
        dialog.close();
        removeFromState(chapter, part, image, `圖片檔案已移至安全備份：${recoveryPath}`, onChange);
      } catch (error) {
        notify(`尚未刪除圖片：${error.message}`, true);
      } finally {
        button.disabled = false;
      }
    });
    return dialog;
  }

  function ensureLightbox() {
    let dialog = document.getElementById('articleImageLightbox');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'articleImageLightbox';
    dialog.className = 'article-image-lightbox';
    dialog.setAttribute('aria-label', '圖片預覽');
    dialog.innerHTML = `
      <div class="article-image-lightbox-card">
        <button class="icon-button" type="button" aria-label="關閉圖片">×</button>
        <img alt="" />
        <p hidden></p>
      </div>`;
    document.body.appendChild(dialog);
    const close = () => dialog.close();
    dialog.querySelector('button').addEventListener('click', close);
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('close', () => {
      if (lightboxUrl) URL.revokeObjectURL(lightboxUrl);
      lightboxUrl = '';
      dialog.querySelector('img').removeAttribute('src');
    });
    return dialog;
  }

  async function openLightbox(chapter, part, image) {
    const dialog = ensureLightbox();
    try {
      const file = await StoryFlowIntegrations.getPartImageFile(imageContext(chapter, part, image));
      if (lightboxUrl) URL.revokeObjectURL(lightboxUrl);
      lightboxUrl = URL.createObjectURL(file);
      const element = dialog.querySelector('img');
      element.src = lightboxUrl;
      element.alt = image.alt || image.originalName || '文章圖片';
      const caption = dialog.querySelector('p');
      caption.textContent = image.caption || image.alt || image.originalName || '';
      caption.hidden = !caption.textContent;
      dialog.showModal();
    } catch (error) {
      notify(`無法開啟圖片：${error.message}`, true);
    }
  }

  function openRemoveDialog(chapter, part, image, onChange) {
    const dialog = ensureRemoveDialog();
    removeTarget = { chapter, part, image, onChange };
    dialog.querySelector('#articleImageRemoveMessage').textContent = `要如何處理「${image.originalName || image.fileName}」？`;
    dialog.showModal();
  }

  function createImageRow(chapter, part, image, index, onChange) {
    const row = document.createElement('article');
    row.className = 'article-image-row';

    const preview = document.createElement('div');
    preview.className = 'article-image-thumb';
    const previewImage = document.createElement('img');
    previewImage.alt = image.alt || image.originalName || '文章圖片';
    const previewStatus = document.createElement('span');
    previewStatus.textContent = '載入中…';
    preview.append(previewImage, previewStatus);
    loadImageElement(previewImage, chapter, part, image, status => {
      preview.classList.toggle('missing', status === 'missing');
      previewStatus.textContent = status === 'missing' ? '找不到檔案' : '';
    });

    const details = document.createElement('div');
    details.className = 'article-image-details';
    const title = document.createElement('div');
    title.className = 'article-image-file';
    const filename = document.createElement('strong');
    filename.textContent = image.originalName || image.fileName;
    const facts = document.createElement('span');
    const dimensions = image.width && image.height ? `${image.width} × ${image.height} · ` : '';
    facts.textContent = `${dimensions}${displaySize(image.size)}${image.size > StoryFlowIntegrations.LARGE_IMAGE_BYTES ? ' · 檔案偏大' : ''}`;
    title.append(filename, facts);

    const fields = document.createElement('div');
    fields.className = 'article-image-fields';
    const alt = document.createElement('input');
    alt.type = 'text';
    alt.className = 'text-input';
    alt.maxLength = 300;
    alt.value = image.alt;
    alt.placeholder = '替代文字（閱讀與無障礙）';
    alt.setAttribute('aria-label', `${image.originalName || image.fileName} 的替代文字`);
    const caption = document.createElement('input');
    caption.type = 'text';
    caption.className = 'text-input';
    caption.maxLength = 500;
    caption.value = image.caption;
    caption.placeholder = '圖說（選填）';
    caption.setAttribute('aria-label', `${image.originalName || image.fileName} 的圖說`);
    const placement = document.createElement('select');
    placement.className = 'text-input';
    placement.setAttribute('aria-label', `${image.originalName || image.fileName} 的插入位置`);
    PLACEMENTS.forEach(([value, label]) => placement.add(new Option(label, value)));
    placement.value = image.placement;
    fields.append(alt, caption, placement);

    const actions = document.createElement('div');
    actions.className = 'article-image-actions';
    const up = document.createElement('button');
    up.type = 'button'; up.className = 'button tiny ghost'; up.textContent = '上移';
    up.disabled = index === 0;
    up.dataset.mobileSafeWriteControl = 'true';
    up.addEventListener('click', () => moveImage(chapter, part, index, -1, onChange));
    const down = document.createElement('button');
    down.type = 'button'; down.className = 'button tiny ghost'; down.textContent = '下移';
    down.disabled = index === part.images.length - 1;
    down.dataset.mobileSafeWriteControl = 'true';
    down.addEventListener('click', () => moveImage(chapter, part, index, 1, onChange));
    const copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'button tiny ghost'; copy.textContent = '複製 Markdown';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(markdownForImage(image));
        notify('已複製圖片 Markdown');
      } catch (error) {
        notify(`複製失敗：${error.message}`, true);
      }
    });
    const save = document.createElement('button');
    save.type = 'button'; save.className = 'button tiny primary'; save.textContent = '保存圖片資訊';
    save.dataset.mobileSafeWriteControl = 'true';
    save.addEventListener('click', () => {
      image.alt = alt.value.trim();
      image.caption = caption.value.trim();
      image.placement = placement.value;
      persistImages(chapter, part, '圖片資訊與文章 Markdown 已更新', onChange);
    });
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'button tiny ghost article-image-remove'; remove.textContent = '移除';
    remove.dataset.mobileSafeWriteControl = 'true';
    remove.addEventListener('click', () => openRemoveDialog(chapter, part, image, onChange));
    actions.append(up, down, copy, save, remove);
    details.append(title, fields, actions);
    row.append(preview, details);
    return row;
  }

  function createManager(chapter, part, { onChange } = {}) {
    normalizePublishingPart(part);
    const section = document.createElement('section');
    section.className = 'article-image-manager';
    const head = document.createElement('div');
    head.className = 'article-image-manager-head';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `文章圖片${part.images.length ? ` · ${part.images.length} 張` : ''}`;
    const description = document.createElement('span');
    description.className = 'muted';
    description.textContent = '匯入後會複製到私人 StoryFlow 資料夾，不會上傳到 GitHub Pages。';
    copy.append(title, description);
    const headActions = document.createElement('div');
    headActions.className = 'article-image-manager-actions';
    if (part.images.length) {
      const copyAll = document.createElement('button');
      copyAll.type = 'button';
      copyAll.className = 'button tiny ghost';
      copyAll.textContent = '複製全部 Markdown';
      copyAll.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(part.images.map(markdownForImage).join('\n\n'));
          notify(`已複製 ${part.images.length} 張圖片的 Markdown`);
        } catch (error) {
          notify(`複製失敗：${error.message}`, true);
        }
      });
      headActions.appendChild(copyAll);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'button tiny ghost article-image-add';
    add.textContent = '＋ 匯入圖片';
    add.dataset.mobileSafeWriteControl = 'true';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif';
    input.multiple = true;
    input.hidden = true;
    input.setAttribute('aria-label', '選擇文章圖片');
    add.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      await importFiles(chapter, part, input.files, add, onChange);
      input.value = '';
    });
    headActions.append(add, input);
    head.append(copy, headActions);
    section.appendChild(head);

    if (!part.images.length) {
      const empty = document.createElement('div');
      empty.className = 'article-image-empty';
      empty.textContent = '尚未加入圖片。可從桌面、Google Drive、iCloud 或系統檔案來源選取。';
      section.appendChild(empty);
      return section;
    }

    const list = document.createElement('div');
    list.className = 'article-image-list';
    part.images.forEach((image, index) => list.appendChild(createImageRow(chapter, part, image, index, onChange)));
    section.appendChild(list);
    return section;
  }

  function previewGallery(chapter, part, images, label) {
    if (!images.length) return null;
    const section = document.createElement('section');
    section.className = 'platform-preview-image-group';
    const heading = document.createElement('strong');
    heading.className = 'platform-preview-image-group-label';
    heading.textContent = label;
    const grid = document.createElement('div');
    grid.className = 'platform-preview-image-grid';
    images.forEach(image => {
      const figure = document.createElement('figure');
      figure.className = 'platform-preview-image';
      const element = document.createElement('img');
      element.alt = image.alt || image.originalName || '文章圖片';
      element.tabIndex = 0;
      element.title = '點擊或按 Enter 放大圖片';
      const status = document.createElement('span');
      status.textContent = '載入中…';
      const open = () => {
        if (!figure.classList.contains('missing')) openLightbox(chapter, part, image);
      };
      element.addEventListener('click', open);
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter') open();
      });
      figure.append(element, status);
      if (image.caption) {
        const caption = document.createElement('figcaption');
        caption.textContent = image.caption;
        figure.appendChild(caption);
      }
      loadImageElement(element, chapter, part, image, imageState => {
        figure.classList.toggle('missing', imageState === 'missing');
        status.textContent = imageState === 'missing' ? `找不到圖片：${image.fileName}` : '';
      });
      grid.appendChild(figure);
    });
    section.append(heading, grid);
    return section;
  }

  function previewText(value, className = '') {
    const block = document.createElement('pre');
    block.className = className;
    block.textContent = value;
    return block;
  }

  function renderPreview(container, part, sections, context) {
    normalizePublishingPart(part);
    if (!part.images.length) {
      delete container.dataset.sfPreviewManaged;
      container.textContent = sections.afterword
        ? `${sections.body}\n\n---\n\n後記\n\n${sections.afterword}`
        : sections.body;
      return;
    }
    container.dataset.sfPreviewManaged = 'article-images';
    container.replaceChildren();
    const notice = document.createElement('div');
    notice.className = 'platform-preview-image-notice';
    notice.textContent = `這篇文章有 ${part.images.length} 張私人圖片；「複製內容」不會傳送圖片檔，發布時請依預覽順序逐張上傳。`;
    container.appendChild(notice);
    const chapter = { title: context.chapterTitle };
    const before = part.images.filter(image => image.placement === 'before-body');
    const afterBody = part.images.filter(image => image.placement === 'after-body');
    const afterAfterword = part.images.filter(image => image.placement === 'after-afterword');
    const beforeGallery = previewGallery(chapter, part, before, '正文前圖片');
    if (beforeGallery) container.appendChild(beforeGallery);
    container.appendChild(previewText(sections.body, 'platform-preview-prose'));
    const afterBodyGallery = previewGallery(chapter, part, afterBody, '正文後圖片');
    if (afterBodyGallery) container.appendChild(afterBodyGallery);
    if (sections.afterword) {
      const afterword = document.createElement('section');
      afterword.className = 'platform-preview-afterword';
      const divider = document.createElement('hr');
      const heading = document.createElement('strong');
      heading.textContent = '後記';
      afterword.append(divider, heading, previewText(sections.afterword, 'platform-preview-prose'));
      container.appendChild(afterword);
    }
    const afterwordGallery = previewGallery(chapter, part, afterAfterword, '後記後圖片');
    if (afterwordGallery) container.appendChild(afterwordGallery);
  }

  window.StoryFlowArticleImages = {
    createManager,
    markdownForImage,
    markdownForPart,
    renderPreview
  };

  ensureRemoveDialog();
  ensureLightbox();
  window.renderParts?.();
})();
