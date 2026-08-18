// UI bootstrap: prepare compact Smart Split preferences without changing the final section hierarchy.
(function () {
  const panel = document.querySelector('.splitter-panel');
  const head = panel?.querySelector('.panel-head');
  const range = panel?.querySelector('.range-grid');
  const sceneLabel = panel?.querySelector('label[for="sceneMarker"]');
  const sceneInput = document.getElementById('sceneMarker');

  if (panel && head && range && sceneLabel && sceneInput && !document.getElementById('smartSplitMiniSettings')) {
    const mini = document.createElement('div');
    mini.id = 'smartSplitMiniSettings';
    mini.className = 'smart-split-mini-settings';
    head.insertAdjacentElement('afterend', mini);
    mini.appendChild(range);

    const scene = document.createElement('label');
    scene.className = 'scene-marker-compact';
    const caption = document.createElement('span');
    caption.textContent = '場景分隔符';
    scene.append(caption, sceneInput);
    mini.appendChild(scene);
    sceneLabel.remove();
  }

  // app.js keeps this as a top-level lexical binding. Expose a read/write bridge for
  // late-loaded source-mode behavior without duplicating Google document state.
  try {
    if (!Object.prototype.hasOwnProperty.call(window, 'pendingGoogleDoc')) {
      Object.defineProperty(window, 'pendingGoogleDoc', {
        configurable: true,
        get: () => pendingGoogleDoc,
        set: value => { pendingGoogleDoc = value; }
      });
    }
  } catch (_) {}

  // Source-mode v2 intentionally loads after the legacy source/project layers.
  // Load CSS first, then source-mode behavior, then the final article/dialog UX layer.
  window.addEventListener('load', () => {
    if (!document.getElementById('storyflowProjectPersistenceGuardJs')) {
      const persistence = document.createElement('script');
      persistence.id = 'storyflowProjectPersistenceGuardJs';
      persistence.src = './project-persistence-guard.js?v=20260818-1500';
      persistence.async = false;
      document.body.appendChild(persistence);
    }

    const loadArticleUx = () => {
      if (!document.getElementById('storyflowSourceArticleUxV2Css')) {
        const link = document.createElement('link');
        link.id = 'storyflowSourceArticleUxV2Css';
        link.rel = 'stylesheet';
        link.href = './source-article-ux-v2.css?v=20260818-1504';
        document.head.appendChild(link);
      }
      if (!document.getElementById('storyflowSourceArticleUxV2Js')) {
        const script = document.createElement('script');
        script.id = 'storyflowSourceArticleUxV2Js';
        script.src = './source-article-ux-v2.js?v=20260818-1504';
        script.async = false;
        document.body.appendChild(script);
      }
    };

    const loadBehavior = () => {
      const existing = document.getElementById('storyflowProjectSourceModeV2Js');
      if (existing) {
        if (window.StoryFlowProjectSourceModeV2) loadArticleUx();
        else {
          existing.addEventListener('load', loadArticleUx, { once: true });
          window.setTimeout(loadArticleUx, 250);
        }
        return;
      }
      const script = document.createElement('script');
      script.id = 'storyflowProjectSourceModeV2Js';
      script.src = './project-source-mode-v2.js?v=20260818-1438';
      script.async = false;
      script.addEventListener('load', loadArticleUx, { once: true });
      document.body.appendChild(script);
      window.setTimeout(loadArticleUx, 350);
    };

    let link = document.getElementById('storyflowProjectSourceModeV2Css');
    if (!link) {
      link = document.createElement('link');
      link.id = 'storyflowProjectSourceModeV2Css';
      link.rel = 'stylesheet';
      link.href = './project-source-mode-v2.css?v=20260818-1438';
      link.addEventListener('load', loadBehavior, { once: true });
      document.head.appendChild(link);
      // If a browser restores the stylesheet from cache without a load callback,
      // do not strand the behavior layer.
      window.setTimeout(loadBehavior, 250);
    } else {
      loadBehavior();
    }
  }, { once: true });
})();