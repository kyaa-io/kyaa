import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepare, artifactDigest, validateRun, verifyFiles } from './aws-wave-release.mjs';
const template = JSON.parse(await readFile(new URL('../infrastructure/aws/wave/site.json', import.meta.url)));
const handler = vm.runInNewContext(template.Resources.Routes.Properties.FunctionCode + '; handler');
const request = (uri, querystring = {}, host = 'kyaawave.com') => ({ uri, querystring, headers: { host: { value: host } } });
test('Wave URLs preserve locale, canonical host and repeated encoded query values', () => {
  assert.equal(handler({ request: request('/') }).uri, '/index.html');
  assert.equal(handler({ request: request('/en/') }).uri, '/en/index.html');
  assert.equal(handler({ request: request('/missing') }).uri, '/missing');
  const r = handler({ request: request('/', { lang: { value: 'en' }, q: { multiValue: [{ value: 'a%2Fb' }, { value: 'c+d' }] } }, 'www.kyaawave.com') });
  assert.equal(r.statusCode, 308);
  assert.equal(r.headers.location.value, 'https://kyaawave.com/en/?lang=en&q=a%2Fb&q=c+d');
  assert.equal(handler({ request: request('/en/', { lang: { value: 'ko' } }) }).headers.location.value, 'https://kyaawave.com/?lang=ko');
  assert.equal(handler({ request: request('/en') }).headers.location.value, 'https://kyaawave.com/en/');
});
test('private retained origin, uncached POST proxy, existing CSP and no API error rewriting', () => {
  const r = template.Resources;
  assert.equal(r.Bucket.DeletionPolicy, 'Retain');
  assert.equal(r.OAC.Properties.OriginAccessControlConfig.SigningBehavior, 'always');
  const d = r.Distribution.Properties.DistributionConfig;
  assert.equal(d.Origins[0].OriginPath, '/current');
  assert.equal(d.Origins[1].DomainName, 'kyaa.io');
  assert.equal(d.CacheBehaviors[0].PathPattern, '/api/events');
  assert.ok(d.CacheBehaviors[0].AllowedMethods.includes('POST'));
  assert.equal(d.CacheBehaviors[0].CachePolicyId, '4135ea2d-6df8-44a3-9df3-4b5a84be39ad');
  assert.ok(!d.CustomErrorResponses);
  assert.ok(!r.EventsHeaders.Properties.OriginRequestPolicyConfig.HeadersConfig.Headers.includes('Host'));
  assert.match(r.Headers.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy, /frame-ancestors 'none'/);
});
test('release hash binds names and bytes, rejects changed publicly served bytes and symlinks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wave-test-'));
  try {
    await mkdir(join(dir, 'en'));
    for (const p of ['index.html','en/index.html','app.mjs','styles.css','content.json','robots.txt','sitemap.xml']) await writeFile(join(dir, p), p);
    const m = await prepare(dir, 'a'.repeat(40));
    assert.equal(m.artifactDigest, await artifactDigest(dir));
    await verifyFiles(dir, 'https://example.test', async url => new Response(await readFile(join(dir, new URL(url).pathname))));
    await assert.rejects(verifyFiles(dir, 'https://example.test', async () => new Response('wrong')), /PUBLIC_FILE_MISMATCH/);
    await writeFile(join(dir,'app.mjs'),'changed'); assert.notEqual(m.artifactDigest, await artifactDigest(dir));
    await symlink(join(dir,'app.mjs'),join(dir,'leak')); await assert.rejects(artifactDigest(dir),/SYMLINK/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('publishing is bound to exact current Wave workflow run', () => {
  const sha='a'.repeat(40), run={id:123,repository:{id:1307387500,full_name:'kyaa-io/kyaa'},head_branch:'codex/kyaawave-homepage-20261018',head_sha:sha,path:'.github/workflows/kyaawave-aws.yml',event:'push',status:'in_progress'};
  validateRun(run,sha,123);
  for (const diff of [{head_sha:'b'.repeat(40)},{head_branch:'main'},{path:'.github/workflows/evil.yml'},{repository:{id:1}},{event:'pull_request'},{status:'completed'}]) assert.throws(()=>validateRun({...run,...diff},sha,123),/UNTRUSTED/);
});
