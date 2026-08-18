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
  // It owns the final creation-mode UI and whole-project refresh behavior without
  // making the older scripts race each other during initial page parsing.
  window.addEventListener('load', () => {
    if (!document.getElementById('storyflowProjectSourceModeV2Css')) {
      const link = document.createElement('link');
      link.id = 'storyflowProjectSourceModeV2Css';
      link.rel = 'stylesheet';
      link.href = './project-source-mode-v2.css?v=20260818-1418';
      document.head.appendChild(link);
    }
    if (!document.getElementById('storyflowProjectSourceModeV2Js')) {
      const script = document.createElement('script');
      script.id = 'storyflowProjectSourceModeV2Js';
      script.src = './project-source-mode-v2.js?v=20260818-1418';
      script.async = false;
      document.body.appendChild(script);
    }
  }, { once: true });
})();
