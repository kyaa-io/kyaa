#!/usr/bin/env bash
set -euo pipefail
# --dry-run reads live STS/platform/EC2/IAM metadata through AWS_PROFILE; no AWS changes.

environment="${1:-}"
enabled="${2:-false}"
mode="${3:-}"
region="${AWS_REGION:-ap-northeast-2}"
dev_account="996702758024"
if [[ "$region" != "ap-northeast-2" ]]; then echo "AWS region must be ap-northeast-2" >&2; exit 78; fi
storage_enabled="${AWS_STORAGE_ENABLED:-false}"
private_bucket="${S3_PRIVATE_BUCKET:-}"
if [[ "$storage_enabled" != "true" && "$storage_enabled" != "false" ]]; then echo "AWS_STORAGE_ENABLED must be true or false" >&2; exit 78; fi
if [[ "$storage_enabled" == "true" && ! "$private_bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then echo "AWS storage requires a valid S3_PRIVATE_BUCKET" >&2; exit 78; fi

if [[ "$environment" != "dev" && "$environment" != "staging" && "$environment" != "prod" ]]; then
  echo "usage: $0 <dev|staging|prod> <true|false> [--dry-run]" >&2
  exit 2
fi
if [[ "$enabled" != "true" && "$enabled" != "false" ]]; then echo "enabled must be true or false" >&2; exit 2; fi
if [[ -n "$mode" && "$mode" != "--dry-run" ]]; then echo "third argument must be --dry-run" >&2; exit 2; fi

if [[ "$environment" == "prod" ]]; then
  if [[ -z "${AWS_PROFILE:-}" ]]; then echo "prod deployment requires an explicit AWS_PROFILE" >&2; exit 78; fi
  profile="$AWS_PROFILE"
  expected_account="${EXPECTED_AWS_ACCOUNT_ID:-}"
  if [[ ! "$expected_account" =~ ^[0-9]{12}$ ]]; then echo "prod deployment requires a 12-digit EXPECTED_AWS_ACCOUNT_ID" >&2; exit 78; fi
  if [[ "${BYUS_NOTIFICATION_PROD_DEPLOY_CONFIRM:-}" != "I_UNDERSTAND_BYUS_NOTIFICATION_PROD_MUTATION" ]]; then echo "prod deployment requires the exact BYUS_NOTIFICATION_PROD_DEPLOY_CONFIRM acknowledgement" >&2; exit 78; fi
elif [[ "$environment" == "staging" ]]; then
  if [[ -z "${AWS_PROFILE:-}" ]]; then echo "staging deployment requires an explicit AWS_PROFILE" >&2; exit 78; fi
  if [[ ! "${EXPECTED_AWS_ACCOUNT_ID:-}" =~ ^[0-9]{12}$ ]]; then echo "staging deployment requires a 12-digit EXPECTED_AWS_ACCOUNT_ID" >&2; exit 78; fi
  profile="$AWS_PROFILE"
  expected_account="$EXPECTED_AWS_ACCOUNT_ID"
else
  if [[ -z "${AWS_PROFILE:-}" ]]; then echo "dev deployment requires an explicit AWS_PROFILE" >&2; exit 78; fi
  profile="$AWS_PROFILE"
  expected_account="${EXPECTED_AWS_ACCOUNT_ID:-$dev_account}"
fi

if [[ "$expected_account" != "996702758024" ]]; then echo "all ByUs worker environments deploy only to Sallylab account 996702758024" >&2; exit 78; fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
role_name="byus-notification-worker-${environment}-lambda"
function_name="byus-notification-worker-${environment}"
secret_name="byus/notification/${environment}"
rule_name="byus-notification-worker-${environment}-every-minute"
target_id="byus-notification-worker-${environment}"
maintenance_enabled="${BENEFIT_MAINTENANCE_ENABLED:-false}"
if [[ "$maintenance_enabled" != "true" && "$maintenance_enabled" != "false" ]]; then echo "BENEFIT_MAINTENANCE_ENABLED must be true or false" >&2; exit 2; fi
maintenance_function_name="byus-benefit-maintenance-${environment}"
maintenance_rule_name="byus-benefit-maintenance-${environment}-daily"
maintenance_target_id="byus-benefit-maintenance-${environment}"
maintenance_alarm_name="byus-benefit-maintenance-${environment}-failures"
statement_id=""
trust_policy="${repo_root}/infrastructure/aws/worker/lambda-trust-policy.json"
secret_policy_template="${repo_root}/infrastructure/aws/worker/${environment}-notification-secrets-policy.json"
bundle="${repo_root}/apps/worker/dist-lambda/notification-index.cjs"

node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));JSON.parse(require("node:fs").readFileSync(process.argv[2],"utf8"))' "$trust_policy" "$secret_policy_template"
if [[ "$environment" != "dev" ]] && ! grep -q '__EXPECTED_AWS_ACCOUNT_ID__' "$secret_policy_template"; then echo "$environment secret policy account placeholder is missing" >&2; exit 78; fi
package_dir="$(mktemp -d)"
trap 'rm -rf "$package_dir"' EXIT
vpc_arguments=(--environment "$environment" --component notification --profile "$profile" --out "$package_dir")
if [[ "$storage_enabled" == "true" ]]; then vpc_arguments+=(--private-bucket "$private_bucket"); fi
vpc_evidence="$(node "${repo_root}/scripts/aws-worker-vpc.mjs" "${vpc_arguments[@]}")"
vpc_config="file://${package_dir}/vpc-config.json"
npm run build:lambda --workspace @byus/worker >/dev/null
node --check "$bundle"

if [[ "$mode" == "--dry-run" ]]; then
  printf 'validated notification deployment: environment=%s enabled=%s profile=%s account=%s function=%s rule=%s schedule=%s secret=%s maintenance_function=%s maintenance_enabled=%s maintenance_rule=%s maintenance_schedule=%s maintenance_timeout=%s storage_enabled=%s private_bucket=%s\n' \
    "$environment" "$enabled" "$profile" "$expected_account" "$function_name" "$rule_name" 'rate(1 minute)' "$secret_name" "$maintenance_function_name" "$maintenance_enabled" "$maintenance_rule_name" 'rate(1 day)' '120' "$storage_enabled" "$private_bucket"
  echo "vpc_evidence=$vpc_evidence"
  exit 0
fi

for command in aws zip mktemp; do command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 78; }; done
account="$(aws sts get-caller-identity --profile "$profile" --query Account --output text)"
if [[ "$account" != "$expected_account" ]]; then echo "AWS account mismatch" >&2; exit 78; fi
if [[ "$enabled" == "true" ]]; then aws secretsmanager describe-secret --profile "$profile" --region "$region" --secret-id "$secret_name" >/dev/null; fi

secret_policy="$secret_policy_template"
if [[ "$environment" != "dev" ]]; then
  EXPECTED_ACCOUNT="$expected_account" POLICY_TEMPLATE="$secret_policy_template" POLICY_ENVIRONMENT="$environment" POLICY_OUTPUT="${package_dir}/${environment}-secrets-policy.json" node -e 'const fs=require("node:fs");const source=fs.readFileSync(process.env.POLICY_TEMPLATE,"utf8");const rendered=source.replaceAll("__EXPECTED_AWS_ACCOUNT_ID__",process.env.EXPECTED_ACCOUNT);const policy=JSON.parse(rendered);if(policy.Statement.some(statement=>!String(statement.Resource).includes(`:${process.env.EXPECTED_ACCOUNT}:secret:byus/notification/${process.env.POLICY_ENVIRONMENT}-`)))throw new Error("invalid rendered notification policy");fs.writeFileSync(process.env.POLICY_OUTPUT,JSON.stringify(policy))'
  secret_policy="${package_dir}/${environment}-secrets-policy.json"
fi
cp "$bundle" "${package_dir}/index.cjs"
(cd "$package_dir" && zip -q lambda-package.zip index.cjs)
package_file="${package_dir}/lambda-package.zip"

if ! aws iam get-role --profile "$profile" --role-name "$role_name" >/dev/null 2>&1; then
  aws iam create-role --profile "$profile" --role-name "$role_name" --assume-role-policy-document "file://${trust_policy}" >/dev/null
fi
aws iam attach-role-policy --profile "$profile" --role-name "$role_name" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam put-role-policy --profile "$profile" --role-name "$role_name" --policy-name "byus-notification-worker-${environment}-secret-read" --policy-document "file://${secret_policy}"
aws iam put-role-policy --profile "$profile" --role-name "$role_name" --policy-name "byus-notification-worker-${environment}-vpc-eni" --policy-document "file://${package_dir}/vpc-eni-policy.json"
if node -e 'if(!JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).replaceBroadVpcPolicy)process.exit(1)' "${package_dir}/vpc-evidence.json"; then
  aws iam detach-role-policy --profile "$profile" --role-name "$role_name" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
fi
if [[ "$storage_enabled" == "true" ]]; then
  PRIVATE_BUCKET="$private_bucket" node -e 'process.stdout.write(JSON.stringify({Version:"2012-10-17",Statement:[{Effect:"Allow",Action:"s3:GetObject",Resource:`arn:aws:s3:::${process.env.PRIVATE_BUCKET}/certification-proofs/*`}]}))' >"${package_dir}/private-proofs-read-policy.json"
  aws iam put-role-policy --profile "$profile" --role-name "$role_name" --policy-name "byus-notification-worker-${environment}-private-proofs-read" --policy-document "file://${package_dir}/private-proofs-read-policy.json"
fi
aws iam wait role-exists --profile "$profile" --role-name "$role_name"
role_arn="$(aws iam get-role --profile "$profile" --role-name "$role_name" --query 'Role.Arn' --output text)"

lambda_environment="Variables={NOTIFICATION_WORKER_ENABLED=${enabled},BENEFIT_MAINTENANCE_ENABLED=false,NOTIFICATION_WORKER_ENVIRONMENT=${environment},NOTIFICATION_WORKER_SECRET_ID=${secret_name}}"
create_notification_lambda() {
  local attempt=1
  local max_attempts=12
  local retry_delay_seconds=5
  local error_file="${package_dir}/create-function-error.txt"
  while (( attempt <= max_attempts )); do
    if aws lambda create-function --profile "$profile" --region "$region" --function-name "$function_name" --runtime nodejs24.x --architectures arm64 --role "$role_arn" --handler index.handler --zip-file "fileb://${package_file}" --timeout 300 --memory-size 256 --vpc-config "$vpc_config" --environment "$lambda_environment" > /dev/null 2>"$error_file"; then
      return 0
    fi
    if ! grep -Fq 'role defined for the function cannot be assumed by Lambda' "$error_file"; then
      cat "$error_file" >&2
      return 1
    fi
    if (( attempt == max_attempts )); then
      echo "Lambda role propagation did not converge after ${max_attempts} attempts" >&2
      cat "$error_file" >&2
      return 1
    fi
    sleep "$retry_delay_seconds"
    attempt=$((attempt + 1))
  done
}
if aws lambda get-function --profile "$profile" --region "$region" --function-name "$function_name" >/dev/null 2>&1; then
  aws lambda update-function-code --profile "$profile" --region "$region" --function-name "$function_name" --zip-file "fileb://${package_file}" >/dev/null
  aws lambda wait function-updated-v2 --profile "$profile" --region "$region" --function-name "$function_name"
  aws lambda update-function-configuration --profile "$profile" --region "$region" --function-name "$function_name" --runtime nodejs24.x --handler index.handler --timeout 300 --memory-size 256 --role "$role_arn" --vpc-config "$vpc_config" --environment "$lambda_environment" >/dev/null
  aws lambda wait function-updated-v2 --profile "$profile" --region "$region" --function-name "$function_name"
else
  create_notification_lambda
fi
aws lambda wait function-active-v2 --profile "$profile" --region "$region" --function-name "$function_name"
aws lambda put-function-concurrency --profile "$profile" --region "$region" --function-name "$function_name" --reserved-concurrent-executions 1 >/dev/null
function_arn="$(aws lambda get-function-configuration --profile "$profile" --region "$region" --function-name "$function_name" --query FunctionArn --output text)"

case "$environment" in dev) statement_id="AllowEventBridgeNotificationWorkerDev" ;; staging) statement_id="AllowEventBridgeNotificationWorkerStaging" ;; prod) statement_id="AllowEventBridgeNotificationWorkerProd" ;; esac
rule_state="DISABLED"; [[ "$enabled" == "true" ]] && rule_state="ENABLED"
rule_arn="$(aws events put-rule --profile "$profile" --region "$region" --name "$rule_name" --schedule-expression 'rate(1 minute)' --state "$rule_state" --query RuleArn --output text)"
policy=""
if aws lambda get-policy --profile "$profile" --region "$region" --function-name "$function_name" --query Policy --output text >"${package_dir}/lambda-policy.txt" 2>/dev/null; then policy="$(<"${package_dir}/lambda-policy.txt")"; fi
if [[ "$policy" != *"${statement_id}"* ]]; then
  aws lambda add-permission --profile "$profile" --region "$region" --function-name "$function_name" --statement-id "$statement_id" --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$rule_arn" >/dev/null
fi
FUNCTION_ARN="$function_arn" TARGET_ID="$target_id" TARGET_ENVIRONMENT="$environment" node -e 'const input=JSON.stringify({source:"byus.notification-cron",environment:process.env.TARGET_ENVIRONMENT});process.stdout.write(JSON.stringify([{Id:process.env.TARGET_ID,Arn:process.env.FUNCTION_ARN,Input:input}]))' >"${package_dir}/event-target.json"
aws events put-targets --profile "$profile" --region "$region" --rule "$rule_name" --targets "file://${package_dir}/event-target.json" >/dev/null

# The maintenance schedule uses the same reviewed binary but a separate Lambda
# function, timeout, concurrency boundary, invocation mode, metric, and alarm.
maintenance_lambda_environment="Variables={NOTIFICATION_WORKER_ENABLED=false,BENEFIT_MAINTENANCE_ENABLED=${maintenance_enabled},NOTIFICATION_WORKER_ENVIRONMENT=${environment},NOTIFICATION_WORKER_SECRET_ID=${secret_name}}"
if aws lambda get-function --profile "$profile" --region "$region" --function-name "$maintenance_function_name" >/dev/null 2>&1; then
  aws lambda update-function-code --profile "$profile" --region "$region" --function-name "$maintenance_function_name" --zip-file "fileb://${package_file}" >/dev/null
  aws lambda wait function-updated-v2 --profile "$profile" --region "$region" --function-name "$maintenance_function_name"
  aws lambda update-function-configuration --profile "$profile" --region "$region" --function-name "$maintenance_function_name" --runtime nodejs24.x --handler index.handler --timeout 120 --memory-size 256 --role "$role_arn" --vpc-config "$vpc_config" --environment "$maintenance_lambda_environment" >/dev/null
  aws lambda wait function-updated-v2 --profile "$profile" --region "$region" --function-name "$maintenance_function_name"
else
  aws lambda create-function --profile "$profile" --region "$region" --function-name "$maintenance_function_name" --runtime nodejs24.x --architectures arm64 --role "$role_arn" --handler index.handler --zip-file "fileb://${package_file}" --timeout 120 --memory-size 256 --vpc-config "$vpc_config" --environment "$maintenance_lambda_environment" >/dev/null
fi
aws lambda wait function-active-v2 --profile "$profile" --region "$region" --function-name "$maintenance_function_name"
aws lambda put-function-concurrency --profile "$profile" --region "$region" --function-name "$maintenance_function_name" --reserved-concurrent-executions 1 >/dev/null
maintenance_function_arn="$(aws lambda get-function-configuration --profile "$profile" --region "$region" --function-name "$maintenance_function_name" --query FunctionArn --output text)"
maintenance_rule_state="DISABLED"; [[ "$maintenance_enabled" == "true" ]] && maintenance_rule_state="ENABLED"
maintenance_rule_arn="$(aws events put-rule --profile "$profile" --region "$region" --name "$maintenance_rule_name" --schedule-expression 'rate(1 day)' --state "$maintenance_rule_state" --query RuleArn --output text)"
maintenance_statement_id="AllowEventBridgeBenefitMaintenance${environment^}"
maintenance_policy=""
if aws lambda get-policy --profile "$profile" --region "$region" --function-name "$maintenance_function_name" --query Policy --output text >"${package_dir}/maintenance-lambda-policy.txt" 2>/dev/null; then maintenance_policy="$(<"${package_dir}/maintenance-lambda-policy.txt")"; fi
if [[ "$maintenance_policy" != *"${maintenance_statement_id}"* ]]; then
  aws lambda add-permission --profile "$profile" --region "$region" --function-name "$maintenance_function_name" --statement-id "$maintenance_statement_id" --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$maintenance_rule_arn" >/dev/null
fi
FUNCTION_ARN="$maintenance_function_arn" TARGET_ID="$maintenance_target_id" TARGET_ENVIRONMENT="$environment" node -e 'const input=JSON.stringify({source:"byus.maintenance-cron",environment:process.env.TARGET_ENVIRONMENT,mode:"maintenance"});process.stdout.write(JSON.stringify([{Id:process.env.TARGET_ID,Arn:process.env.FUNCTION_ARN,Input:input,RetryPolicy:{MaximumEventAgeInSeconds:3600,MaximumRetryAttempts:2}}]))' >"${package_dir}/maintenance-event-target.json"
aws events put-targets --profile "$profile" --region "$region" --rule "$maintenance_rule_name" --targets "file://${package_dir}/maintenance-event-target.json" >/dev/null
aws cloudwatch put-metric-alarm --profile "$profile" --region "$region" --alarm-name "$maintenance_alarm_name" --namespace 'ByUs/Maintenance' --metric-name Failures --dimensions "Name=Environment,Value=${environment}" 'Name=Mode,Value=recipient-purge' --statistic Sum --period 86400 --evaluation-periods 1 --datapoints-to-alarm 1 --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data notBreaching >/dev/null

aws lambda get-function-configuration --profile "$profile" --region "$region" --function-name "$function_name" --query '{FunctionName:FunctionName,Role:Role,VpcConfig:VpcConfig,Runtime:Runtime,State:State,Enabled:Environment.Variables.NOTIFICATION_WORKER_ENABLED,Environment:Environment.Variables.NOTIFICATION_WORKER_ENVIRONMENT}'
aws events describe-rule --profile "$profile" --region "$region" --name "$rule_name" --query '{Name:Name,State:State,ScheduleExpression:ScheduleExpression}'
aws lambda get-function-configuration --profile "$profile" --region "$region" --function-name "$maintenance_function_name" --query '{FunctionName:FunctionName,Role:Role,VpcConfig:VpcConfig,Runtime:Runtime,State:State,NotificationEnabled:Environment.Variables.NOTIFICATION_WORKER_ENABLED,MaintenanceEnabled:Environment.Variables.BENEFIT_MAINTENANCE_ENABLED,Timeout:Timeout}'
aws events describe-rule --profile "$profile" --region "$region" --name "$maintenance_rule_name" --query '{Name:Name,State:State,ScheduleExpression:ScheduleExpression}'
