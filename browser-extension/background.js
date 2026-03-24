importScripts('shared.js');

const MENU_SUMMARIZE_LINK = 'anticlickbait-summarize-link';
const MENU_SUMMARIZE_PAGE = 'anticlickbait-summarize-page';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_SUMMARIZE_LINK,
    title: 'Resumir enlace con AntiClickBaitLinks',
    contexts: ['link'],
  });

  chrome.contextMenus.create({
    id: MENU_SUMMARIZE_PAGE,
    title: 'Resumir esta pagina con AntiClickBaitLinks',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  let targetUrl = '';

  if (info.menuItemId === MENU_SUMMARIZE_LINK) {
    targetUrl = info.linkUrl || '';
  }

  if (info.menuItemId === MENU_SUMMARIZE_PAGE) {
    targetUrl = tab?.url || '';
  }

  if (!isSupportedPage(targetUrl)) {
    return;
  }

  chrome.tabs.create({ url: buildSummaryUrl(targetUrl) });
});
