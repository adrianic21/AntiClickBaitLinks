const APP_URL = 'https://anticlickbaitlinks.com/';

function buildSummaryUrl(pageUrl) {
  return `${APP_URL}?shared=${encodeURIComponent(pageUrl)}`;
}

function buildTextSummaryUrl(selectedText) {
  return `${APP_URL}?sharedText=${encodeURIComponent(selectedText)}`;
}

function isSupportedPage(url) {
  return /^https?:\/\//i.test(url || '');
}
