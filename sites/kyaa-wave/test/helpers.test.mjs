import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLocale, inquiryUrl, decorateOutboundUrl, isTrackedOutboundUrl} from '../helpers.mjs';
test('explicit locale wins, invalid values fall back safely', () => {
 assert.equal(resolveLocale('?lang=en', 'ko'), 'en');
 assert.equal(resolveLocale('?lang=xx', 'en'), 'en');
 assert.equal(resolveLocale('', null), 'ko');
});
test('inquiry validates input and safely encodes a draft', () => {
 assert.throws(() => inquiryUrl({name:'',email:'x',interest:'creator'}, 'ko'));
 assert.throws(() => inquiryUrl({name:'A',email:'a@b.com\r\nBcc:x@y.com',interest:'creator'}, 'en'));
 assert.throws(() => inquiryUrl({name:'A',email:'a@b.com',interest:'other'}, 'en'));
 const url=inquiryUrl({name:'Kim & Lee',email:'a+b@example.com',interest:'creator'}, 'en');
 assert.ok(url.startsWith('mailto:biz@sallylab.io?'));
 assert.equal(new URLSearchParams(url.split('?')[1]).get('subject'), '[kyaa wave] Creator community');
 assert.throws(() => inquiryUrl({name:'A',email:'a@b.com',interest:'salon'}, 'en'));
 assert.match(new URLSearchParams(url.split('?')[1]).get('body'), /Kim & Lee/);
});
test('outbound defaults preserve original query bytes, UTM and hash', () => {
 const url=decorateOutboundUrl('https://kyaa.io/connect/kyaa-wave?a=a%20b&utm_source=existing#event');
 assert.ok(url.startsWith('https://kyaa.io/connect/kyaa-wave?a=a%20b&utm_source=existing&'));
 assert.ok(url.endsWith('#event'));
 assert.equal(new URL(url).searchParams.get('utm_campaign'), 'kyaa-wave');
 assert.equal(decorateOutboundUrl('mailto:biz@sallylab.io'), 'mailto:biz@sallylab.io');
});

test('tracking is restricted to public destinations and excludes sensitive links', () => {
 assert.equal(isTrackedOutboundUrl('https://kyaa.io/connect/kyaa-wave?lang=en#event'), true);
 for (const url of ['mailto:biz@sallylab.io','https://kyaa.io/account','https://other.example/','https://kyaa.io/connect/kyaa-wave?token=secret','https://user:secret@kyaa.io/','javascript:alert(1)']) assert.equal(isTrackedOutboundUrl(url), false);
});

test('current shared UTM defaults preserve existing keys case-insensitively', () => {
 assert.equal(new URL(decorateOutboundUrl('https://kyaa.io/')).searchParams.get('utm_source'), 'kyaa');
 const href='https://kyaa.io/?a=a%20b&a=a+b&utm_source=partner&UTM_MEDIUM=email#seat%20A';
 assert.equal(decorateOutboundUrl(href), 'https://kyaa.io/?a=a%20b&a=a+b&utm_source=partner&UTM_MEDIUM=email&utm_campaign=kyaa-wave&utm_content=content.website#seat%20A');
});
test('sensitive queries and fragments are neither decorated nor tracked', () => {
 for (const href of ['https://kyaa.io/connect/kyaa-wave?client_secret=private', 'https://kyaa.io/connect/kyaa-wave#access_token=private&state=abc', 'https://kyaa.io/#/return?access_token=private', 'https://kyaa.io/#/oauth/callback', 'https://kyaa.io/?X-Amz-Signature=private', 'https://kyaa.io/?redirect_uri=https://example.com']) {
  assert.equal(decorateOutboundUrl(href), href);
  assert.equal(isTrackedOutboundUrl(href), false);
 }
});
