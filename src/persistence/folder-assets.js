// Image assets and visual-entry files in the connected StoryFlow folder.
//
// Longform article images (Works/<work>/<chapter>/assets/<part>/) and each visual entry's
// exported text (Works/<work>/Visual/<entry-id>/). Removing an image or an entry's files
// copies them into Recovery first; nothing here deletes a Recovery copy. Visual photos are
// not here: they stay in Google Drive (src/projects/visual-photo-cache.js).
//
// It reaches the folder only through window.StoryFlowFolderIO, which integrations.js exposes
// for persistence modules, and adds its functions to StoryFlowIntegrations. It loads right
// after integrations.js, before any module wraps or captures an integration method.
(function () {
  const { safeName } = window.StoryFlowShared;
  const io = window.StoryFlowFolderIO;

  function imageExtension(filename) {
    const match = String(filename || '').toLocaleLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] || '';
  }

  function imageFileSupported(file) {
    return io.IMAGE_MIME_TYPES.has(String(file?.type || '').toLocaleLowerCase())
      || io.IMAGE_EXTENSIONS.has(imageExtension(file?.name));
  }

  function imageFilename(filename, fallback = 'image') {
    const source = String(filename || '').trim();
    const extension = imageExtension(source);
    const suffix = extension ? `.${extension}` : '';
    const base = extension ? source.slice(0, -(extension.length + 1)) : source;
    return `${safeName(base, fallback)}${suffix}`;
  }

  async function uniqueFilename(directory, filename) {
    const normalized = imageFilename(filename);
    const extension = imageExtension(normalized);
    const suffix = extension ? `.${extension}` : '';
    const base = extension ? normalized.slice(0, -(extension.length + 1)) : normalized;
    for (let index = 0; index < 10000; index += 1) {
      const candidate = index ? `${base}-${index + 1}${suffix}` : normalized;
      try {
        await directory.getFileHandle(candidate, { create: false });
      } catch (error) {
        if (error?.name === 'NotFoundError') return candidate;
        throw error;
      }
    }
    throw new Error('圖片檔名重複過多，請先重新命名。');
  }

  async function partAssetsDirectory({ projectTitle, chapterTitle, partId }, create = false) {
    const works = create
      ? await io.getDirectory(io.folder(), 'Works')
      : await io.existingDirectory(io.folder(), 'Works');
    const work = create
      ? await io.getDirectory(works, projectTitle)
      : await io.existingDirectory(works, projectTitle);
    const chapter = create
      ? await io.getDirectory(work, chapterTitle)
      : await io.existingDirectory(work, chapterTitle);
    const assets = create
      ? await io.getDirectory(chapter, 'assets')
      : await io.existingDirectory(chapter, 'assets');
    return create
      ? io.getDirectory(assets, partId)
      : io.existingDirectory(assets, partId);
  }

  async function visualEntryDirectory({ projectTitle, entryId }, create = false) {
    if (!entryId) throw new Error('這則圖文缺少固定 ID，無法建立私人檔案路徑。');
    const works = create
      ? await io.getDirectory(io.folder(), 'Works')
      : await io.existingDirectory(io.folder(), 'Works');
    const work = create
      ? await io.getDirectory(works, projectTitle)
      : await io.existingDirectory(works, projectTitle);
    const visual = create
      ? await io.getDirectory(work, 'Visual')
      : await io.existingDirectory(work, 'Visual');
    return create
      ? io.getDirectory(visual, entryId)
      : io.existingDirectory(visual, entryId);
  }

  async function visualAssetsDirectory({ projectTitle, entryId }, create = false) {
    const entry = await visualEntryDirectory({ projectTitle, entryId }, create);
    return create ? io.getDirectory(entry, 'assets') : io.existingDirectory(entry, 'assets');
  }

  async function importVisualImages({ projectTitle, entryId, files }) {
    if (!(await io.ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    const candidates = Array.from(files || []);
    if (!candidates.length) return [];
    const directory = await visualAssetsDirectory({ projectTitle, entryId }, true);
    const imported = [];
    for (const file of candidates) {
      if (!imageFileSupported(file)) throw new Error(`「${file?.name || '未命名檔案'}」不是支援的圖片格式。`);
      const storedName = await uniqueFilename(directory, file.name || 'image');
      await io.writeBinaryFile(directory, storedName, file);
      imported.push({
        id: crypto.randomUUID(),
        storedName,
        relativePath: `./assets/${storedName}`,
        mimeType: file.type || '',
        bytes: Number(file.size || 0),
        width: 0,
        height: 0,
        alt: '',
        caption: '',
        placement: 'body',
        createdAt: new Date().toISOString(),
        large: Number(file.size || 0) > io.LARGE_IMAGE_BYTES
      });
    }
    return imported;
  }

  async function getVisualImageFile({ projectTitle, entryId, storedName }) {
    await io.hydrate();
    if (!io.folder()) throw new Error('StoryFlow 尚未連接資料夾。');
    const directory = await visualAssetsDirectory({ projectTitle, entryId }, false);
    const fileHandle = await directory.getFileHandle(safeName(storedName), { create: false });
    return fileHandle.getFile();
  }

  async function removeVisualImage({ projectTitle, entryId, storedName }) {
    if (!(await io.ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    const directory = await visualAssetsDirectory({ projectTitle, entryId }, false);
    const fileHandle = await directory.getFileHandle(safeName(storedName), { create: false });
    const file = await fileHandle.getFile();
    const recovery = await io.getDirectory(await io.getDirectory(io.folder(), io.RECOVERY_DIRECTORY), 'Assets');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recoveryName = `${stamp}-${safeName(entryId)}-${imageFilename(storedName)}`;
    await io.writeBinaryFile(recovery, recoveryName, file);
    await directory.removeEntry(safeName(storedName));
    return `${io.folder().name}/${io.RECOVERY_DIRECTORY}/Assets/${recoveryName}`;
  }

  // Deleting a work, an entry or an article takes its images with it. Keeping them was a
  // deliberate guard against a text operation wiping an original, but it meant the folder
  // grew with every deletion and nothing pointed at the files any more. The copy into
  // Recovery/Assets is what makes removal safe, and it happens without asking: choosing
  // between "keep the file" and "delete the file" asked the user to decide how StoryFlow
  // files its own copies, which is not their decision to make.
  //
  // Only the images StoryFlow recorded are touched. Walking the directory would also
  // sweep up anything the user put in that folder themselves. Every backup is written
  // before anything is removed, so a failure part-way leaves the files in place.
  async function archiveRecordedAssets(directory, images, label) {
    const names = (images || [])
      .map(image => image?.storedName || image?.fileName)
      .filter(Boolean);
    if (!directory || !names.length) return [];

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recovery = await io.getDirectory(await io.getDirectory(io.folder(), io.RECOVERY_DIRECTORY), 'Assets');
    const archived = [];
    const present = [];
    for (const name of names) {
      let file;
      try {
        file = await (await directory.getFileHandle(safeName(name))).getFile();
      } catch (error) {
        if (error?.name === 'NotFoundError') continue;
        throw error;
      }
      const recoveryName = `${stamp}-${safeName(label)}-${imageFilename(name)}`;
      await io.writeBinaryFile(recovery, recoveryName, file);
      archived.push(recoveryName);
      present.push(name);
    }
    for (const name of present) {
      try { await directory.removeEntry(safeName(name)); }
      catch (error) { if (error?.name !== 'NotFoundError') throw error; }
    }
    return archived;
  }

  async function removeVisualEntryAssets({ projectTitle, entryId, images }) {
    let directory;
    try {
      directory = await visualAssetsDirectory({ projectTitle, entryId }, false);
    } catch (error) {
      if (error?.name === 'NotFoundError') return [];
      throw error;
    }
    return archiveRecordedAssets(directory, images, entryId);
  }

  async function removePartAssets({ projectTitle, chapterTitle, partId, images }) {
    let directory;
    try {
      directory = await partAssetsDirectory({ projectTitle, chapterTitle, partId }, false);
    } catch (error) {
      if (error?.name === 'NotFoundError') return [];
      throw error;
    }
    return archiveRecordedAssets(directory, images, partId);
  }

  // One image per article: the export reads in the order the article does — title, quote,
  // the photo, its caption, the body, the afterword. The photo is a link to the writer's
  // Google Drive file, never a copy (REDESIGN_PROPOSAL C5).
  function visualEntryMarkdown(entry, photo) {
    const parts = [`# ${entry.title}`];
    const quote = String(entry.quote || '').trim();
    if (quote) parts.push(quote.split('\n').map(line => `> ${line}`).join('\n'));
    if (photo?.driveFileId) {
      const alt = String(photo.alt || photo.name || '').replace(/[[\]]/g, '');
      parts.push(`![${alt}](https://drive.google.com/file/d/${encodeURIComponent(photo.driveFileId)}/view)`);
    }
    const caption = String(entry.caption || '').trim();
    if (caption) parts.push(`*${caption.replace(/\*/g, '\\*')}*`);
    if (String(entry.body || '').trim()) parts.push(String(entry.body).trimEnd());
    const afterword = String(entry.afterword || '').trim();
    if (afterword) parts.push(`---\n\n後記\n\n${afterword}`);
    return parts.join('\n\n').trimEnd() + '\n';
  }

  async function saveVisualEntry({ projectTitle, entry, photo = null }) {
    if (!(await io.ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    const normalized = window.StoryFlowContentModel.normalizeVisualEntry(entry);
    const directory = await visualEntryDirectory({ projectTitle, entryId: normalized.id }, true);
    const resolvedPhoto = photo || (normalized.photoId ? window.StoryFlowVisualPhotos?.byId?.(normalized.photoId) : null);
    const content = visualEntryMarkdown(normalized, resolvedPhoto);
    const metadata = {
      schemaVersion: 2,
      id: normalized.id,
      title: normalized.title,
      quote: normalized.quote,
      caption: normalized.caption,
      photo: resolvedPhoto ? {
        id: resolvedPhoto.id, driveFileId: resolvedPhoto.driveFileId, name: resolvedPhoto.name,
        mimeType: resolvedPhoto.mimeType, alt: resolvedPhoto.alt || ''
      } : null,
      summary: normalized.summary,
      hashtags: normalized.hashtags,
      tags: normalized.tags,
      afterword: normalized.afterword,
      includeAfterword: normalized.includeAfterword,
      coverImageId: normalized.coverImageId,
      images: normalized.images,
      platformTitles: normalized.platformTitles,
      platformHashtags: normalized.platformHashtags,
      platformIncludeAfterword: normalized.platformIncludeAfterword,
      platformStatus: normalized.platformStatus,
      publicationRecords: normalized.publicationRecords,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt
    };
    await io.writeTextFile(directory, 'content.md', content);
    await io.writeTextFile(directory, 'metadata.json', JSON.stringify(metadata, null, 2));
    return `${io.folder().name}/Works/${safeName(projectTitle)}/Visual/${safeName(normalized.id)}`;
  }

  async function removeVisualEntryFiles({ projectTitle, entryId, entry }) {
    if (!(await io.ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    let directory;
    try {
      directory = await visualEntryDirectory({ projectTitle, entryId }, false);
    } catch (error) {
      if (error?.name === 'NotFoundError') return null;
      throw error;
    }
    const content = await io.readTextFile(directory, 'content.md');
    const metadata = await io.readTextFile(directory, 'metadata.json');
    const filename = io.recoveryFilename(`visual-entry-${safeName(entryId)}`);
    const artifactPath = await io.writeRecoveryArtifact(filename, JSON.stringify({
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      reason: 'before-visual-entry-delete',
      projectTitle,
      entry: entry || null,
      content,
      metadata
    }, null, 2));
    await removeVisualEntryAssets({ projectTitle, entryId, images: entry?.images });
    for (const filename of ['content.md', 'metadata.json']) {
      try { await directory.removeEntry(filename); }
      catch (error) { if (error?.name !== 'NotFoundError') throw error; }
    }
    return artifactPath;
  }

  async function importPartImages({ projectTitle, chapterTitle, partId, files }) {
    if (!(await io.ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    if (!partId) throw new Error('這篇文章缺少固定 ID，無法建立圖片資料夾。');
    const candidates = Array.from(files || []);
    if (!candidates.length) return [];
    const directory = await partAssetsDirectory({ projectTitle, chapterTitle, partId }, true);
    const imported = [];
    for (const file of candidates) {
      if (!imageFileSupported(file)) throw new Error(`「${file?.name || '未命名檔案'}」不是支援的圖片格式。`);
      const fileName = await uniqueFilename(directory, file.name || 'image');
      await io.writeBinaryFile(directory, fileName, file);
      imported.push({
        fileName,
        originalName: file.name || fileName,
        relativePath: `./assets/${safeName(partId)}/${fileName}`,
        mimeType: file.type || '',
        size: Number(file.size || 0),
        large: Number(file.size || 0) > io.LARGE_IMAGE_BYTES
      });
    }
    return imported;
  }

  async function getPartImageFile({ projectTitle, chapterTitle, partId, fileName }) {
    await io.hydrate();
    if (!io.folder()) throw new Error('StoryFlow 尚未連接資料夾。');
    const directory = await partAssetsDirectory({ projectTitle, chapterTitle, partId }, false);
    const fileHandle = await directory.getFileHandle(safeName(fileName), { create: false });
    return fileHandle.getFile();
  }

  async function removePartImage({ projectTitle, chapterTitle, partId, fileName }) {
    if (!(await io.ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    const directory = await partAssetsDirectory({ projectTitle, chapterTitle, partId }, false);
    const fileHandle = await directory.getFileHandle(safeName(fileName), { create: false });
    const file = await fileHandle.getFile();
    const recovery = await io.getDirectory(await io.getDirectory(io.folder(), io.RECOVERY_DIRECTORY), 'Assets');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recoveryName = `${stamp}-${safeName(partId)}-${imageFilename(fileName)}`;
    await io.writeBinaryFile(recovery, recoveryName, file);
    await directory.removeEntry(safeName(fileName));
    return `${io.folder().name}/${io.RECOVERY_DIRECTORY}/Assets/${recoveryName}`;
  }


  Object.assign(window.StoryFlowIntegrations, {
    removeVisualEntryAssets, removePartAssets, importPartImages, getPartImageFile, removePartImage,
    saveVisualEntry, importVisualImages, getVisualImageFile, removeVisualImage, removeVisualEntryFiles
  });
})();
