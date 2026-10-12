(() => {
  const toggle = document.querySelector('[data-sidebar-toggle]');
  const close = document.querySelector('[data-sidebar-close]');
  const sidebar = document.getElementById('admin-sidebar');
  if (!toggle || !close || !sidebar) return;
  function setOpen(open) {
    sidebar.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.querySelector('.admin-workspace').inert = open;
    if (open) close.focus(); else toggle.focus();
  }
  toggle.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (!sidebar.classList.contains('is-open')) return;
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'Tab') {
      const items = [...sidebar.querySelectorAll('a[href], button')];
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault(); items.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault(); items[0].focus();
      }
    }
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', (event) => {
    if (event.matches) {
      sidebar.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.querySelector('.admin-workspace').inert = false;
    }
  });
})();
