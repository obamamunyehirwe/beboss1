'use strict';

const PRODUCTION_APP_URL = 'https://beboss1.vercel.app';

function parseUrl(value) {
  try { return new URL(String(value)); } catch { return null; }
}

function isLoopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function resolveAppUrl(env = process.env, packaged = true) {
  const devUrl = String(env.BEBOSS_DESKTOP_DEV_URL || '').trim();
  if (!packaged && devUrl) {
    const parsed = parseUrl(devUrl);
    if (parsed && parsed.protocol === 'http:' && isLoopback(parsed.hostname) &&
        !parsed.username && !parsed.password) return parsed.toString();
    throw new Error('BEBOSS_DESKTOP_DEV_URL must be an http:// localhost URL.');
  }
  return PRODUCTION_APP_URL;
}

function isTrustedAppUrl(candidate, appOrigin = new URL(PRODUCTION_APP_URL).origin) {
  const parsed = parseUrl(candidate);
  if (!parsed || parsed.username || parsed.password || parsed.origin !== appOrigin) return false;
  if (parsed.protocol === 'https:') return true;
  return parsed.protocol === 'http:' && isLoopback(parsed.hostname);
}

function isSafeExternalUrl(candidate) {
  const parsed = parseUrl(candidate);
  return Boolean(parsed && parsed.protocol === 'https:' && !parsed.username &&
    !parsed.password && parsed.hostname.length > 0);
}

module.exports = { PRODUCTION_APP_URL, resolveAppUrl, isTrustedAppUrl, isSafeExternalUrl };
