#!/usr/bin/env bash
set -euo pipefail
# SES delivery feedback: configuration set -> SNS topic -> Lambda -> record_ses_email_event.
# --dry-run validates inputs and reads STS/platform/EC2/IAM metadata through AWS_PROFILE; no AWS changes.
# --check also reads SES/SNS/SQS/IAM/Lambda/CloudWatch state and prints only what would change; no AWS changes.

usage() { echo "usage: $0 <dev|prod> [--dry-run|--check]" >&2; exit 2; }
if (( $# < 1 || $# > 2 )); then usage; fi
environment="$1"
mode="${2:-}"
if [[ "$environment" != "dev" && "$environment" != "prod" ]]; then usage; fi
if [[ -n "$mode" && "$mode" != "--dry-run" && "$mode" != "--check" ]]; then usage; fi
region="${AWS_REGION:-ap-northeast-2}"
if [[ "$region" != "ap-northeast-2" ]]; then echo "AWS region must be ap-northeast-2" >&2; exit 78; fi

if [[ -z "${AWS_PROFILE:-}" ]]; then echo "$environment deployment requires an explicit AWS_PROFILE" >&2; exit 78; fi
profile="$AWS_PROFILE"
if [[ "$environment" == "prod" ]]; then
  expected_account="${EXPECTED_AWS_ACCOUNT_ID:-}"
  if [[ ! "$expected_account" =~ ^[0-9]{12}$ ]]; then echo "prod deployment requires a 12-digit EXPECTED_AWS_ACCOUNT_ID" >&2; exit 78; fi
  if [[ "${BYUS_SES_FEEDBACK_PROD_DEPLOY_CONFIRM:-}" != "I_UNDERSTAND_BYUS_SES_FEEDBACK_PROD_MUTATION" ]]; then echo "prod deployment requires the exact BYUS_SES_FEEDBACK_PROD_DEPLOY_CONFIRM acknowledgement" >&2; exit 78; fi
else
  expected_account="${EXPECTED_AWS_ACCOUNT_ID:-996702758024}"
fi
if [[ "$expected_account" != "996702758024" ]]; then echo "all ByUs worker environments deploy only to Sallylab account 996702758024" >&2; exit 78; fi
account="$expected_account"

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
config_set="byus-notification-${environment}"
destination_name="byus-ses-feedback-sns"
event_types='["BOUNCE","COMPLAINT","DELIVERY","DELIVERY_DELAY","REJECT","SEND"]'
topic_name="byus-ses-feedback-${environment}"
topic_arn="arn:aws:sns:${region}:${account}:${topic_name}"
function_name="byus-ses-feedback-${environment}"
role_name="byus-ses-feedback-worker-${environment}-lambda"
# Two failure stores, kept apart so an operator knows which hop failed:
#  - sns_dlq: the subscription RedrivePolicy. SNS parks a message here when it
#    cannot hand it to Lambda (permission/function missing, or its retry policy
#    for the Lambda endpoint runs out). Body = the SNS message.
#  - failed: the function's async OnFailure destination. Lambda parks an event
#    here after it was handed over but every attempt threw (DB error) or the
#    event aged out (e.g. throttled). Body = invocation record with requestPayload.
sns_dlq_name="byus-ses-feedback-${environment}-sns-dlq"
sns_dlq_arn="arn:aws:sqs:${region}:${account}:${sns_dlq_name}"
failed_name="byus-ses-feedback-${environment}-failed"
failed_arn="arn:aws:sqs:${region}:${account}:${failed_name}"
secret_name="byus/notification/${environment}"
statement_id="AllowSnsSesFeedback-${environment}"
trust_policy="${repo_root}/infrastructure/aws/worker/lambda-trust-policy.json"
secret_policy_template="${repo_root}/infrastructure/aws/worker/${environment}-notification-secrets-policy.json"
bundle="${repo_root}/apps/worker/dist-lambda/ses-feedback-index.cjs"

node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));JSON.parse(require("node:fs").readFileSync(process.argv[2],"utf8"))' "$trust_policy" "$secret_policy_template"
if [[ "$environment" != "dev" ]] && ! grep -q '__EXPECTED_AWS_ACCOUNT_ID__' "$secret_policy_template"; then echo "$environment secret policy account placeholder is missing" >&2; exit 78; fi
package_dir="$(mktemp -d)"
trap 'rm -rf "$package_dir"' EXIT
vpc_evidence="$(node "${repo_root}/scripts/aws-worker-vpc.mjs" --environment "$environment" --component ses-feedback --profile "$profile" --out "$package_dir")"
vpc_config="file://${package_dir}/vpc-config.json"
npm run build:lambda --workspace @byus/worker >/dev/null
node --check "$bundle"

# Every document the script applies is rendered once, here, so --check compares
# exactly what a real run would write.
ACCOUNT="$account" REGION="$region" ENVIRONMENT="$environment" CONFIG_SET="$config_set" TOPIC_ARN="$topic_arn" SNS_DLQ_ARN="$sns_dlq_arn" FAILED_ARN="$failed_arn" \
SECRET_NAME="$secret_name" EVENT_TYPES="$event_types" SECRET_TEMPLATE="$secret_policy_template" OUT="$package_dir" node -e '
const fs=require("node:fs"),e=process.env,write=(name,value)=>fs.writeFileSync(`${e.OUT}/${name}`,JSON.stringify(value));
write("topic-policy.json",{Version:"2012-10-17",Statement:[{Sid:"AllowSesConfigurationSetPublish",Effect:"Allow",Principal:{Service:"ses.amazonaws.com"},Action:"sns:Publish",Resource:e.TOPIC_ARN,Condition:{StringEquals:{"AWS:SourceAccount":e.ACCOUNT,"AWS:SourceArn":`arn:aws:ses:${e.REGION}:${e.ACCOUNT}:configuration-set/${e.CONFIG_SET}`}}}]});
write("sns-dlq-policy.json",{Version:"2012-10-17",Statement:[{Sid:"AllowSesFeedbackTopicRedrive",Effect:"Allow",Principal:{Service:"sns.amazonaws.com"},Action:"sqs:SendMessage",Resource:e.SNS_DLQ_ARN,Condition:{ArnEquals:{"aws:SourceArn":e.TOPIC_ARN}}}]});
write("failed-send-policy.json",{Version:"2012-10-17",Statement:[{Effect:"Allow",Action:"sqs:SendMessage",Resource:e.FAILED_ARN}]});
const secret=JSON.parse(fs.readFileSync(e.SECRET_TEMPLATE,"utf8").replaceAll("__EXPECTED_AWS_ACCOUNT_ID__",e.ACCOUNT));
if(secret.Statement.some(s=>!String(s.Resource).includes(`:${e.ACCOUNT}:secret:${e.SECRET_NAME}-`)))throw new Error("invalid rendered notification secret policy");
write("secret-policy.json",secret);
write("event-destination.json",{Enabled:true,MatchingEventTypes:JSON.parse(e.EVENT_TYPES),SnsDestination:{TopicArn:e.TOPIC_ARN}});
write("redrive-policy.json",{deadLetterTargetArn:e.SNS_DLQ_ARN});
write("lambda-environment.json",{Variables:{SES_FEEDBACK_ENVIRONMENT:e.ENVIRONMENT,SES_FEEDBACK_SECRET_ID:e.SECRET_NAME,SES_FEEDBACK_TOPIC_ARN:e.TOPIC_ARN}});
write("async-destination.json",{OnFailure:{Destination:e.FAILED_ARN}});
// 14 days is the SQS maximum retention; alarms fire on the first message.
write("sns-dlq-attributes.json",{MessageRetentionPeriod:"1209600",SqsManagedSseEnabled:"true",Policy:fs.readFileSync(`${e.OUT}/sns-dlq-policy.json`,"utf8")});
write("failed-attributes.json",{MessageRetentionPeriod:"1209600",SqsManagedSseEnabled:"true"});
'
# A fixed timestamp keeps the zip byte-identical across builds, so --check can
# compare CodeSha256 instead of always reporting a code change.
cp "$bundle" "${package_dir}/index.cjs"
touch -t 202001010000 "${package_dir}/index.cjs"
(cd "$package_dir" && zip -q -X lambda-package.zip index.cjs)
package_file="${package_dir}/lambda-package.zip"
code_sha="$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("base64"))' "$package_file")"

if [[ "$mode" == "--dry-run" ]]; then
  printf 'validated ses feedback deployment: environment=%s profile=%s account=%s configuration_set=%s topic=%s function=%s role=%s sns_dlq=%s failed=%s events=%s alarms=%s\n' \
    "$environment" "$profile" "$account" "$config_set" "$topic_name" "$function_name" "$role_name" "$sns_dlq_name" "$failed_name" "$event_types" "$([[ "$environment" == "prod" ]] && echo 5 || echo 0)"
  echo "vpc_evidence=$vpc_evidence"
  exit 0
fi

for command in aws zip; do command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 78; }; done
caller_account="$(aws sts get-caller-identity --profile "$profile" --query Account --output text)"
if [[ "$caller_account" != "$account" ]]; then echo "AWS account mismatch" >&2; exit 78; fi
aws secretsmanager describe-secret --profile "$profile" --region "$region" --secret-id "$secret_name" >/dev/null
alarm_topic_arn=""
if [[ "$environment" == "prod" ]]; then
  alarm_topic_arn="$(aws cloudformation describe-stacks --profile "$profile" --region "$region" --stack-name byus-prod-platform --query 'Stacks[0]' --output json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).Outputs?.find(o=>o.OutputKey==="AlarmTopicArn")?.OutputValue;if(!/^arn:aws:sns:ap-northeast-2:996702758024:byus-prod-platform-AlarmTopic-[A-Za-z0-9]+$/.test(t??""))process.exit(78);process.stdout.write(t)})')"
fi

aws_() { aws --profile "$profile" --region "$region" "$@"; }
# Compares two JSON values after sorting object keys; strings holding JSON are decoded first.
json_same() { node -e 'const c=v=>{if(typeof v==="string"){try{v=JSON.parse(v)}catch{return v}}if(Array.isArray(v))return v.map(c);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,c(v[k])]));return v};process.exit(JSON.stringify(c(process.argv[1]))===JSON.stringify(c(process.argv[2]))?0:1)' "$1" "$2"; }
doc() { cat "${package_dir}/$1"; }

alarm_names=("${function_name}-sns-dlq-visible" "${function_name}-errors" "byus-ses-${environment}-bounce-rate" "byus-ses-${environment}-complaint-rate" "${function_name}-failed-visible")
put_alarms() {
  local common=(--evaluation-periods 1 --datapoints-to-alarm 1 --comparison-operator GreaterThanOrEqualToThreshold --alarm-actions "$alarm_topic_arn" --ok-actions "$alarm_topic_arn")
  aws_ cloudwatch put-metric-alarm --alarm-name "${alarm_names[0]}" --namespace AWS/SQS --metric-name ApproximateNumberOfMessagesVisible --dimensions "Name=QueueName,Value=${sns_dlq_name}" --statistic Maximum --period 300 --threshold 1 --treat-missing-data notBreaching "${common[@]}" >/dev/null
  aws_ cloudwatch put-metric-alarm --alarm-name "${alarm_names[4]}" --namespace AWS/SQS --metric-name ApproximateNumberOfMessagesVisible --dimensions "Name=QueueName,Value=${failed_name}" --statistic Maximum --period 300 --threshold 1 --treat-missing-data notBreaching "${common[@]}" >/dev/null
  aws_ cloudwatch put-metric-alarm --alarm-name "${alarm_names[1]}" --namespace AWS/Lambda --metric-name Errors --dimensions "Name=FunctionName,Value=${function_name}" --statistic Sum --period 300 --threshold 1 --treat-missing-data notBreaching "${common[@]}" >/dev/null
  # Account reputation is published only while mail is sent; a gap is not a signal.
  aws_ cloudwatch put-metric-alarm --alarm-name "${alarm_names[2]}" --namespace AWS/SES --metric-name Reputation.BounceRate --statistic Maximum --period 3600 --threshold 0.02 --treat-missing-data ignore "${common[@]}" >/dev/null
  aws_ cloudwatch put-metric-alarm --alarm-name "${alarm_names[3]}" --namespace AWS/SES --metric-name Reputation.ComplaintRate --statistic Maximum --period 3600 --threshold 0.001 --treat-missing-data ignore "${common[@]}" >/dev/null
}

if [[ "$mode" == "--check" ]]; then
  changes=0
  change() { echo "change $*"; changes=$((changes + 1)); }
  for pair in "${sns_dlq_name}:sns-dlq-attributes.json" "${failed_name}:failed-attributes.json"; do
    queue="${pair%%:*}"
    if queue_url="$(aws_ sqs get-queue-url --queue-name "$queue" --query QueueUrl --output text 2>/dev/null)"; then
      actual="$(aws_ sqs get-queue-attributes --queue-url "$queue_url" --attribute-names MessageRetentionPeriod SqsManagedSseEnabled Policy --query Attributes --output json)"
      json_same "$(doc "${pair#*:}")" "$actual" || change sqs-queue-attributes "$queue"
    else change create sqs-queue "$queue"; fi
  done
  if aws iam get-role --profile "$profile" --role-name "$role_name" >/dev/null 2>&1; then
    for pair in "secret-read:secret-policy.json" "vpc-eni:vpc-eni-policy.json" "failed-send:failed-send-policy.json"; do
      policy_name="${role_name}-${pair%%:*}"
      actual="$(aws iam get-role-policy --profile "$profile" --role-name "$role_name" --policy-name "$policy_name" --query PolicyDocument --output json 2>/dev/null || echo null)"
      json_same "$(doc "${pair#*:}")" "$actual" || change iam-role-policy "$policy_name"
    done
    if node -e 'if(!JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).replaceBroadVpcPolicy)process.exit(1)' "${package_dir}/vpc-evidence.json"; then change detach iam-managed-policy AWSLambdaVPCAccessExecutionRole; fi
  else change create iam-role "$role_name"; fi
  if actual="$(aws_ lambda get-function-configuration --function-name "$function_name" --output json 2>/dev/null)"; then
    lambda_changes="$(ACTUAL="$actual" CODE_SHA="$code_sha" ENV_DOC="$(doc lambda-environment.json)" node -e '
const a=JSON.parse(process.env.ACTUAL),want=JSON.parse(process.env.ENV_DOC).Variables,have=a.Environment?.Variables??{};
const sorted=v=>JSON.stringify(Object.keys(v).sort().map(k=>[k,v[k]]));
if(a.CodeSha256!==process.env.CODE_SHA)console.log("lambda-code");
if(a.Runtime!=="nodejs24.x"||a.Handler!=="index.handler"||a.Timeout!==30||a.MemorySize!==256||sorted(have)!==sorted(want))console.log("lambda-configuration");')"
    for kind in $lambda_changes; do change "$kind" "$function_name"; done
    actual="$(aws_ lambda get-function-event-invoke-config --function-name "$function_name" --output json 2>/dev/null || echo '{}')"
    ACTUAL="$actual" FAILED_ARN="$failed_arn" node -e 'const a=JSON.parse(process.env.ACTUAL);process.exit(a.MaximumRetryAttempts===2&&a.MaximumEventAgeInSeconds===21600&&a.DestinationConfig?.OnFailure?.Destination===process.env.FAILED_ARN?0:1)' || change lambda-async-config "$function_name"
    concurrency="$(aws_ lambda get-function-concurrency --function-name "$function_name" --query ReservedConcurrentExecutions --output text 2>/dev/null || echo none)"
    [[ "$concurrency" == "2" ]] || change lambda-concurrency "$function_name"
    policy="$(aws_ lambda get-policy --function-name "$function_name" --query Policy --output text 2>/dev/null || true)"
    [[ "$policy" == *"$statement_id"* ]] || change create lambda-permission "$statement_id"
  else change create lambda "$function_name"; fi
  if actual="$(aws_ sns get-topic-attributes --topic-arn "$topic_arn" --query Attributes.Policy --output text 2>/dev/null)"; then
    json_same "$(doc topic-policy.json)" "$actual" || change sns-topic-policy "$topic_name"
    subscription="$(aws_ sns list-subscriptions-by-topic --topic-arn "$topic_arn" --query "Subscriptions[?Protocol=='lambda' && Endpoint=='arn:aws:lambda:${region}:${account}:function:${function_name}'].SubscriptionArn | [0]" --output text)"
    if [[ "$subscription" == arn:aws:sns:* ]]; then
      actual="$(aws_ sns get-subscription-attributes --subscription-arn "$subscription" --query Attributes.RedrivePolicy --output text 2>/dev/null || echo null)"
      json_same "$(doc redrive-policy.json)" "$actual" || change sns-subscription-redrive "$topic_name"
    else change create sns-subscription "$topic_name"; fi
  else change create sns-topic "$topic_name"; fi
  if aws_ sesv2 get-configuration-set --configuration-set-name "$config_set" >/dev/null 2>&1; then
    actual="$(aws_ sesv2 get-configuration-set-event-destinations --configuration-set-name "$config_set" --query "EventDestinations[?Name=='${destination_name}'] | [0]" --output json)"
    if [[ "$actual" == "null" ]]; then change create ses-event-destination "$destination_name"; else
      ACTUAL="$actual" DOC="$(doc event-destination.json)" node -e 'const a=JSON.parse(process.env.ACTUAL),d=JSON.parse(process.env.DOC);process.exit(a.Enabled===true&&JSON.stringify([...a.MatchingEventTypes].sort())===JSON.stringify(d.MatchingEventTypes)&&a.SnsDestination?.TopicArn===d.SnsDestination.TopicArn&&!a.EventBridgeDestination&&!a.CloudWatchDestination&&!a.KinesisFirehoseDestination&&!a.PinpointDestination?0:1)' || change ses-event-destination "$destination_name"
    fi
  else change create ses-configuration-set "$config_set"; change create ses-event-destination "$destination_name"; fi
  if [[ "$environment" == "prod" ]]; then
    existing="$(aws_ cloudwatch describe-alarms --alarm-names "${alarm_names[@]}" --query 'MetricAlarms[].{n:AlarmName,t:Threshold,a:AlarmActions}' --output json)"
    for name in "${alarm_names[@]}"; do
      EXISTING="$existing" NAME="$name" TOPIC="$alarm_topic_arn" node -e 'const a=JSON.parse(process.env.EXISTING).find(x=>x.n===process.env.NAME);process.exit(a&&JSON.stringify(a.a)===JSON.stringify([process.env.TOPIC])?0:1)' || change cloudwatch-alarm "$name"
    done
  fi
  echo "checked ses feedback deployment: environment=${environment} changes=${changes}"
  exit 0
fi

# Apply. Order: failure queues -> role -> function -> topic -> subscription ->
# configuration set -> event destination, so SES never publishes to a topic
# that has no consumer and the consumer never runs without its failure queue.
for pair in "${sns_dlq_name}:sns-dlq-attributes.json" "${failed_name}:failed-attributes.json"; do
  queue_url="$(aws_ sqs create-queue --queue-name "${pair%%:*}" --query QueueUrl --output text)"
  aws_ sqs set-queue-attributes --queue-url "$queue_url" --attributes "file://${package_dir}/${pair#*:}"
done

if ! aws iam get-role --profile "$profile" --role-name "$role_name" >/dev/null 2>&1; then
  aws iam create-role --profile "$profile" --role-name "$role_name" --assume-role-policy-document "file://${trust_policy}" >/dev/null
fi
aws iam attach-role-policy --profile "$profile" --role-name "$role_name" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam put-role-policy --profile "$profile" --role-name "$role_name" --policy-name "${role_name}-secret-read" --policy-document "file://${package_dir}/secret-policy.json"
aws iam put-role-policy --profile "$profile" --role-name "$role_name" --policy-name "${role_name}-vpc-eni" --policy-document "file://${package_dir}/vpc-eni-policy.json"
aws iam put-role-policy --profile "$profile" --role-name "$role_name" --policy-name "${role_name}-failed-send" --policy-document "file://${package_dir}/failed-send-policy.json"
if node -e 'if(!JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).replaceBroadVpcPolicy)process.exit(1)' "${package_dir}/vpc-evidence.json"; then
  aws iam detach-role-policy --profile "$profile" --role-name "$role_name" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
fi
aws iam wait role-exists --profile "$profile" --role-name "$role_name"
role_arn="$(aws iam get-role --profile "$profile" --role-name "$role_name" --query 'Role.Arn' --output text)"

create_feedback_lambda() {
  local attempt=1
  local max_attempts=12
  local retry_delay_seconds=5
  local error_file="${package_dir}/create-function-error.txt"
  while (( attempt <= max_attempts )); do
    if aws_ lambda create-function --function-name "$function_name" --runtime nodejs24.x --architectures arm64 --role "$role_arn" --handler index.handler --zip-file "fileb://${package_file}" --timeout 30 --memory-size 256 --vpc-config "$vpc_config" --environment "file://${package_dir}/lambda-environment.json" >/dev/null 2>"$error_file"; then
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
if aws_ lambda get-function --function-name "$function_name" >/dev/null 2>&1; then
  aws_ lambda update-function-code --function-name "$function_name" --zip-file "fileb://${package_file}" >/dev/null
  aws_ lambda wait function-updated-v2 --function-name "$function_name"
  aws_ lambda update-function-configuration --function-name "$function_name" --runtime nodejs24.x --handler index.handler --timeout 30 --memory-size 256 --role "$role_arn" --vpc-config "$vpc_config" --environment "file://${package_dir}/lambda-environment.json" >/dev/null
  aws_ lambda wait function-updated-v2 --function-name "$function_name"
else
  create_feedback_lambda
fi
aws_ lambda wait function-active-v2 --function-name "$function_name"
# Two concurrent invocations bound database load; throttled events are retried by Lambda.
aws_ lambda put-function-concurrency --function-name "$function_name" --reserved-concurrent-executions 2 >/dev/null
# SNS invokes Lambda asynchronously, so function errors are retried by Lambda
# (not SNS): 2 retries, events kept up to 6 hours, then the "failed" queue.
aws_ lambda put-function-event-invoke-config --function-name "$function_name" --maximum-retry-attempts 2 --maximum-event-age-in-seconds 21600 --destination-config "file://${package_dir}/async-destination.json" >/dev/null
function_arn="$(aws_ lambda get-function-configuration --function-name "$function_name" --query FunctionArn --output text)"

created_topic_arn="$(aws_ sns create-topic --name "$topic_name" --query TopicArn --output text)"
if [[ "$created_topic_arn" != "$topic_arn" ]]; then echo "SNS topic ARN mismatch" >&2; exit 78; fi
aws_ sns set-topic-attributes --topic-arn "$topic_arn" --attribute-name Policy --attribute-value "$(doc topic-policy.json)"
policy=""
if aws_ lambda get-policy --function-name "$function_name" --query Policy --output text >"${package_dir}/lambda-policy.txt" 2>/dev/null; then policy="$(<"${package_dir}/lambda-policy.txt")"; fi
if [[ "$policy" != *"${statement_id}"* ]]; then
  aws_ lambda add-permission --function-name "$function_name" --statement-id "$statement_id" --action lambda:InvokeFunction --principal sns.amazonaws.com --source-arn "$topic_arn" --source-account "$account" >/dev/null
fi
subscription="$(aws_ sns list-subscriptions-by-topic --topic-arn "$topic_arn" --query "Subscriptions[?Protocol=='lambda' && Endpoint=='${function_arn}'].SubscriptionArn | [0]" --output text)"
if [[ "$subscription" == arn:aws:sns:* ]]; then
  aws_ sns set-subscription-attributes --subscription-arn "$subscription" --attribute-name RedrivePolicy --attribute-value "$(doc redrive-policy.json)"
else
  aws_ sns subscribe --topic-arn "$topic_arn" --protocol lambda --notification-endpoint "$function_arn" --attributes "RedrivePolicy=$(doc redrive-policy.json)" --return-subscription-arn >/dev/null
fi

# Reputation metrics stay account-level; suppression stays on the account list.
if ! aws_ sesv2 get-configuration-set --configuration-set-name "$config_set" >/dev/null 2>&1; then
  aws_ sesv2 create-configuration-set --configuration-set-name "$config_set" --sending-options SendingEnabled=true
fi
existing_destination="$(aws_ sesv2 get-configuration-set-event-destinations --configuration-set-name "$config_set" --query "EventDestinations[?Name=='${destination_name}'].Name | [0]" --output text)"
if [[ "$existing_destination" == "$destination_name" ]]; then
  aws_ sesv2 update-configuration-set-event-destination --configuration-set-name "$config_set" --event-destination-name "$destination_name" --event-destination "file://${package_dir}/event-destination.json"
else
  aws_ sesv2 create-configuration-set-event-destination --configuration-set-name "$config_set" --event-destination-name "$destination_name" --event-destination "file://${package_dir}/event-destination.json"
fi

if [[ "$environment" == "prod" ]]; then put_alarms; fi

aws_ lambda get-function-configuration --function-name "$function_name" --query '{FunctionName:FunctionName,Role:Role,Runtime:Runtime,State:State,Environment:Environment.Variables.SES_FEEDBACK_ENVIRONMENT}'
aws_ sesv2 get-configuration-set-event-destinations --configuration-set-name "$config_set" --query 'EventDestinations[].{Name:Name,Enabled:Enabled,Types:MatchingEventTypes,Topic:SnsDestination.TopicArn}'
