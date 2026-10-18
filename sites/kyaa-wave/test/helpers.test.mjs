import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLocale, acquisitionChannel, validateInquiry, createInquirySubmission, gatheringHasEnded, GATHERING_END, decorateOutboundUrl, isTrackedOutboundUrl} from '../helpers.mjs';
test('explicit locale wins, invalid values fall back safely', () => {
 assert.equal(resolveLocale('?lang=en', 'ko'), 'en');
 assert.equal(resolveLocale('?lang=xx', 'en'), 'en');
 assert.equal(resolveLocale('', null), 'ko');
});
const validInquiry = {name:'Kim & Lee', email:'a+b@example.com', interest:'creator', message:'Community question', website:'', consent:true, sessionId:'3baa8f32-ea09-4482-811f-e6ba6fbad4b4', channel:'direct'};
test('inquiries validate bounds and the current interest values', () => {
 assert.equal(validateInquiry(validInquiry, 'en').name, 'Kim & Lee');
 for (const changes of [{name:''},{name:'A\nB'},{name:'a'.repeat(81)},{email:'invalid'},{email:'a@b.com\r\nBcc:x@y.com'},{email:'a'.repeat(255)},{interest:'other'},{message:' '},{message:'a'.repeat(4001)},{website:'a'.repeat(201)},{consent:false},{consent:undefined},{sessionId:'private@example.com'},{channel:'private@example.com'}]) {
  assert.throws(() => validateInquiry({...validInquiry,...changes}, 'ko'));
 }
 assert.equal(validateInquiry({...validInquiry,message:'a'.repeat(4000)}, 'ko').message.length, 4000);
});
test('gathering expiry uses the exact Seoul closing time', () => {
 assert.equal(GATHERING_END, Date.parse('2026-10-22T12:30:00Z'));
 assert.equal(gatheringHasEnded(GATHERING_END - 1), false);
 assert.equal(gatheringHasEnded(GATHERING_END), true);
 assert.equal(gatheringHasEnded(GATHERING_END + 1), true);
});
test('inquiry prevents double submits and only accepts explicit acceptance', async () => {
 let complete, calls = 0;
 const submission = createInquirySubmission(() => { calls++; return new Promise(resolve => { complete=resolve; }); }, () => 'request-1');
 const pending=submission.submit(validInquiry,'ko');
 assert.equal(submission.busy,true);
 assert.equal(await submission.submit(validInquiry,'ko'),'sending');
 assert.equal(calls,1);
 complete({status:202,json:async()=>({status:'accepted'})});
 assert.equal(await pending,'accepted');
 assert.equal(submission.busy,false);
 assert.equal(await submission.submit(validInquiry,'ko'),'accepted');
 assert.equal(calls,1);
});
test('unknown delivery preserves exact payload and request ID for manual retry', async () => {
 const sent=[];
 let ids=0;
 const submission=createInquirySubmission(async payload=>{sent.push({...payload});if(sent.length===1) throw new Error('network');return {status:202,json:async()=>({status:'accepted'})};},()=>`request-${++ids}`);
 assert.equal(await submission.submit(validInquiry,'en'),'unknown');
 assert.equal(sent.length,1);
 assert.equal(await submission.submit({},'ko'),'accepted');
 assert.deepEqual(sent[1],sent[0]);
 assert.equal(ids,1);
});
test('rejected payload can be corrected; unchanged retries retain ID', async () => {
 const sent=[];let ids=0;
 const submission=createInquirySubmission(async payload=>{sent.push(payload);return {status:422,json:async()=>({status:'rejected'})};},()=>`request-${++ids}`);
 assert.equal(await submission.submit(validInquiry,'ko'),'rejected');
 await submission.submit(validInquiry,'ko');
 assert.equal(sent[0].requestId,sent[1].requestId);
 await submission.submit({...validInquiry,message:'Corrected question'},'ko');
 assert.notEqual(sent[1].requestId,sent[2].requestId);
});
test('server errors and malformed acceptance stay unknown without automatic retry', async () => {
 for (const response of [{status:503,json:async()=>({status:'unknown'})},{status:200,json:async()=>({status:'unknown'})},{status:202,json:async()=>{throw new Error('bad JSON');}}]) {
  let calls=0;
  const submission=createInquirySubmission(async()=>{calls++;return response;},()=> 'request-1');
  assert.equal(await submission.submit(validInquiry,'ko'),'unknown');
  assert.equal(calls,1);
 }
});
test('outbound defaults preserve original query bytes, UTM and hash', () => {
 const url=decorateOutboundUrl('https://kyaa.io/connect/kyaa-wave?a=a%20b&utm_source=existing#event');
 assert.ok(url.startsWith('https://kyaa.io/connect/kyaa-wave?a=a%20b&utm_source=existing&'));
 assert.ok(url.endsWith('#event'));
 assert.equal(new URL(url).searchParams.get('utm_campaign'), 'kyaa-wave');
 assert.equal(decorateOutboundUrl('mailto:biz@kyaa.io'), 'mailto:biz@kyaa.io');
});

test('tracking is restricted to public destinations and excludes sensitive links', () => {
 assert.equal(isTrackedOutboundUrl('https://kyaa.io/connect/kyaa-wave?lang=en#event'), true);
 for (const url of ['mailto:biz@kyaa.io','https://kyaa.io/account','https://other.example/','https://kyaa.io/connect/kyaa-wave?token=secret','https://user:secret@kyaa.io/','javascript:alert(1)']) assert.equal(isTrackedOutboundUrl(url), false);
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

test('idempotent HTTP 200 acceptance counts as accepted', async () => {
 const submission=createInquirySubmission(async()=>({status:200,json:async()=>({status:'accepted'})}),()=> 'request-1');
 assert.equal(await submission.submit(validInquiry,'ko'),'accepted');
});

test('Telegram tracking allows only the verified channel and preserves sensitive exclusions', () => {
 assert.equal(isTrackedOutboundUrl('https://t.me/Kyaa_Official'),true);
 const decorated=decorateOutboundUrl('https://t.me/Kyaa_Official?utm_source=partner#updates','content','social');
 assert.equal(new URL(decorated).searchParams.get('utm_source'),'partner');
 assert.equal(new URL(decorated).searchParams.get('utm_content'),'content.social');
 assert.equal(new URL(decorated).hash,'#updates');
 for (const href of ['https://t.me/Other','https://t.me/Kyaa_Official/','https://t.me/Kyaa_Official?token=secret','https://t.me/Kyaa_Official#access_token=secret','https://t.me.evil.example/Kyaa_Official','http://t.me/Kyaa_Official']) assert.equal(isTrackedOutboundUrl(href),false);
 assert.equal(decorateOutboundUrl('https://t.me/Kyaa_Official?token=secret'),'https://t.me/Kyaa_Official?token=secret');
});
test('acquisition classification returns only bounded categories without source content', () => {
 for (const source of ['google','bing','naver','telegram','direct','other']) assert.equal(acquisitionChannel(`?utm_source=${source}`,'https://private.example/a?email=private'),source);
 assert.equal(acquisitionChannel('?utm_source=GOOGLE',''),'google');
 assert.equal(acquisitionChannel('?utm_source=private@example.com',''),'other');
 assert.equal(acquisitionChannel('',''),'direct');
 for (const [referrer,channel] of [['https://www.google.com/search?q=private','google'],['https://www.google.co.kr/search?q=private','google'],['https://www.bing.com/search?q=private','bing'],['https://m.search.naver.com/search.naver?query=private','naver'],['https://t.me/Kyaa_Official','telegram'],['https://web.telegram.org/','telegram'],['https://google.com.evil.example/private','other'],['not a URL','other']]) assert.equal(acquisitionChannel('',referrer),channel);
});
