// Publishing platform settings v2: one platform = one editable settings row.
// Removes the duplicate add-input + platform chips UI and keeps add/rename/delete
// directly beside each platform's formatting controls.
(function () {
  let focusPlatformName = '';

  function defaultConfig() {
    return {
      indent: 'inherit',
      paragraphSpacing: state.formatting.defaultParagraphSpacing,
      sceneSeparator: state.formatting.defaultSceneSeparator
    };
  }

  function ensureConfig(name) {
    state.formatting ||= structuredClone(defaultState.formatting);
    state.formatting.platforms ||= {};
    state.formatting.platforms[name] ||= defaultConfig();
    return state.formatting.platforms[name];
  }

  function uniqueNewPlatformName() {
    if (!platforms.includes('新平台')) return '新平台';
    let number = 2;
    while (platforms.includes(`新平台 ${number}`)) number += 1;
    return `新平台 ${number}`;
  }

  function syncPlatformSelect(select) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '';
    select.add(new Option('預設格式', ''));
    platforms.forEach(name => select.add(new Option(name, name)));
    select.value = platforms.includes(current) ? current : '';
  }

  function refreshDependentUI() {
    syncPlatformSelect(document.getElementById('suggestionPlatformSelect'));
    syncPlatformSelect(document.getElementById('reviewPlatformSelect'));
    if (typeof renderParts === 'function') renderParts();
    if (typeof renderSuggestion === 'function') renderSuggestion();
  }

  function renamePlatform(oldName, input) {
    const nextName = String(input.value || '').trim();
    if (!nextName) {
      input.value = oldName;
      notify('平台名稱不能留白', true);
      return;
    }
    if (nextName === oldName) return;
    if (platforms.includes(nextName)) {
      input.value = oldName;
      notify(`「${nextName}」已存在`, true);
      input.focus();
      input.select();
      return;
    }

    const index = platforms.indexOf(oldName);
    if (index < 0) return;
    platforms[index] = nextName;
    const config = ensureConfig(oldName);
    state.formatting.platforms[nextName] = config;
    delete state.formatting.platforms[oldName];

    for (const chapter of state.chapters || []) {
      for (const part of chapter.parts || []) {
        if (!part.platformStatus || !(oldName in part.platformStatus)) continue;
        if (!(nextName in part.platformStatus)) part.platformStatus[nextName] = part.platformStatus[oldName];
        delete part.platformStatus[oldName];
      }
    }

    saveState('平台名稱已更新');
    refreshDependentUI();
    renderFormattingSettings();
  }

  function removePlatform(name) {
    if (!confirm(`移除「${name}」平台？\n\n會移除這個平台的排版與發布狀態，但不會刪除已產出的 Markdown。`)) return;
    const index = platforms.indexOf(name);
    if (index >= 0) platforms.splice(index, 1);
    delete state.formatting.platforms?.[name];
    for (const chapter of state.chapters || []) {
      for (const part of chapter.parts || []) {
        if (part.platformStatus) delete part.platformStatus[name];
      }
    }
    saveState('平台已移除');
    refreshDependentUI();
    renderFormattingSettings();
  }

  function addPlatform() {
    const name = uniqueNewPlatformName();
    platforms.push(name);
    ensureConfig(name);
    focusPlatformName = name;
    saveState('平台已新增');
    refreshDependentUI();
    renderFormattingSettings();
  }

  function checkbox(labelText, checked, onChange) {
    const label = document.createElement('label');
    label.className = 'format-check platform-inline-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(checked);
    input.onchange = () => onChange(input.checked);
    const text = document.createElement('span');
    text.textContent = labelText;
    label.append(input, text);
    return label;
  }

  function installToolbar() {
    const manager = document.getElementById('platformManager');
    const list = document.getElementById('platformFormatSettings');
    if (!manager || !list) return;

    manager.className = 'platform-manager platform-manager-v2';
    manager.innerHTML = `
      <div class="platform-editor-toolbar">
        <div>
          <strong>發布平台</strong>
          <p>每個平台直接在同一列設定名稱與排版。</p>
        </div>
        <button id="addPlatformBtnV2" class="button tiny ghost platform-add-button-v2" type="button">＋ 新增平台</button>
      </div>`;
    document.getElementById('addPlatformBtnV2').onclick = addPlatform;
  }

  window.renderFormattingSettings = function renderFormattingSettingsIntegrated() {
    const list = document.getElementById('platformFormatSettings');
    if (!list) return;
    installToolbar();

    els.defaultIndent.value = state.formatting.defaultIndent;
    els.defaultParagraphSpacing.checked = state.formatting.defaultParagraphSpacing;
    els.defaultSceneSeparator.checked = state.formatting.defaultSceneSeparator;
    list.innerHTML = '';
    list.classList.add('platform-settings-v2');

    if (!platforms.length) {
      const empty = document.createElement('div');
      empty.className = 'platform-settings-empty';
      empty.innerHTML = '<strong>尚未設定發布平台</strong><span>按右上的「＋ 新增平台」建立第一個平台。</span>';
      list.appendChild(empty);
      return;
    }

    platforms.forEach(name => {
      const config = ensureConfig(name);
      const row = document.createElement('div');
      row.className = 'platform-setting-row platform-setting-row-v2';
      row.dataset.platform = name;

      const nameInput = document.createElement('input');
      nameInput.className = 'text-input platform-name-input';
      nameInput.value = name;
      nameInput.setAttribute('aria-label', `${name} 平台名稱`);
      nameInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          nameInput.blur();
        } else if (event.key === 'Escape') {
          nameInput.value = name;
          nameInput.blur();
        }
      });
      nameInput.addEventListener('change', () => renamePlatform(name, nameInput));

      const indent = document.createElement('select');
      indent.className = 'text-input platform-indent-select';
      indent.setAttribute('aria-label', `${name} 段首設定`);
      indent.innerHTML = '<option value="inherit">段首跟隨預設</option><option value="none">段首不縮排</option><option value="two">段首全形兩格</option>';
      indent.value = config.indent || 'inherit';
      indent.onchange = () => {
        config.indent = indent.value;
        saveState('排版設定已更新');
        refreshDependentUI();
      };

      const spacing = checkbox('段落間空一行', config.paragraphSpacing, checked => {
        config.paragraphSpacing = checked;
        saveState('排版設定已更新');
        refreshDependentUI();
      });
      const scene = checkbox('顯示場景分隔符', config.sceneSeparator, checked => {
        config.sceneSeparator = checked;
        saveState('排版設定已更新');
        refreshDependentUI();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button tiny ghost platform-row-delete';
      remove.textContent = '刪除';
      remove.setAttribute('aria-label', `刪除 ${name} 平台`);
      remove.onclick = () => removePlatform(name);

      row.append(nameInput, indent, spacing, scene, remove);
      list.appendChild(row);
    });

    if (focusPlatformName) {
      const targetName = focusPlatformName;
      focusPlatformName = '';
      requestAnimationFrame(() => {
        const input = [...list.querySelectorAll('.platform-name-input')]
          .find(item => item.value === targetName);
        input?.focus();
        input?.select();
      });
    }
  };

  // settings-sync.js has already created the old manager by this point. Replace it
  // immediately and render the integrated rows; future refreshes call this override.
  installToolbar();
  renderFormattingSettings();
})();
