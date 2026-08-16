// Desktop-only sidebar collapse control. State is session-only and is not persisted in browser storage.
(function () {
  const shell = document.querySelector('.app-shell');
  const sidebar = document.querySelector('.sidebar');
  const brand = sidebar?.querySelector('.brand');
  if (!shell || !sidebar || !brand || document.getElementById('sidebarToggle')) return;

  const button = document.createElement('button');
  button.id = 'sidebarToggle';
  button.className = 'sidebar-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', '收合左側選單');
  button.setAttribute('aria-expanded', 'true');
  button.title = '收合左側選單';
  button.textContent = '‹';

  function sync() {
    const collapsed = shell.classList.contains('sidebar-collapsed');
    button.textContent = collapsed ? '›' : '‹';
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', collapsed ? '展開左側選單' : '收合左側選單');
    button.title = collapsed ? '展開左側選單' : '收合左側選單';
  }

  button.addEventListener('click', () => {
    shell.classList.toggle('sidebar-collapsed');
    sync();
  });

  sidebar.appendChild(button);
  sync();
})();
