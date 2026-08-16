export function applyMdbStylesheet(isRtl) {
  if (typeof document === 'undefined') return;

  let link = document.getElementById('mdb-theme-css');
  if (!link) {
    link = document.createElement('link');
    link.id = 'mdb-theme-css';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }

  const file = isRtl ? 'mdb.rtl.min.css' : 'mdb.min.css';
  if (!link.getAttribute('href')?.endsWith(file)) {
    link.href = `/css/${file}`;
  }
}
