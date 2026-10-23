#!/usr/bin/env bash
set -euo pipefail
# --dry-run reads live STS/platform/EC2/IAM metadata through AWS_PROFILE; no AWS changes.

environment="${1:-}"
enabled="${2:-false}"
mode="${3:-}"
region="${AWS_REGION:-ap-northeast-2}"
known_stale_sha256_hex="14b4f40a46b5334c3b8d83dc7d825d950612f5f0bc8a6acfa08e6af6b1bd5496"
known_stale_code_sha256="FLT0Cka1M0w7jYPcfYJdlQYS9fC8imrPoI5q9rG9VJY="

usage() {
  echo "usage: $0 <dev|staging|prod> <true|false> [--dry-run]" >&2
}

if [[ "$environment" != "dev" && "$environment" != "staging" && "$environment" != "prod" ]]; then
  usage
  exit 2
fi
if [[ "$enabled" != "true" && "$enabled" != "false" ]]; then
  echo "enabled must be true or false" >&2
  exit 2
fi
if [[ -n "$mode" && "$mode" != "--dry-run" ]]; then
  usage
  exit 2
fi
if [[ "$region" != "ap-northeast-2" ]]; then
  echo "mint worker deployment is restricted to ap-northeast-2" >&2
  exit 78
fi

if [[ "$environment" == "prod" ]]; then
  if [[ -z "${AWS_PROFILE:-}" ]]; then
    echo "prod deployment requires an explicit AWS_PROFILE" >&2
    exit 78
  fi
  if [[ ! "${EXPECTED_AWS_ACCOUNT_ID:-}" =~ ^[0-9]{12}$ ]]; then
    echo "prod deployment requires a 12-digit EXPECTED_AWS_ACCOUNT_ID" >&2
    exit 78
  fi
  if [[ "${BYUS_MINT_PROD_DEPLOY_CONFIRM:-}" != "I_UNDERSTAND_BYUS_MINT_PROD_MUTATION" ]]; then
    echo "prod deployment requires BYUS_MINT_PROD_DEPLOY_CONFIRM=I_UNDERSTAND_BYUS_MINT_PROD_MUTATION" >&2
    exit 78
  fi
  profile="$AWS_PROFILE"
  expected_account_id="$EXPECTED_AWS_ACCOUNT_ID"
elif [[ "$environment" == "staging" ]]; then
  if [[ -z "${AWS_PROFILE:-}" ]]; then echo "staging deployment requires an explicit AWS_PROFILE" >&2; exit 78; fi
  if [[ ! "${EXPECTED_AWS_ACCOUNT_ID:-}" =~ ^[0-9]{12}$ ]]; then echo "staging deployment requires a 12-digit EXPECTED_AWS_ACCOUNT_ID" >&2; exit 78; fi
  profile="$AWS_PROFILE"
  expected_account_id="$EXPECTED_AWS_ACCOUNT_ID"
else
  if [[ -z "${AWS_PROFILE:-}" ]]; then echo "dev deployment requires an explicit AWS_PROFILE" >&2; exit 78; fi
  profile="$AWS_PROFILE"
  expected_account_id="${EXPECTED_AWS_ACCOUNT_ID:-996702758024}"
  if [[ "$expected_account_id" != "996702758024" ]]; then
    echo "dev deployment account must be 996702758024" >&2
    exit 78
  fi
fi

if [[ "$expected_account_id" != "996702758024" ]]; then echo "all ByUs worker environments deploy only to Sallylab account 996702758024" >&2; exit 78; fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
role_name="byus-mint-worker-${environment}-lambda"
function_name="byus-mint-worker-${environment}"
secret_name="byus/worker/${environment}"
trust_policy="${repo_root}/infrastructure/aws/worker/lambda-trust-policy.json"
secret_policy="${repo_root}/infrastructure/aws/worker/${environment}-secrets-policy.json"
bundle="${repo_root}/apps/worker/dist-lambda/index.cjs"
BUILD_COMMIT="$(git -C "$repo_root" rev-parse HEAD)"
BUILD_TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

for policy in "$trust_policy" "$secret_policy"; do
  [[ -f "$policy" ]] || { echo "missing policy: $policy" >&2; exit 66; }
  jq -e . "$policy" >/dev/null
done

package_dir="$(mktemp -d)"
trap 'rm -rf "$package_dir"' EXIT
vpc_evidence="$(node "${repo_root}/scripts/aws-worker-vpc.mjs" --environment "$environment" --component mint --profile "$profile" --out "$package_dir")"
vpc_config="file://${package_dir}/vpc-config.json"

cd "$repo_root"
npm run build:lambda --workspace @byus/worker
[[ -f "$bundle" ]] || { echo "missing fresh mint bundle: $bundle" >&2; exit 66; }

cp "$bundle" "${package_dir}/index.cjs"
(
  cd "$package_dir"
  zip -X -q lambda-package.zip index.cjs
)
package_file="${package_dir}/lambda-package.zip"
zip_entries="$(zipinfo -1 "$package_file")"
if [[ "$zip_entries" != "index.cjs" ]]; then
  echo "unexpected Lambda ZIP entries: $zip_entries" >&2
  exit 65
fi

local_fresh_zip_sha256_hex="$(shasum -a 256 "$package_file" | awk '{print $1}')"
local_fresh_zip_code_sha256="$(openssl dgst -sha256 -binary "$package_file" | openssl base64 -A)"
if [[ "$local_fresh_zip_sha256_hex" == "$known_stale_sha256_hex" ||
      "$local_fresh_zip_code_sha256" == "$known_stale_code_sha256" ]]; then
  echo "fresh build unexpectedly matches the known stale Lambda artifact" >&2
  exit 65
fi

print_evidence() {
  echo "environment=$environment"
  echo "account=$expected_account_id"
  echo "region=$region"
  echo "function=$function_name"
  echo "handler=index.handler"
  echo "vpc_evidence=$vpc_evidence"
  echo "build_commit=$BUILD_COMMIT"
  echo "build_timestamp=$BUILD_TIMESTAMP"
  echo "zip_entries=$zip_entries"
  echo "local_fresh_zip_sha256_hex=$local_fresh_zip_sha256_hex"
  echo "local_fresh_zip_code_sha256=$local_fresh_zip_code_sha256"
  echo "known_stale_code_sha256=$known_stale_code_sha256"
}

if [[ "$mode" == "--dry-run" ]]; then
  print_evidence
  echo "mutation=none"
  exit 0
fi

actual_account_id="$(aws sts get-caller-identity --profile "$profile" --query Account --output text)"
if [[ "$actual_account_id" != "$expected_account_id" ]]; then
  echo "AWS account mismatch: expected $expected_account_id, got $actual_account_id" >&2
  exit 77
fi

if [[ "$environment" != "dev" ]]; then
  EXPECTED_ACCOUNT="$expected_account_id" POLICY_TEMPLATE="$secret_policy" POLICY_ENVIRONMENT="$environment" POLICY_OUTPUT="${package_dir}/${environment}-secrets-policy.json" node -e 'const fs=require("node:fs");const source=fs.readFileSync(process.env.POLICY_TEMPLATE,"utf8");const policy=JSON.parse(source.replaceAll("__EXPECTED_AWS_ACCOUNT_ID__",process.env.EXPECTED_ACCOUNT));if(policy.Statement.some(statement=>!String(statement.Resource).includes(`:${process.env.EXPECTED_ACCOUNT}:secret:byus/worker/${process.env.POLICY_ENVIRONMENT}-`)))throw new Error("invalid rendered staging policy");fs.writeFileSync(process.env.POLICY_OUTPUT,JSON.stringify(policy))'
  secret_policy="${package_dir}/${environment}-secrets-policy.json"
fi

if [[ "$enabled" == "true" ]]; then
  aws secretsmanager describe-secret --profile "$profile" --region "$region" --secret-id "$secret_name" >/dev/null
fi

if ! aws iam get-role --profile "$profile" --role-name "$role_name" >/dev/null 2>&1; then
  aws iam create-role --profile "$profile" --role-name "$role_name" --assume-role-policy-document "file://${trust_policy}" >/dev/null
fi
aws iam attach-role-policy --profile "$profile" --role-name "$role_name" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam put-role-policy --profile "$profile" --role-name "$role_name" --policy-name "byus-worker-${environment}-secret-read" --policy-document "file://${secret_policy}"
aws iam put-role-policy --profile "$profile" --role-name "$role_name" --policy-name "byus-worker-${environment}-vpc-eni" --policy-document "file://${package_dir}/vpc-eni-policy.json"
if jq -e '.replaceBroadVpcPolicy' "${package_dir}/vpc-evidence.json" >/dev/null; then
  aws iam detach-role-policy --profile "$profile" --role-name "$role_name" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
fi

role_arn="$(aws iam get-role --profile "$profile" --role-name "$role_name" --query 'Role.Arn' --output text)"
lambda_environment="Variables={WORKER_ENABLED=${enabled},WORKER_ENVIRONMENT=${environment},WORKER_SECRET_ID=${secret_name},BUILD_COMMIT=${BUILD_COMMIT},BUILD_TIMESTAMP=${BUILD_TIMESTAMP}}"

if aws lambda get-function --profile "$profile" --region "$region" --function-name "$function_name" >/dev/null 2>&1; then
  aws lambda update-function-code --profile "$profile" --region "$region" --function-name "$function_name" --zip-file "fileb://${package_file}" >/dev/null
  aws lambda wait function-updated-v2 --profile "$profile" --region "$region" --function-name "$function_name"
  aws lambda update-function-configuration --profile "$profile" --region "$region" --function-name "$function_name" --runtime nodejs24.x --handler index.handler --timeout 240 --memory-size 512 --role "$role_arn" --vpc-config "$vpc_config" --environment "$lambda_environment" >/dev/null
  aws lambda wait function-updated-v2 --profile "$profile" --region "$region" --function-name "$function_name"
else
  sleep 8
  aws lambda create-function --profile "$profile" --region "$region" --function-name "$function_name" --runtime nodejs24.x --architectures arm64 --role "$role_arn" --handler index.handler --zip-file "fileb://${package_file}" --timeout 240 --memory-size 512 --vpc-config "$vpc_config" --environment "$lambda_environment" >/dev/null
fi

aws lambda wait function-active-v2 --profile "$profile" --region "$region" --function-name "$function_name"
aws lambda put-function-concurrency --profile "$profile" --region "$region" --function-name "$function_name" --reserved-concurrent-executions 1 >/dev/null

remote_code_sha256="$(aws lambda get-function --profile "$profile" --region "$region" --function-name "$function_name" --query 'Configuration.CodeSha256' --output text)"
if [[ "$remote_code_sha256" == "$known_stale_code_sha256" ]]; then
  echo "deployed Lambda still reports the known stale code hash" >&2
  exit 70
fi
if [[ "$remote_code_sha256" != "$local_fresh_zip_code_sha256" ]]; then
  echo "deployed Lambda code hash does not match the fresh local artifact" >&2
  exit 70
fi

print_evidence
echo "remote_code_sha256=$remote_code_sha256"
echo "mutation=deployed"
aws lambda get-function-configuration --profile "$profile" --region "$region" --function-name "$function_name" --query '{FunctionName:FunctionName,Role:Role,VpcConfig:VpcConfig,Runtime:Runtime,Architecture:Architectures[0],State:State,Timeout:Timeout,MemorySize:MemorySize,Enabled:Environment.Variables.WORKER_ENABLED,Environment:Environment.Variables.WORKER_ENVIRONMENT,BuildCommit:Environment.Variables.BUILD_COMMIT,BuildTimestamp:Environment.Variables.BUILD_TIMESTAMP}'
