'use strict';

const GAME_HOSTS = new Set(['propelotonmanager.com', 'www.propelotonmanager.com']);

function isGameUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && GAME_HOSTS.has(url.hostname) &&
      (url.port === '' || url.port === '443') && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function isExternalUrl(raw) {
  try {
    const url = new URL(raw);
    return (url.protocol === 'https:' || url.protocol === 'mailto:') &&
      url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

module.exports = { isGameUrl, isExternalUrl };
