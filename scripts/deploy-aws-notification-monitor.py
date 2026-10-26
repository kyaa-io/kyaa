"""Render by default; --deploy installs operator monitoring in the fixed prod account."""
import argparse
import json
import pathlib
import re
import subprocess
import datetime
import tempfile
from functools import partial
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
ACCOUNT = "996702758024"
REGION = "ap-northeast-2"
STACK = "byus-prod-notification-monitor"
CHANNELS = ("Email", "BusinessInquiry", "Kakao", "TelegramAlerts", "TelegramCommands", "TelegramCertifications")


def run_aws(profile, *parts, payload=None):
    command = ["aws", *parts, "--profile", profile, "--region", REGION, "--output", "json"]
    if payload is None:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    else:
        # AWS CLI may consume stdin before file expansion; use an auto-deleted 0600 file.
        with tempfile.NamedTemporaryFile(mode="w", prefix="byus-monitor-", suffix=".json") as input_file:
            json.dump(payload, input_file)
            input_file.flush()
            result = subprocess.run([*command, "--cli-input-json", "file://" + input_file.name], capture_output=True, text=True, check=False)
    if result.returncode:
        # Never include CLI stderr: rejected secret inputs can contain credentials.
        raise RuntimeError("AWS operation failed: " + " ".join(parts[:2]))
    return json.loads(result.stdout) if result.stdout.strip() else {}


def connect_alarms(aws, topic):
    names = [f"byus-notification-worker-prod-{channel}-disabled" for channel in CHANNELS]
    alarms = aws("cloudwatch", "describe-alarms", "--alarm-names", *names)["MetricAlarms"]
    if {alarm["AlarmName"] for alarm in alarms} != set(names):
        raise RuntimeError("all six production alarms must exist")
    supported = set(aws("cloudwatch", "put-metric-alarm", "--generate-cli-skeleton", "input"))
    for alarm in alarms:
        updated = {key: value for key, value in alarm.items() if key in supported}
        updated["ActionsEnabled"] = True
        for field in ("AlarmActions", "OKActions", "InsufficientDataActions"):
            updated[field] = list(dict.fromkeys([*updated.get(field, []), topic]))
        aws("cloudwatch", "put-metric-alarm", payload=updated)


def auto_delete_followup(aws):
    # CloudFormation does not expose Scheduler ActionAfterCompletion yet.
    if datetime.datetime.now(datetime.timezone.utc) >= datetime.datetime(2026, 10, 27, 12, tzinfo=datetime.timezone.utc):
        return
    current = aws("scheduler", "get-schedule", "--group-name", "byus-prod", "--name", "byus-prod-ses-followup-20261027")
    supported = set(aws("scheduler", "update-schedule", "--generate-cli-skeleton", "input"))
    updated = {key: value for key, value in current.items() if key in supported}
    updated["ActionAfterCompletion"] = "DELETE"
    aws("scheduler", "update-schedule", payload=updated)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument("--deploy", action="store_true")
    args = parser.parse_args()

    aws = partial(run_aws, args.profile)

    if aws("sts", "get-caller-identity")["Account"] != ACCOUNT:
        raise RuntimeError("production AWS account mismatch")
    stack = aws("cloudformation", "describe-stacks", "--stack-name", "byus-prod-platform")["Stacks"][0]
    topic = next(row["OutputValue"] for row in stack["Outputs"] if row["OutputKey"] == "AlarmTopicArn")
    if not re.fullmatch(f"arn:aws:sns:{REGION}:{ACCOUNT}:byus-prod-platform-AlarmTopic-[A-Za-z0-9]+", topic):
        raise RuntimeError("unexpected production alarm topic")
    if aws("sns", "get-topic-attributes", "--topic-arn", topic)["Attributes"]["Owner"] != ACCOUNT:
        raise RuntimeError("production alarm topic owner mismatch")
    source = json.loads(aws("secretsmanager", "get-secret-value", "--secret-id", "byus/notification/prod")["SecretString"])
    secret = {key: source[key] for key in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID")}
    try:
        request = urllib.request.Request("https://api.telegram.org/bot" + secret["TELEGRAM_BOT_TOKEN"] + "/getChat", data=json.dumps({"chat_id": secret["TELEGRAM_CHAT_ID"]}).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=15) as response:
            chat = json.load(response)
        if chat.get("ok") is not True or chat["result"].get("title") != "KYAA-ALERT" or chat["result"].get("type") not in ("supergroup", "group"):
            raise ValueError("unexpected chat")
    except Exception:
        raise RuntimeError("existing KYAA-ALERT recipient verification failed") from None

    secret_arn = f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:byus/monitor/prod-PENDING"
    if args.deploy:
        existing = aws("secretsmanager", "list-secrets", "--filters", "Key=name,Values=byus/monitor/prod")["SecretList"]
        existing = [item for item in existing if item["Name"] == "byus/monitor/prod"]
        if existing:
            secret_arn = existing[0]["ARN"]
            current = json.loads(aws("secretsmanager", "get-secret-value", "--secret-id", secret_arn)["SecretString"])
            if set(current) != set(secret):
                raise RuntimeError("monitor secret has unexpected fields; preserve it")
            if current != secret:
                aws("secretsmanager", "put-secret-value", payload={"SecretId": secret_arn, "SecretString": json.dumps(secret)})
        else:
            secret_arn = aws("secretsmanager", "create-secret", payload={"Name": "byus/monitor/prod", "Description": "Existing KYAA-ALERT Telegram credentials only; no database/provider access", "SecretString": json.dumps(secret)})["ARN"]

    template = json.loads((ROOT / "infrastructure/aws/worker/notification-monitor.json").read_text())
    template["Resources"]["Monitor"]["Properties"]["Code"]["ZipFile"] = (ROOT / "infrastructure/aws/worker/notification-monitor.py").read_text()
    args.out.mkdir(parents=True, exist_ok=True)
    rendered = args.out / "notification-monitor-rendered.json"
    rendered.write_text(json.dumps(template, indent=2))
    parameters = [f"MonitorSecretArn={secret_arn}", f"AlarmTopicArn={topic}", f"ExpectedChatId={secret['TELEGRAM_CHAT_ID']}"]
    if args.deploy:
        subprocess.run(["aws", "cloudformation", "deploy", "--profile", args.profile, "--region", REGION, "--stack-name", STACK, "--template-file", str(rendered), "--parameter-overrides", *parameters, "--capabilities", "CAPABILITY_IAM", "--no-fail-on-empty-changeset"], check=True)
        connect_alarms(aws, topic)
        auto_delete_followup(aws)
    print(json.dumps({"mutation": "deployed" if args.deploy else "none", "stack": STACK, "recipientVerified": "KYAA-ALERT", "template": str(rendered), "followup": "2026-10-27T21:00:00+09:00"}))


if __name__ == "__main__":
    main()
