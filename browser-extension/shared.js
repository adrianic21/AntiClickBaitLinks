const APP_URL = 'https://anticlickbaitlinks.com/';

function buildSummaryUrl(pageUrl) {
  return `${APP_URL}?shared=${encodeURIComponent(pageUrl)}`;
}

function isSupportedPage(url) {
  return /^https?:\/\//i.test(url || '');
}
