import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const resources = JSON.parse(readFileSync('infrastructure/aws/platform/environment.json', 'utf8')).Resources;

// The ALB default (30 s interval, 5 healthy checks) made a new task wait at least 150 s before it took traffic.
for (const [name, path, port] of [['WebTargetGroup', '/api/health/live', undefined], ['PostgrestTargetGroup', '/ready', '3002']]) {
  test(`${name} marks a task healthy after 2 checks 10 s apart and keeps the drain and grace settings`, () => {
    const { Properties: group } = resources[name];
    assert.equal(group.HealthCheckPath, path);
    assert.equal(group.HealthCheckPort, port);
    assert.equal(group.HealthCheckIntervalSeconds, 10);
    assert.equal(group.HealthCheckTimeoutSeconds, 5);
    assert.ok(group.HealthCheckTimeoutSeconds < group.HealthCheckIntervalSeconds);
    assert.equal(group.HealthyThresholdCount, 2);
    assert.equal(group.UnhealthyThresholdCount, 3);
    assert.deepEqual(group.Matcher, { HttpCode: '200' });
    assert.deepEqual(group.TargetGroupAttributes, [{ Key: 'deregistration_delay.timeout_seconds', Value: '30' }]);
  });
}

test('the service keeps its 90 s health check grace period, circuit breaker and rollback', () => {
  const service = resources.Service.Properties;
  assert.equal(service.HealthCheckGracePeriodSeconds, 90);
  assert.deepEqual(service.DeploymentConfiguration.DeploymentCircuitBreaker, { Enable: true, Rollback: true });
});
