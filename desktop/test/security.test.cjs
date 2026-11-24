'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRODUCTION_APP_URL,
  resolveAppUrl,
  resolveWorkspaceUrl,
  isTrustedAppUrl,
  isSafeExternalUrl,
} = require('../security.cjs');

const APP_ORIGIN = new URL(PRODUCTION_APP_URL).origin;

test('production builds always target the canonical BeBoss HTTPS origin', () => {
  assert.equal(resolveAppUrl({}, true), PRODUCTION_APP_URL);
  assert.equal(resolveAppUrl({ BEBOSS_DESKTOP_DEV_URL: 'http://localhost:5173' }, true), PRODUCTION_APP_URL);
});

test('development override is limited to local loopback HTTP', () => {
  assert.equal(resolveAppUrl({ BEBOSS_DESKTOP_DEV_URL: 'http://localhost:5173/' }, false), 'http://localhost:5173/');
  assert.throws(() => resolveAppUrl({ BEBOSS_DESKTOP_DEV_URL: 'http://example.com' }, false));
  assert.throws(() => resolveAppUrl({ BEBOSS_DESKTOP_DEV_URL: 'https://evil.example' }, false));
  assert.equal(isTrustedAppUrl('http://localhost:5173/dashboard', 'http://localhost:5173'), true);
});

test('trusted navigation allows same-origin routes and rejects origin lookalikes', () => {
  assert.equal(isTrustedAppUrl('https://beboss1.vercel.app/admin', APP_ORIGIN), true);
  assert.equal(isTrustedAppUrl('https://beboss1.vercel.app.evil.example/admin', APP_ORIGIN), false);
  assert.equal(isTrustedAppUrl('http://beboss1.vercel.app/admin', APP_ORIGIN), false);
  assert.equal(isTrustedAppUrl('https://beboss1.vercel.app@evil.example/admin', APP_ORIGIN), false);
  assert.equal(isTrustedAppUrl('javascript:alert(1)', APP_ORIGIN), false);
  assert.equal(isTrustedAppUrl('file:///etc/passwd', APP_ORIGIN), false);
});

test('only credential-free HTTPS external links can be opened by the operating system', () => {
  assert.equal(isSafeExternalUrl('https://supabase.com/docs'), true);
  assert.equal(isSafeExternalUrl('https://github.com/obamamunyehirwe/beboss1'), true);
  assert.equal(isSafeExternalUrl('http://example.com'), false);
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('file:///tmp/report'), false);
  assert.equal(isSafeExternalUrl('https://user:pass@example.com'), false);
});

test('workspace quick links are constrained to trusted same-origin paths', () => {
  assert.equal(resolveWorkspaceUrl('/admin/payments', APP_ORIGIN), 'https://beboss1.vercel.app/admin/payments');
  assert.equal(resolveWorkspaceUrl('/admin/analytics?range=12m', APP_ORIGIN), 'https://beboss1.vercel.app/admin/analytics?range=12m');
  assert.throws(() => resolveWorkspaceUrl('//evil.example/path', APP_ORIGIN));
  assert.throws(() => resolveWorkspaceUrl('https://evil.example/path', APP_ORIGIN));
  assert.throws(() => resolveWorkspaceUrl('/\\\\evil.example', APP_ORIGIN));
});
