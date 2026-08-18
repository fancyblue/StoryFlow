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

  // Source-mode v2 intentionally loads after the legacy source/project layers.
  // Load the CSS first so the new creation-mode controls never flash unstyled.
  window.addEventListener('load', () => {
    const loadBehavior = () => {
      if (document.getElementById('storyflowProjectSourceModeV2Js')) return;
      const script = document.createElement('script');
      script.id = 'storyflowProjectSourceModeV2Js';
      script.src = './project-source-mode-v2.js?v=20260818-1425';
      script.async = false;
      document.body.appendChild(script);
    };

    let link = document.getElementById('storyflowProjectSourceModeV2Css');
    if (!link) {
      link = document.createElement('link');
      link.id = 'storyflowProjectSourceModeV2Css';
      link.rel = 'stylesheet';
      link.href = './project-source-mode-v2.css?v=20260818-1425';
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
