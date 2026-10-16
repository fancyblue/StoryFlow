// 閱讀設定: size, leading and measure of rendered prose, and how much room the surfaces
// around it take. Prose is the one thing in StoryFlow that is read rather than scanned, and
// how much of it fits on a screen depends on the screen; so the choice belongs to this browser,
// not to a work, and is kept in localStorage like the sidebar collapse. Storage can be
// unavailable (private windows, blocked site data); then the choice lasts for the session.
//
// Everything is applied as custom properties on <html>, read by the one rule that sets prose
// typography (.sf-preview-rendered-root in preview-mode.css) and by the rules that own the
// spacing around it. Nothing here outranks a stylesheet.
(function () {
  const STORAGE_KEY = 'storyflow.ui.readingSettings';
  const DEFAULTS = Object.freeze({ size: 16, leading: 1.8, chars: 36, density: 'comfortable' });
  const SIZE = { min: 14, max: 20, step: 1 };
  const CHARS = { min: 28, max: 44, step: 2 };
  const LEADINGS = [
    { value: 1.6, label: '緊湊' },
    { value: 1.8, label: '標準' },
    { value: 2, label: '寬鬆' }
  ];
  const DENSITIES = [
    { value: 'comfortable', label: '舒適' },
    { value: 'compact', label: '緊湊' }
  ];

  let settings = read();
  let panel = null;
  let openedFrom = null;
  // Every place the controls are drawn: the floating panel in the reading view and the 閱讀設定
  // group inside the workbench's 設定 panel. All of them show the one current choice.
  const hosts = new Set();

  function clampStep(value, { min, max, step }, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    const stepped = Math.round((number - min) / step) * step + min;
    return Math.min(max, Math.max(min, stepped));
  }

  function normalize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      size: clampStep(source.size, SIZE, DEFAULTS.size),
      leading: LEADINGS.some(item => item.value === Number(source.leading)) ? Number(source.leading) : DEFAULTS.leading,
      chars: clampStep(source.chars, CHARS, DEFAULTS.chars),
      density: DENSITIES.some(item => item.value === source.density) ? source.density : DEFAULTS.density
    };
  }

  function read() {
    try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch (_) { return { ...DEFAULTS }; }
  }

  function remember() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) {}
  }

  function apply() {
    const root = document.documentElement;
    root.style.setProperty('--sf-reading-size', `${settings.size}px`);
    root.style.setProperty('--sf-reading-leading', String(settings.leading));
    root.style.setProperty('--sf-reading-chars', String(settings.chars));
    if (settings.density === 'compact') root.dataset.sfReadingDensity = 'compact';
    else delete root.dataset.sfReadingDensity;
  }

  function update(change) {
    settings = normalize({ ...settings, ...change });
    apply();
    remember();
    syncPanel();
  }

  const isDefault = () => Object.keys(DEFAULTS).every(key => settings[key] === DEFAULTS[key]);

  function stepper(key, unit, range, [less, more]) {
    return `
      <div class="sf-reading-settings-stepper" data-setting="${key}">
        <button type="button" class="button tiny ghost" data-step="-1" aria-label="${less}">−</button>
        <output aria-live="polite" data-unit="${unit}" data-min="${range.min}" data-max="${range.max}"></output>
        <button type="button" class="button tiny ghost" data-step="1" aria-label="${more}">＋</button>
      </div>`;
  }

  function segment(key, items, label) {
    return `
      <span class="sf-preview-mode-segment" role="group" aria-label="${label}" data-setting="${key}">
        ${items.map(item => `<button type="button" data-value="${item.value}">${item.label}</button>`).join('')}
      </span>`;
  }

  function fillControls(host) {
    host.innerHTML = `
      <div class="sf-reading-settings-row"><span>字級</span>${stepper('size', 'px', SIZE, ['縮小字級', '放大字級'])}</div>
      <div class="sf-reading-settings-row"><span>行高</span>${segment('leading', LEADINGS, '行高')}</div>
      <div class="sf-reading-settings-row"><span>每行字數</span>${stepper('chars', '字', CHARS, ['減少每行字數', '增加每行字數'])}</div>
      <div class="sf-reading-settings-row"><span>介面密度</span>${segment('density', DENSITIES, '介面密度')}</div>
      <div class="sf-reading-settings-foot"><button type="button" class="button tiny ghost" data-reset>還原預設</button></div>`;
    host.addEventListener('click', event => {
      const stepButton = event.target.closest('[data-step]');
      if (stepButton) {
        const key = stepButton.closest('[data-setting]').dataset.setting;
        const range = key === 'size' ? SIZE : CHARS;
        update({ [key]: settings[key] + Number(stepButton.dataset.step) * range.step });
        return;
      }
      const choice = event.target.closest('[data-value]');
      if (choice) {
        const key = choice.closest('[data-setting]').dataset.setting;
        update({ [key]: key === 'leading' ? Number(choice.dataset.value) : choice.dataset.value });
        return;
      }
      if (event.target.closest('[data-reset]')) update({ ...DEFAULTS });
    });
    hosts.add(host);
  }

  // Draws the controls into a container another surface owns, which opens and closes it.
  function mount(container) {
    if (!container || hosts.has(container)) return;
    fillControls(container);
    syncPanel();
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'readingSettingsPanel';
    panel.className = 'sf-reading-settings';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '閱讀設定');
    panel.hidden = true;
    fillControls(panel);
    document.body.appendChild(panel);
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close({ restoreFocus: true });
    });
    return panel;
  }

  function syncPanel() {
    hosts.forEach(syncHost);
  }

  function syncHost(host) {
    host.querySelectorAll('.sf-reading-settings-stepper').forEach(group => {
      const key = group.dataset.setting;
      const output = group.querySelector('output');
      const value = settings[key];
      output.textContent = `${value} ${output.dataset.unit}`;
      group.querySelector('[data-step="-1"]').disabled = value <= Number(output.dataset.min);
      group.querySelector('[data-step="1"]').disabled = value >= Number(output.dataset.max);
    });
    host.querySelectorAll('.sf-preview-mode-segment').forEach(group => {
      const current = String(settings[group.dataset.setting]);
      group.querySelectorAll('[data-value]').forEach(button => {
        const active = button.dataset.value === current;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    });
    host.querySelector('[data-reset]').disabled = isDefault();
  }

  function place(toggle) {
    const rect = toggle.getBoundingClientRect();
    const width = panel.offsetWidth;
    const left = Math.min(Math.max(8, rect.right - width), innerWidth - width - 8);
    const below = rect.bottom + 6;
    const top = below + panel.offsetHeight > innerHeight - 8 ? Math.max(8, rect.top - panel.offsetHeight - 6) : below;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  function open(toggle) {
    ensurePanel();
    syncPanel();
    openedFrom = toggle;
    panel.hidden = false;
    place(toggle);
    document.querySelectorAll('.sf-reading-settings-toggle').forEach(button => {
      button.setAttribute('aria-expanded', String(button === toggle));
    });
    panel.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  function close({ restoreFocus = false } = {}) {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.querySelectorAll('.sf-reading-settings-toggle').forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (restoreFocus) openedFrom?.focus({ preventScroll: true });
    openedFrom = null;
  }

  // The reading view's toggle sits immediately before 回到工作台, the control that leaves the
  // surface. In the workbench the same controls live in the 設定 panel beside 讀稿檢視
  // (src/projects/workspace-project-ux.js), which mounts them; it has no toggle of its own.
  function ensureToggle(container, before) {
    if (!container || container.querySelector(':scope > .sf-reading-settings-toggle')) return;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'icon-button sf-reading-settings-toggle sf-quiet';
    toggle.setAttribute('aria-label', '閱讀設定');
    toggle.setAttribute('aria-haspopup', 'dialog');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'readingSettingsPanel');
    toggle.title = '閱讀設定';
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 7h10M8 7v11M14 11h7M17.5 11v7"></path></svg>';
    toggle.addEventListener('click', () => {
      if (panel && !panel.hidden && openedFrom === toggle) close({ restoreFocus: true });
      else open(toggle);
    });
    container.insertBefore(toggle, before && before.parentElement === container ? before : null);
  }

  function installToggles() {
    ensureToggle(document.querySelector('#readingView .reading-view-head'), document.getElementById('closeReadingViewBtn'));
  }

  document.addEventListener('click', event => {
    if (!panel || panel.hidden) return;
    if (event.target.closest('#readingSettingsPanel, .sf-reading-settings-toggle')) return;
    close();
  });
  // A panel positioned against its toggle would drift away from it on resize or scroll.
  window.addEventListener('resize', () => close());
  document.addEventListener('scroll', () => close(), { capture: true, passive: true });
  window.addEventListener('storyflow:view-changed', () => close());

  apply();
  installToggles();
  StoryFlowRender.after('renderAll', 'reading-settings', () => queueMicrotask(installToggles));
  StoryFlowRender.after('renderSuggestion', 'reading-settings', () => queueMicrotask(installToggles));

  window.StoryFlowReadingSettings = Object.freeze({
    get: () => ({ ...settings }),
    defaults: () => ({ ...DEFAULTS }),
    mount,
    close
  });
})();
