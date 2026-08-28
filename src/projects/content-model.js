// Shared content-model primitives for longform and future visual works.
// Phase 0 deliberately exposes no UI; this module only defines compatible data,
// storage and publishing boundaries for later feature modules.
(function () {
  const CONTENT_MODES = Object.freeze({ LONGFORM: 'longform', VISUAL: 'visual' });
  const VISUAL_STATUSES = new Set(['draft', 'ready']);
  const IMAGE_PLACEMENTS = new Set(['cover', 'body']);

  function clone(value) {
    return structuredClone(value);
  }

  function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function normalizeContentMode(value) {
    return value === CONTENT_MODES.VISUAL ? CONTENT_MODES.VISUAL : CONTENT_MODES.LONGFORM;
  }

  function normalizeStringRecord(value, { keepEmpty = false } = {}) {
    return Object.fromEntries(Object.entries(record(value))
      .map(([key, item]) => [String(key).trim(), typeof item === 'string' ? item.trim() : ''])
      .filter(([key, item]) => key && (keepEmpty || item)));
  }

  function tagsFromHashtags(value) {
    const source = typeof value === 'string' ? value : '';
    const tags = source.match(/#[^\s#]+/gu) || [];
    const unique = new Map();
    tags.forEach(raw => {
      const tag = raw.replace(/^#+/, '').trim();
      if (!tag) return;
      const key = tag.toLocaleLowerCase('zh-Hant');
      if (!unique.has(key)) unique.set(key, tag);
    });
    return [...unique.values()];
  }

  function normalizeBooleanRecord(value) {
    return Object.fromEntries(Object.entries(record(value))
      .map(([key, item]) => [String(key).trim(), item === true])
      .filter(([key]) => key));
  }

  function normalizePublicationRecords(value) {
    return Object.fromEntries(Object.entries(record(value))
      .map(([platform, item]) => [String(platform).trim(), {
        publishedAt: typeof item?.publishedAt === 'string' ? item.publishedAt : '',
        url: typeof item?.url === 'string' ? item.url : ''
      }])
      .filter(([platform]) => platform));
  }

  function pathSegment(value, fallback = 'untitled') {
    const cleaned = String(value || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
    return cleaned || fallback;
  }

  function normalizeVisualImage(candidate, index = 0) {
    const image = record(candidate);
    const storedName = pathSegment(image.storedName || image.fileName || `image-${index + 1}`, `image-${index + 1}`);
    return {
      id: typeof image.id === 'string' && image.id ? image.id : crypto.randomUUID(),
      storedName,
      relativePath: typeof image.relativePath === 'string' && image.relativePath
        ? image.relativePath : `./assets/${storedName}`,
      mimeType: typeof image.mimeType === 'string' ? image.mimeType : '',
      bytes: Number.isFinite(Number(image.bytes ?? image.size)) ? Number(image.bytes ?? image.size) : 0,
      width: Number.isFinite(Number(image.width)) ? Number(image.width) : 0,
      height: Number.isFinite(Number(image.height)) ? Number(image.height) : 0,
      alt: typeof image.alt === 'string' ? image.alt : '',
      caption: typeof image.caption === 'string' ? image.caption : '',
      placement: IMAGE_PLACEMENTS.has(image.placement) ? image.placement : 'body',
      order: Number.isFinite(Number(image.order)) ? Number(image.order) : index,
      createdAt: typeof image.createdAt === 'string' ? image.createdAt : ''
    };
  }

  function normalizeVisualEntry(candidate, index = 0) {
    const entry = record(candidate);
    const images = Array.isArray(entry.images)
      ? entry.images.filter(item => item && typeof item === 'object').map(normalizeVisualImage)
        .sort((left, right) => left.order - right.order)
        .map((image, order) => ({ ...image, order }))
      : [];
    const coverImageId = typeof entry.coverImageId === 'string'
      && images.some(image => image.id === entry.coverImageId)
      ? entry.coverImageId : '';
    return {
      id: typeof entry.id === 'string' && entry.id ? entry.id : crypto.randomUUID(),
      title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : `未命名圖文 ${index + 1}`,
      summary: typeof entry.summary === 'string' ? entry.summary.trim() : '',
      hashtags: typeof entry.hashtags === 'string' ? entry.hashtags.trim() : '',
      tags: tagsFromHashtags(entry.hashtags),
      body: typeof entry.body === 'string' ? entry.body : '',
      status: VISUAL_STATUSES.has(entry.status) ? entry.status : 'draft',
      coverImageId,
      images,
      platformTitles: normalizeStringRecord(entry.platformTitles),
      platformStatus: normalizeBooleanRecord(entry.platformStatus),
      publicationRecords: normalizePublicationRecords(entry.publicationRecords),
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : ''
    };
  }

  function normalizeProject(candidate) {
    const project = clone(record(candidate));
    project.contentMode = normalizeContentMode(project.contentMode);
    project.chapters = Array.isArray(project.chapters) ? project.chapters : [];
    project.visualEntries = Array.isArray(project.visualEntries)
      ? project.visualEntries.filter(item => item && typeof item === 'object').map(normalizeVisualEntry)
      : [];
    return project;
  }

  function isProjectState(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    if (candidate.contentMode === CONTENT_MODES.VISUAL) return Array.isArray(candidate.visualEntries);
    return Array.isArray(candidate.chapters);
  }

  function normalizeWorkspace(candidate) {
    const workspace = clone(record(candidate));
    if (workspace.schemaVersion >= 2 && Array.isArray(workspace.projects)) {
      workspace.projects = workspace.projects.map(project => ({
        ...project,
        state: normalizeProject(project?.state)
      }));
    } else if (workspace.state) {
      workspace.state = normalizeProject(workspace.state);
    }
    return workspace;
  }

  function visualEntryStorage({ projectTitle, entryId }) {
    const segments = ['Works', pathSegment(projectTitle), 'Visual', pathSegment(entryId, 'entry')];
    const directoryPath = segments.join('/');
    return {
      segments,
      directoryPath,
      contentPath: `${directoryPath}/content.md`,
      metadataPath: `${directoryPath}/metadata.json`,
      assetsPath: `${directoryPath}/assets`
    };
  }

  function visualImageStorage({ projectTitle, entryId, fileName }) {
    const entry = visualEntryStorage({ projectTitle, entryId });
    const storedName = pathSegment(fileName, 'image');
    return {
      ...entry,
      storedName,
      relativePath: `./assets/${storedName}`,
      filePath: `${entry.assetsPath}/${storedName}`
    };
  }

  function publishingFields(source) {
    const item = record(source);
    return {
      platformTitles: normalizeStringRecord(item.platformTitles),
      platformStatus: normalizeBooleanRecord(item.platformStatus),
      publicationRecords: normalizePublicationRecords(item.publicationRecords)
    };
  }

  function publishableFromLongform({ projectId = '', projectTitle = '', chapter, part }) {
    const sourceChapter = record(chapter);
    const sourcePart = record(part);
    return {
      key: `longform:${projectId || projectTitle}:${sourcePart.id || sourcePart.title || 'part'}`,
      contentMode: CONTENT_MODES.LONGFORM,
      projectId,
      projectTitle,
      containerId: sourceChapter.id || '',
      containerTitle: sourceChapter.title || '',
      id: sourcePart.id || '',
      title: sourcePart.publishTitle || sourcePart.title || '未命名文章',
      body: sourcePart.raw ?? sourcePart.formatted ?? '',
      afterword: typeof sourcePart.afterword === 'string' ? sourcePart.afterword : '',
      includeAfterword: sourcePart.includeAfterword !== false,
      images: clone(Array.isArray(sourcePart.images) ? sourcePart.images : []),
      status: sourcePart.published ? 'published' : 'ready',
      ...publishingFields(sourcePart),
      source: { kind: CONTENT_MODES.LONGFORM, chapterId: sourceChapter.id || '', partId: sourcePart.id || '' }
    };
  }

  function publishableFromVisual({ projectId = '', projectTitle = '', entry }) {
    const sourceEntry = normalizeVisualEntry(entry);
    return {
      key: `visual:${projectId || projectTitle}:${sourceEntry.id}`,
      contentMode: CONTENT_MODES.VISUAL,
      projectId,
      projectTitle,
      containerId: '',
      containerTitle: '',
      id: sourceEntry.id,
      title: sourceEntry.title,
      summary: sourceEntry.summary,
      hashtags: sourceEntry.hashtags,
      tags: clone(sourceEntry.tags),
      body: sourceEntry.body,
      afterword: '',
      includeAfterword: false,
      coverImageId: sourceEntry.coverImageId,
      images: clone(sourceEntry.images),
      status: sourceEntry.status,
      ...publishingFields(sourceEntry),
      source: { kind: CONTENT_MODES.VISUAL, entryId: sourceEntry.id }
    };
  }

  window.StoryFlowContentModel = Object.freeze({
    CONTENT_MODES,
    normalizeContentMode,
    normalizeVisualImage,
    normalizeVisualEntry,
    tagsFromHashtags,
    normalizeProject,
    isProjectState,
    normalizeWorkspace,
    visualEntryStorage,
    visualImageStorage,
    publishableFromLongform,
    publishableFromVisual
  });
})();
