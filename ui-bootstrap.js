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
})();
