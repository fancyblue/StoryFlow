// Visual photo cache: Drive → this tab's memory (docs/ARCHITECTURE.md, visual works).
//
// Photos stay in the writer's Google Drive. This module reads an image through
// StoryFlowIntegrations.fetchDrivePhoto into an object URL, keeps it for the open work only,
// and releases every URL when the work or the session changes. Nothing here writes an image
// into the StoryFlow folder or browser storage (`npm run test:static` refuses it).
//
// Shared by the visual workspace, its folder browser and Publishing through
// window.StoryFlowVisualPhotos.
(function () {
  // Session memory only: Drive file id → object URL, or the error that reading it gave.
  const photoUrls = new Map();
  const photoErrors = new Map();
  const photoLoads = new Map();
  let photoUrlsProject = null;

  const { esc } = window.StoryFlowShared;

  // Every photo reference across the works, for Publishing and the folder export, which
  // may describe an entry of a work that is not the open one.
  function byId(id) {
    if (!id) return null;
    const own = (state?.photos || []).find(photo => photo.id === id);
    if (own) return own;
    for (const project of window.StoryFlowProjects?.searchSnapshot?.() || []) {
      const found = (project.state?.photos || []).find(photo => photo.id === id);
      if (found) return found;
    }
    return null;
  }

  // Library tiles keep small copies: a whole trip can be hundreds of photos, and holding each
  // at full size in memory to draw a 90-pixel tile would not survive it. Full-size images are
  // read only for the article's own photo, the preview and the lightbox.
  const THUMB_WIDTH = 320;
  const thumbUrls = new Map();
  const thumbLoads = new Map();
  let tileObserver = null;

  // At most three Drive reads at a time, so opening a large library does not start hundreds.
  const DRIVE_READS = 3;
  let activeReads = 0;
  const readQueue = [];
  function queuedRead(fileId) {
    return new Promise((resolve, reject) => {
      readQueue.push({ fileId, resolve, reject });
      pumpReads();
    });
  }
  function pumpReads() {
    while (activeReads < DRIVE_READS && readQueue.length) {
      const { fileId, resolve, reject } = readQueue.shift();
      activeReads += 1;
      Promise.resolve()
        .then(() => StoryFlowIntegrations.fetchDrivePhoto(fileId))
        .then(resolve, reject)
        .finally(() => { activeReads -= 1; pumpReads(); });
    }
  }

  function releasePhotoUrls() {
    photoUrls.forEach(url => URL.revokeObjectURL(url));
    thumbUrls.forEach(url => URL.revokeObjectURL(url));
    photoUrls.clear();
    thumbUrls.clear();
    photoErrors.clear();
    photoLoads.clear();
    thumbLoads.clear();
    readQueue.length = 0;
  }

  function ensurePhotoCacheForProject() {
    const projectId = window.StoryFlowProjects?.activeId?.() || '';
    if (photoUrlsProject !== projectId) {
      releasePhotoUrls();
      photoUrlsProject = projectId;
    }
  }

  function loadPhoto(photo) {
    if (!photo?.driveFileId) return Promise.resolve(null);
    if (photoUrls.has(photo.driveFileId)) return Promise.resolve(photoUrls.get(photo.driveFileId));
    if (photoLoads.has(photo.driveFileId)) return photoLoads.get(photo.driveFileId);
    const load = queuedRead(photo.driveFileId)
      .then(blob => {
        const url = URL.createObjectURL(blob);
        photoUrls.set(photo.driveFileId, url);
        photoErrors.delete(photo.driveFileId);
        return url;
      })
      .catch(error => {
        photoErrors.set(photo.driveFileId, error);
        return null;
      })
      .finally(() => photoLoads.delete(photo.driveFileId));
    photoLoads.set(photo.driveFileId, load);
    return load;
  }

  async function shrink(blob) {
    try {
      const bitmap = await createImageBitmap(blob, { resizeWidth: THUMB_WIDTH, resizeQuality: 'medium' });
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close?.();
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    } catch (_) {
      return blob;
    }
  }

  function loadThumb(photo) {
    if (!photo?.driveFileId) return Promise.resolve(null);
    if (thumbUrls.has(photo.driveFileId)) return Promise.resolve(thumbUrls.get(photo.driveFileId));
    if (photoUrls.has(photo.driveFileId)) return Promise.resolve(photoUrls.get(photo.driveFileId));
    if (thumbLoads.has(photo.driveFileId)) return thumbLoads.get(photo.driveFileId);
    const load = queuedRead(photo.driveFileId)
      .then(shrink)
      .then(blob => {
        const url = URL.createObjectURL(blob);
        thumbUrls.set(photo.driveFileId, url);
        photoErrors.delete(photo.driveFileId);
        return url;
      })
      .catch(error => {
        photoErrors.set(photo.driveFileId, error);
        return null;
      })
      .finally(() => thumbLoads.delete(photo.driveFileId));
    thumbLoads.set(photo.driveFileId, load);
    return load;
  }

  function photoProblem(photo) {
    if (!photo) return '找不到這張照片';
    const error = photoErrors.get(photo.driveFileId);
    if (!error) return '';
    if (error.code === 'GOOGLE_SIGNED_OUT') return '登入 Google 後顯示照片';
    return error.status === 404 || error.status === 403 ? 'Google Drive 上找不到這張照片' : '照片暫時讀不到';
  }

  // Fill every [data-photo-slot] inside root once its photo is in memory. A slot shows the
  // file name until then, and the reason when it cannot be read. A thumbnail slot
  // (data-photo-size="thumb") is read only once it scrolls near the view.
  function fillPhotoSlots(root) {
    root?.querySelectorAll('[data-photo-slot]').forEach(slot => {
      if (slot.dataset.photoSize === 'thumb' && 'IntersectionObserver' in window) {
        tileObserver ||= new IntersectionObserver(entries => entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          tileObserver.unobserve(entry.target);
          fillSlot(entry.target);
        }), { rootMargin: '240px' });
        const photo = byId(slot.dataset.photoSlot);
        const ready = photo && (thumbUrls.get(photo.driveFileId) || photoUrls.get(photo.driveFileId));
        if (ready || photoErrors.has(photo?.driveFileId)) return fillSlot(slot);
        tileObserver.observe(slot);
        return;
      }
      fillSlot(slot);
    });
  }

  function fillSlot(slot) {
    const photo = byId(slot.dataset.photoSlot);
    // Publishing renders into a panel before attaching it, so a detached slot is filled
    // too; a slot that has since been given another photo is left alone.
    const wanted = slot.dataset.photoSlot;
    const show = url => {
      if (slot.dataset.photoSlot !== wanted) return;
      if (url) {
        slot.innerHTML = `<img src="${url}" alt="${esc(photo?.alt || '')}" draggable="false" />`;
        slot.classList.remove('is-missing');
      } else {
        slot.innerHTML = `<span>${esc(photoProblem(photo) || photo?.name || '照片')}</span>`;
        slot.classList.toggle('is-missing', Boolean(photoProblem(photo)));
      }
    };
    if (!photo) return show(null);
    const thumb = slot.dataset.photoSize === 'thumb';
    const cached = photoUrls.get(photo.driveFileId) || (thumb ? thumbUrls.get(photo.driveFileId) : null);
    if (cached) return show(cached);
    if (photoErrors.has(photo.driveFileId)) return show(null);
    slot.innerHTML = `<span>${esc(photo.name)}</span>`;
    (thumb ? loadThumb(photo) : loadPhoto(photo)).then(show);
  }

  // Signing in to Google makes photos that could not be read readable.
  function clearSignedOutErrors() {
    photoErrors.forEach((error, fileId) => { if (error?.code === 'GOOGLE_SIGNED_OUT') photoErrors.delete(fileId); });
  }

  window.addEventListener('storyflow:session-cleared', releasePhotoUrls);

  window.StoryFlowVisualPhotos = {
    byId,
    load: photo => loadPhoto(photo),
    loadThumb: photo => loadThumb(photo),
    problem: photo => photoProblem(photo),
    fill: root => fillPhotoSlots(root),
    ensureForProject: ensurePhotoCacheForProject,
    clearSignedOutErrors
  };
})();
