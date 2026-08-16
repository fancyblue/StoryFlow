// UI defaults: platforms are user-managed; Smart Split keeps controls compact and content large.
(function () {
  platforms.splice(0, platforms.length);
  state.formatting.platforms = {};

  const panel = document.querySelector('.splitter-panel');
  const range = panel?.querySelector('.range-grid');
  const sceneLabel = panel?.querySelector('label[for="sceneMarker"]');
  const sceneInput = document.getElementById('sceneMarker');
  if (panel && range && sceneLabel && sceneInput && !document.getElementById('smartSplitMiniSettings')) {
    const mini = document.createElement('div');
    mini.id = 'smartSplitMiniSettings';
    mini.className = 'smart-split-mini-settings';
    range.insertAdjacentElement('beforebegin', mini);
    mini.appendChild(range);
    const scene = document.createElement('label');
    scene.className = 'scene-marker-compact';
    const caption = document.createElement('span');
    caption.textContent = '場景分隔';
    scene.append(caption, sceneInput);
    mini.appendChild(scene);
    sceneLabel.remove();
  }
})();