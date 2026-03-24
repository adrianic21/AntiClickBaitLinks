const statusEl = document.getElementById('status');
const currentUrlEl = document.getElementById('current-url');
const openButton = document.getElementById('open-app');
const copyButton = document.getElementById('copy-link');

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const activeTab = tabs[0];
  const pageUrl = activeTab?.url || '';

  if (!isSupportedPage(pageUrl)) {
    statusEl.textContent = 'Esta pagina no se puede resumir desde la extension.';
    currentUrlEl.textContent = pageUrl || 'URL no disponible';
    return;
  }

  statusEl.textContent = 'La URL actual esta lista para abrirse en AntiClickBaitLinks.';
  currentUrlEl.textContent = pageUrl;
  openButton.disabled = false;
  copyButton.disabled = false;

  openButton.addEventListener('click', () => {
    chrome.tabs.create({ url: buildSummaryUrl(pageUrl) });
  });

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      statusEl.textContent = 'Enlace copiado al portapapeles.';
    } catch {
      statusEl.textContent = 'No se pudo copiar el enlace.';
    }
  });
});
