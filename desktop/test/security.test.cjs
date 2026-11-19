'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isGameUrl, isExternalUrl } = require('../security.cjs');

test('only HTTPS canonical ProPeloton domain can navigate inside desktop app', () => {
  assert.equal(isGameUrl('https://propelotonmanager.com/#/dashboard'), true);
  assert.equal(isGameUrl('https://www.propelotonmanager.com/#/register'), true);
  assert.equal(isGameUrl('https://propelotonmanager.com/#/login'), true);
  assert.equal(isGameUrl('http://propelotonmanager.com/'), false);
  assert.equal(isGameUrl('https://propelotonmanager.com.evil.example/'), false);
  assert.equal(isGameUrl('https://propelotonmanager.com:444/'), false);
  assert.equal(isGameUrl('https://user:pass@propelotonmanager.com/'), false);
  assert.equal(isGameUrl('file:///etc/passwd'), false);
  assert.equal(isGameUrl('javascript:alert(1)'), false);
});

test('external targets permit only HTTPS and mailto without embedded credentials', () => {
  assert.equal(isExternalUrl('https://checkout.stripe.com/payment'), true);
  assert.equal(isExternalUrl('https://discord.gg/BpgqTXsjAW'), true);
  assert.equal(isExternalUrl('mailto:support@example.com'), true);
  assert.equal(isExternalUrl('http://example.com/'), false);
  assert.equal(isExternalUrl('file:///tmp/test'), false);
  assert.equal(isExternalUrl('javascript:alert(1)'), false);
  assert.equal(isExternalUrl('https://user:pass@example.com/'), false);
});
