import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const stack = JSON.parse(await readFile(new URL('../infrastructure/aws/platform/edge-security.json', import.meta.url)));
const rules = stack.Resources.WebAcl.Properties.Rules;
const common = rules.find(rule => rule.Name === 'CommonRules');
const guard = rules.find(rule => rule.Name === 'BlockOversizeBodies');
const uuid = '12345678-1234-4123-8123-123456789abc';
const routes = [
  ['PUT', '/api/me/avatar'],
  ['POST', `/api/certifications/${uuid}/uploads`],
  ['POST', '/api/content-assets'],
  ['POST', '/api/admin/image-assets'],
  ['POST', `/api/admin/celebrities/${uuid}/notices/${uuid}/assets`],
];

// Evaluate the actual configured statement; this models matching, not AWS's managed inspection engine.
function matches(statement, request) {
  if (statement.AndStatement) return statement.AndStatement.Statements.every(s => matches(s, request));
  if (statement.OrStatement) return statement.OrStatement.Statements.some(s => matches(s, request));
  if (statement.NotStatement) return !matches(statement.NotStatement.Statement, request);
  if (statement.SizeConstraintStatement) {
    const size = statement.SizeConstraintStatement;
    assert.equal(size.ComparisonOperator, 'GT');
    assert.deepEqual(size.FieldToMatch, { Body: { OversizeHandling: 'MATCH' } });
    assert.deepEqual(size.TextTransformations, [{ Priority: 0, Type: 'NONE' }]);
    return request.bodyBytes > 65536 || request.bodyBytes > size.Size;
  }
  const match = statement.ByteMatchStatement ?? statement.RegexMatchStatement;
  assert(match, 'unexpected statement type');
  const field = match.FieldToMatch;
  let value = field.Method ? request.method : field.UriPath ? request.path : request.contentType;
  for (const transformation of match.TextTransformations) {
    assert.equal(transformation.Priority, 0);
    assert(['NONE', 'LOWERCASE'].includes(transformation.Type));
    if (transformation.Type === 'LOWERCASE') value = value.toLowerCase();
  }
  if (statement.RegexMatchStatement) return new RegExp(match.RegexString).test(value);
  assert(['EXACTLY', 'STARTS_WITH'].includes(match.PositionalConstraint));
  return match.PositionalConstraint === 'EXACTLY' ? value === match.SearchString : value.startsWith(match.SearchString);
}
function blocked(method, path, contentType = 'multipart/form-data; boundary=test', bodyBytes = 65537) {
  return matches(guard.Statement, { method, path, contentType, bodyBytes });
}

test('only body-size managed action changes; other managed protections and rate limit remain active', () => {
  assert.deepEqual(common.OverrideAction, { None: {} });
  assert.deepEqual(common.Statement.ManagedRuleGroupStatement, {
    VendorName: 'AWS', Name: 'AWSManagedRulesCommonRuleSet',
    RuleActionOverrides: [{ Name: 'SizeRestrictions_BODY', ActionToUse: { Count: {} } }],
  });
  assert.equal(common.Priority, 10);
  assert.equal(guard.Priority, 11);
  assert.deepEqual(guard.Action, { Block: {} });
  assert(!rules.some(rule => rule.Action?.Allow));
  const rate = rules.find(rule => rule.Name === 'RateLimit');
  assert.equal(rate.Priority, 20);
  assert.deepEqual(rate.Action, { Block: {} });
  assert.deepEqual(rate.Statement, { RateBasedStatement: { Limit: 2000, AggregateKeyType: 'IP' } });
  assert.deepEqual(stack.Resources.WebAcl.Properties.AssociationConfig, {
    RequestBody: { CLOUDFRONT: { DefaultSizeInspectionLimit: 'KB_64' } },
  });
  assert.equal(guard.Statement.AndStatement.Statements[0].SizeConstraintStatement.Size, 65536);
  assert(!JSON.stringify(guard).includes('content-length'));
});

test('five exact multipart contracts avoid only the body-size block, including mixed-case MIME type', () => {
  for (const [method, path] of routes) {
    assert.equal(blocked(method, path), false, path);
    assert.equal(blocked(method, path, 'Multipart/Form-Data; boundary=Test'), false, path);
  }
});

test('wrong paths, methods and MIME types retain the oversize block', () => {
  for (const [method, path] of routes) {
    for (const wrong of ['GET', 'PATCH', method.toLowerCase(), method === 'POST' ? 'PUT' : 'POST']) {
      assert.equal(blocked(wrong, path), true, `${wrong} ${path}`);
    }
    for (const wrong of [`${path}/`, `${path}/extra`, `/prefix${path}`, path.replace('/api/', '/API/')]) {
      assert.equal(blocked(method, wrong), true, wrong);
    }
    for (const wrong of ['', 'application/json', 'multipart/form-data', 'multipart/form-dataX; boundary=x', 'text/plain; multipart/form-data;']) {
      assert.equal(blocked(method, path, wrong), true, wrong);
    }
  }
  assert.equal(blocked('POST', '/api/unknown'), true);
});

test('UUID route matching follows the installed application validator, for both notice identifiers', () => {
  const ids = [uuid, uuid.toUpperCase(), uuid.replace('-4123-', '-7123-'),
    '00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', 'not-a-uuid', uuid.replace('-4123-', '-0123-'),
    uuid.replace('-8123-', '-c123-'), `${uuid}x`, uuid.replaceAll('-', '')];
  for (const id of ids) {
    const invalid = !z.uuid().safeParse(id).success;
    assert.equal(blocked('POST', `/api/certifications/${id}/uploads`), invalid, id);
    assert.equal(blocked('POST', `/api/admin/celebrities/${id}/notices/${uuid}/assets`), invalid, id);
    assert.equal(blocked('POST', `/api/admin/celebrities/${uuid}/notices/${id}/assets`), invalid, id);
  }
});

test('ordinary bodies remain accepted through 64KiB; oversize matching needs no Content-Length', () => {
  for (const bodyBytes of [8192, 8193, 32000, 64000, 65536]) {
    assert.equal(blocked('POST', '/api/unknown', 'application/json', bodyBytes), false, String(bodyBytes));
  }
  for (const bodyBytes of [65537, 1024 * 1024]) {
    assert.equal(blocked('POST', '/api/unknown', 'application/json', bodyBytes), true, String(bodyBytes));
    assert.equal(blocked('POST', '/api/content-assets', 'multipart/form-data; boundary=test', bodyBytes), false);
  }
});

const jsonRoutes = [
  ['POST', '/api/admin/home-banners'],
  ['POST', `/api/admin/celebrities/${uuid}/notices`],
  ['POST', '/api/telegram/bug-reports/webhook'],
  ['POST', '/api/internal/telegram/bug-reports/123/complete'],
  ['POST', '/api/internal/telegram/deployment-notices'],
  ['POST', '/api/store/webhooks/apple'],
  ['POST', '/api/store/webhooks/google'],
  ['PATCH', '/api/me/mobile-settings'],
  ['POST', '/api/me/installations'],
  ['DELETE', `/api/me/installations/${uuid}`],
  ['POST', '/api/me/store/intents'],
  ['POST', '/api/me/store/transactions/verify'],
  ['POST', '/api/me/mobile-fan-economy/exchange'],
  ['POST', '/api/me/mobile-fan-economy/support'],
  ['POST', `/api/me/mobile-fan-economy/projects/${uuid}/votes`],
  ['POST', '/api/me/mobile-fan-economy/requests/request-key/cancel'],
  ['POST', '/api/me/mobile-fan-economy/activities/check-in'],
  ['POST', '/api/me/mobile-fan-economy/store/vote-intents'],
  ['POST', '/api/me/mobile-fan-economy/store/vote-verify'],
];

test('all 19 bounded JSON contracts accept oversized JSON with optional MIME parameters', () => {
  assert.equal(routes.length + jsonRoutes.length, 24);
  for (const [method, path] of jsonRoutes) {
    for (const type of ['application/json', 'Application/JSON', 'application/json; charset=utf-8']) {
      assert.equal(blocked(method, path, type, 524288), false, `${method} ${path} ${type}`);
    }
  }
});

test('JSON exceptions require the exact method, anchored endpoint, and JSON media type', () => {
  for (const [method, path] of jsonRoutes) {
    for (const wrong of ['GET', 'HEAD', method.toLowerCase(), method === 'POST' ? 'PATCH' : 'POST']) {
      assert.equal(blocked(wrong, path, 'application/json'), true, `${wrong} ${path}`);
    }
    for (const wrong of [`${path}/`, `${path}/extra`, `/prefix${path}`, path.replace('/api/', '/API/')]) {
      assert.equal(blocked(method, wrong, 'application/json'), true, wrong);
    }
    for (const wrong of ['', 'text/plain', 'application/jsonp', 'application/json-extra', 'text/plain; application/json', 'multipart/form-data; boundary=test']) {
      assert.equal(blocked(method, path, wrong), true, `${path} ${wrong}`);
    }
  }
  for (const path of ['/api/admin/home-banners/extra', '/api/admin/celebrities//notices',
    '/api/internal/telegram/bug-reports//complete', '/api/me/installations//',
    '/api/me/mobile-fan-economy/projects//votes', '/api/me/mobile-fan-economy/requests//cancel',
    '/api/me/mobile-fan-economy/store/unknown', '/api/store/webhooks/other']) {
    assert.equal(blocked('POST', path, 'application/json'), true, path);
  }
});
