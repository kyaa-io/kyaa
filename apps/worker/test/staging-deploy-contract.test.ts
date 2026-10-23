import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const root = resolve(process.cwd(), "../..");
describe("staging deployment isolation", () => {
  it.each(["deploy-aws-worker.sh", "deploy-aws-notification-worker.sh"])("requires both explicit identity gates before building in %s", (name) => {
    for (const [AWS_PROFILE, EXPECTED_AWS_ACCOUNT_ID, message] of [["", "123456789012", "explicit AWS_PROFILE"], ["staging", "", "12-digit EXPECTED_AWS_ACCOUNT_ID"]]) {
      const result = spawnSync(resolve(root, "scripts", name), ["staging", "false", "--dry-run"], {
        encoding: "utf8", env: { ...process.env, AWS_PROFILE, EXPECTED_AWS_ACCOUNT_ID },
      });
      expect(result.status).toBe(78); expect(result.stderr).toContain(message);
      expect(result.stdout).toBe("");
    }
    const script = readFileSync(resolve(root, "scripts", name), "utf8");
    expect(script).toContain('enabled="${2:-false}"');
    expect(script).toContain('secret_name="byus/');
    expect(script).toContain('POLICY_ENVIRONMENT="$environment"');
    expect(script).toContain('replaceAll("__EXPECTED_AWS_ACCOUNT_ID__",process.env.EXPECTED_ACCOUNT)');
  });
  it.each(["worker", "notification"])("restricts the %s IAM policy to the verified account and staging secret", (kind) => {
    const name = kind === "worker" ? "staging-secrets-policy.json" : "staging-notification-secrets-policy.json";
    const policy = JSON.parse(readFileSync(resolve(root, "infrastructure/aws/worker", name), "utf8"));
    expect(policy.Statement).toHaveLength(1);
    expect(policy.Statement[0].Action).toBe("secretsmanager:GetSecretValue");
    expect(policy.Statement[0].Resource).toBe(`arn:aws:secretsmanager:ap-northeast-2:__EXPECTED_AWS_ACCOUNT_ID__:secret:byus/${kind}/staging-*`);
  });
  it("defaults separate notification and maintenance activation to false", () => {
    const script = readFileSync(resolve(root, "scripts/deploy-aws-notification-worker.sh"), "utf8");
    expect(script).toContain('maintenance_enabled="${BENEFIT_MAINTENANCE_ENABLED:-false}"');
    const template = readFileSync(resolve(root, "infrastructure/aws/notification-worker-template.yaml"), "utf8");
    expect(template).toContain("AllowedValues: [dev, staging, prod]");
    expect(template.match(/Default: "false"/g)).toHaveLength(2);
  });
});

it("rejects enabled S3 deployments with no private bucket before building or mutation", () => {
  const result = spawnSync(resolve(root, "scripts/deploy-aws-notification-worker.sh"), ["dev", "false", "--dry-run"], { encoding: "utf8", env: { ...process.env, AWS_STORAGE_ENABLED: "true", S3_PRIVATE_BUCKET: "" } });
  expect(result.status).toBe(78); expect(result.stderr).toContain("valid S3_PRIVATE_BUCKET");
  const script = readFileSync(resolve(root, "scripts/deploy-aws-notification-worker.sh"), "utf8");
  expect(script).toContain('Action:"s3:GetObject"');
  expect(script).toContain('/certification-proofs/*');
  expect(script.indexOf('private-proofs-read-policy.json')).toBeGreaterThan(script.indexOf('AWS account mismatch'));
  expect(script).not.toContain('Action:"s3:*"');
});
