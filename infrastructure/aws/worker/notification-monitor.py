"""Production operator notices only; never sends or retries member deliveries."""
import base64
import gzip
import json
import os
import re
import time
import urllib.request

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

ACCOUNT = "996702758024"
REGION = "ap-northeast-2"
LOG_GROUP = "/aws/lambda/byus-notification-worker-prod"
CHANNELS = ("Email", "BusinessInquiry", "Kakao", "TelegramAlerts", "TelegramCommands", "TelegramCertifications")
ALARMS = {f"byus-notification-worker-prod-{channel}-disabled" for channel in CHANNELS}
ALARMS.add("byus-notification-worker-prod-monitor-test")
OUTCOMES = {"email": {"accepted", "unknown"}, "kakao": {"accepted", "delivered", "failed", "unknown"}}


def client(service):
    return boto3.client(service, region_name=REGION, config=Config(retries={"total_max_attempts": 1}, connect_timeout=3, read_timeout=10))


def parse_log(message):
    if not isinstance(message, str):
        return {}
    try:
        value = json.loads(message[message.index("{"):])
        return value if isinstance(value, dict) else {}
    except (ValueError, TypeError):
        return {}


def notify(key, text):
    secret = json.loads(client("secretsmanager").get_secret_value(SecretId=os.environ["SECRET_ARN"])["SecretString"])
    token, chat = secret.get("TELEGRAM_BOT_TOKEN", ""), str(secret.get("TELEGRAM_CHAT_ID", ""))
    if not re.fullmatch(r"\d{6,12}:[A-Za-z0-9_-]{20,100}", token) or chat != os.environ["EXPECTED_CHAT_ID"]:
        raise RuntimeError("MONITOR_TELEGRAM_CONFIG_INVALID")
    table = client("dynamodb")
    record = {"id": {"S": key}, "status": {"S": "attempted"}}
    if key.startswith("alarm:"):
        record["expiresAt"] = {"N": str(int(time.time()) + 90 * 86400)}
    try:
        table.put_item(TableName=os.environ["TABLE_NAME"], Item=record, ConditionExpression="attribute_not_exists(id)")
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return {"status": "duplicate"}
        raise
    # Claim before POST: an uncertain Telegram response must never cause a repeat.
    try:
        request = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=json.dumps({"chat_id": chat, "text": text, "link_preview_options": {"is_disabled": True}}).encode(),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            result = json.load(response)
        message = result.get("result", {})
        if result.get("ok") is not True or str(message.get("chat", {}).get("id")) != chat or not isinstance(message.get("message_id"), int):
            raise ValueError("invalid receipt")
    except Exception:
        table.update_item(TableName=os.environ["TABLE_NAME"], Key={"id": {"S": key}}, UpdateExpression="SET #s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": {"S": "unknown"}})
        raise RuntimeError("MONITOR_SEND_OUTCOME_UNKNOWN_DO_NOT_RESEND") from None
    table.update_item(TableName=os.environ["TABLE_NAME"], Key={"id": {"S": key}}, UpdateExpression="SET #s = :s, messageId = :m", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": {"S": "sent"}, ":m": {"N": str(message["message_id"])}})
    receipt = {"event": "worker_monitor_notice", "key": key, "status": "sent", "messageId": message["message_id"]}
    print(json.dumps(receipt))
    return receipt


def delivery(value):
    channel, outcome = value.get("channel"), value.get("outcome")
    if not isinstance(channel, str) or not isinstance(outcome, str) or value.get("event") != "notification_delivery" or outcome not in OUTCOMES.get(channel, set()):
        return None
    return channel, outcome


def handle_logs(event):
    data = json.loads(gzip.decompress(base64.b64decode(event["awslogs"]["data"])))
    if data.get("owner") != ACCOUNT or data.get("logGroup") != LOG_GROUP or data.get("messageType") != "DATA_MESSAGE":
        return []
    results = []
    for record in data.get("logEvents", []):
        value = parse_log(record.get("message", ""))
        if value.get("event") == "ses_account_selected" and value.get("account") == "primary" and value.get("reason") == "primary_ready":
            results.append(notify("ses-primary-ready", "[KYAA 운영] 신규 AWS SES 승인·발송 설정·도메인 인증을 확인했고, 알림 작업이 신규 계정을 선택했습니다. 실제 메일 수신 완료를 뜻하지는 않습니다."))
        result = delivery(value)
        if result:
            channel, outcome = result
            # One notice per observed milestone; routine sends never flood the room.
            label = {"accepted": "제공자 발송 접수", "delivered": "제공자 전달 완료", "failed": "제공자 전달 실패", "unknown": "발송 결과 불명확"}[outcome]
            results.append(notify(f"first-delivery:{channel}:{outcome}", f"[KYAA 운영] 감시 시작 후 첫 {'이메일' if channel == 'email' else '카카오'} {label} 기록을 확인했습니다. 회원 정보는 포함하지 않습니다."))
    return results


def scheduled_check():
    ses = client("sesv2")
    account = ses.get_account()
    identity = ses.get_email_identity(EmailIdentity="kyaa.io")
    ready = bool(account.get("ProductionAccessEnabled") and account.get("SendingEnabled") and identity.get("VerifiedForSendingStatus"))
    counts = {channel: {outcome: 0 for outcome in outcomes} for channel, outcomes in OUTCOMES.items()}
    logs = client("logs")
    query = {"logGroupName": LOG_GROUP, "startTime": int((time.time() - 86400) * 1000), "filterPattern": '"notification_delivery"'}
    while True:
        page = logs.filter_log_events(**query)
        for record in page.get("events", []):
            result = delivery(parse_log(record.get("message", "")))
            if result:
                channel, outcome = result
                counts[channel][outcome] += 1
        if not page.get("nextToken") or page["nextToken"] == query.get("nextToken"):
            break
        query["nextToken"] = page["nextToken"]
    text = "[KYAA 운영 · 예약 확인]\n신규 SES: " + ("승인 및 발송 준비 완료" if ready else "아직 전환 조건 미충족 · 기존 SES 유지")
    text += f"\n최근 24시간 기록: 이메일 접수 {counts['email']['accepted']}건, 결과 불명확 {counts['email']['unknown']}건."
    text += f"\n카카오 접수 {counts['kakao']['accepted']}건, 전달 완료 {counts['kakao']['delivered']}건, 실패 {counts['kakao']['failed']}건, 결과 불명확 {counts['kakao']['unknown']}건."
    text += "\n접수와 실제 수신은 다릅니다. 0건은 해당 기록이 없다는 뜻이며 시험 발송은 하지 않았습니다. AWS 지원 사례의 답변 여부는 별도 확인이 필요합니다."
    return notify("check:ses-2026-10-27", text)


def handler(event, _context):
    if "awslogs" in event:
        return handle_logs(event)
    if event == {"source": "byus.worker-health-check", "checkId": "ses-2026-10-27"}:
        return scheduled_check()
    results = []
    for record in event.get("Records", []):
        sns = record.get("Sns", {})
        if record.get("EventSource") != "aws:sns" or sns.get("TopicArn") != os.environ["TOPIC_ARN"]:
            continue
        alarm = json.loads(sns.get("Message", "{}"))
        name, state = alarm.get("AlarmName"), alarm.get("NewStateValue")
        changed_at = alarm.get("StateChangeTime", "")
        if not isinstance(name, str) or not isinstance(state, str) or name not in ALARMS or alarm.get("AWSAccountId") != ACCOUNT or alarm.get("AlarmArn") != f"arn:aws:cloudwatch:{REGION}:{ACCOUNT}:alarm:{name}" or state not in {"ALARM", "OK", "INSUFFICIENT_DATA"} or not isinstance(changed_at, str) or not re.fullmatch(r"[0-9TZ:.+\-]{20,40}", changed_at):
            continue
        title = "[KYAA 운영 · 경보 전달 시험]" if name.endswith("monitor-test") else "[KYAA 운영 · 알림 채널 경보]"
        description = {"ALARM": "채널 비활성 감지", "OK": "정상 상태 복귀", "INSUFFICIENT_DATA": "상태 지표 수신 중단"}[state]
        results.append(notify(f"alarm:{name}:{changed_at}:{state}", f"{title}\n{name}\n{description}\n회원 발송 설정은 변경하지 않았습니다."))
    return results
