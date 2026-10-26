import base64
import datetime
import gzip
import importlib.util
import io
import json
import os
import pathlib
import sys
import types
import unittest
from unittest.mock import Mock, patch

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ClientError(Exception):
    def __init__(self, code):
        self.response = {"Error": {"Code": code}}


# Tests use fake clients only; Python Lambda supplies boto3 in production.
sys.modules["boto3"] = types.SimpleNamespace(client=Mock())
sys.modules["botocore"] = types.ModuleType("botocore")
sys.modules["botocore.config"] = types.SimpleNamespace(Config=Mock())
sys.modules["botocore.exceptions"] = types.SimpleNamespace(ClientError=ClientError)


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


monitor = load("monitor", "infrastructure/aws/worker/notification-monitor.py")
deploy = load("deploy", "scripts/deploy-aws-notification-monitor.py")


class MonitorTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"SECRET_ARN": "monitor-secret", "EXPECTED_CHAT_ID": "-100123456789", "TABLE_NAME": "receipts", "TOPIC_ARN": "prod-topic"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def alarm(self, **fields):
        name = "byus-notification-worker-prod-Email-disabled"
        alarm = {"AlarmName": name, "AWSAccountId": monitor.ACCOUNT, "AlarmArn": f"arn:aws:cloudwatch:{monitor.REGION}:{monitor.ACCOUNT}:alarm:{name}", "NewStateValue": "ALARM", "StateChangeTime": "2026-10-26T14:00:00.000+0000", **fields}
        return {"Records": [{"EventSource": "aws:sns", "Sns": {"TopicArn": "prod-topic", "MessageId": "first-id", "Message": json.dumps(alarm)}}]}

    def logs(self, messages, **fields):
        data = {"owner": monitor.ACCOUNT, "logGroup": monitor.LOG_GROUP, "messageType": "DATA_MESSAGE", "logEvents": [{"message": message} for message in messages], **fields}
        return {"awslogs": {"data": base64.b64encode(gzip.compress(json.dumps(data).encode())).decode()}}

    def test_alarm_occurrence_dedupe_preserves_later_recurrence(self):
        with patch.object(monitor, "notify") as notify:
            monitor.handler(self.alarm(), None)
            monitor.handler(self.alarm(), None)
            monitor.handler(self.alarm(StateChangeTime="2026-10-26T15:00:00.000+0000"), None)
        self.assertEqual(notify.call_args_list[0].args[0], notify.call_args_list[1].args[0])
        self.assertNotEqual(notify.call_args_list[0].args[0], notify.call_args_list[2].args[0])

    def test_other_accounts_regions_alarms_states_do_not_send(self):
        with patch.object(monitor, "notify") as notify:
            for fields in ({"AWSAccountId": "200151116034"}, {"AlarmArn": "arn:aws:cloudwatch:us-east-1:wrong"}, {"AlarmName": "other"}, {"NewStateValue": "anything"}, {"StateChangeTime": ""}):
                monitor.handler(self.alarm(**fields), None)
            event = self.alarm()
            event["Records"][0]["Sns"]["TopicArn"] = "other-topic"
            monitor.handler(event, None)
        notify.assert_not_called()

    def test_text_prefix_delivery_is_sanitized_and_milestones_differ(self):
        messages = ['2026-10-26T14:00:00Z\trequest-id\tINFO\t' + json.dumps({"event": "notification_delivery", "channel": "kakao", "outcome": outcome, "destination": "PRIVATE"}) for outcome in ("accepted", "delivered", "unknown")]
        with patch.object(monitor, "notify") as notify:
            monitor.handler(self.logs(messages), None)
        self.assertEqual([call.args[0] for call in notify.call_args_list], ["first-delivery:kakao:" + outcome for outcome in ("accepted", "delivered", "unknown")])
        self.assertNotIn("PRIVATE", str(notify.call_args_list))
        self.assertIn("발송 접수", notify.call_args_list[0].args[1])
        self.assertIn("전달 완료", notify.call_args_list[1].args[1])

    def test_legacy_account_and_control_messages_never_claim_native_switch(self):
        messages = [json.dumps({"event": "ses_account_selected", "account": "legacy", "reason": "primary_not_ready"}), "garbage"]
        with patch.object(monitor, "notify") as notify:
            monitor.handler(self.logs(messages), None)
            monitor.handler(self.logs(messages, messageType="CONTROL_MESSAGE"), None)
            monitor.handler(self.logs(messages, owner="other"), None)
            monitor.handler(self.logs(messages, logGroup="other"), None)
        notify.assert_not_called()
        with patch.object(monitor, "notify") as notify:
            monitor.handler(self.logs([json.dumps({"event": "ses_account_selected", "account": "primary", "reason": "primary_ready"})]), None)
        self.assertEqual(notify.call_args.args[0], "ses-primary-ready")

    def test_one_unknown_notice_does_not_drop_other_channel_records(self):
        messages = [json.dumps({"event": "notification_delivery", "channel": channel, "outcome": outcome}) for channel, outcome in (("email", "accepted"), ("kakao", "delivered"))]
        with patch.object(monitor, "notify", side_effect=[RuntimeError("unknown"), {"status": "sent"}]) as notify:
            with self.assertRaisesRegex(RuntimeError, "MONITOR_ONE_OR_MORE_NOTICES_FAILED"):
                monitor.handler(self.logs(messages), None)
        self.assertEqual([call.args[0] for call in notify.call_args_list], ["first-delivery:email:accepted", "first-delivery:kakao:delivered"])

    def clients(self):
        secret = Mock()
        secret.get_secret_value.return_value = {"SecretString": json.dumps({"TELEGRAM_BOT_TOKEN": "123456:" + "A" * 32, "TELEGRAM_CHAT_ID": "-100123456789"})}
        table = Mock()
        clients = {"secretsmanager": secret, "dynamodb": table}
        return table, patch.object(monitor, "client", side_effect=lambda name: clients[name])

    def test_telegram_timeout_persists_unknown_and_duplicate_never_posts(self):
        table, clients = self.clients()
        with clients, patch.object(monitor.urllib.request, "urlopen", side_effect=TimeoutError("DO_NOT_LOG_TOKEN")) as post:
            with self.assertRaisesRegex(RuntimeError, "MONITOR_SEND_OUTCOME_UNKNOWN_DO_NOT_RESEND"):
                monitor.notify("first-delivery:email:accepted", "safe")
            table.put_item.assert_called_once()
            self.assertEqual(table.update_item.call_args.kwargs["ExpressionAttributeValues"][":s"]["S"], "unknown")
            table.put_item.side_effect = ClientError("ConditionalCheckFailedException")
            self.assertEqual(monitor.notify("first-delivery:email:accepted", "safe"), {"status": "duplicate"})
            post.assert_called_once()

    def test_telegram_receipt_is_persisted_after_durable_claim(self):
        table, clients = self.clients()
        result = io.BytesIO(json.dumps({"ok": True, "result": {"message_id": 123, "chat": {"id": -100123456789}}}).encode())
        with clients, patch.object(monitor.urllib.request, "urlopen", return_value=result) as post:
            receipt = monitor.notify("alarm:valid", "safe")
        self.assertEqual(receipt["messageId"], 123)
        self.assertEqual(table.put_item.call_args.kwargs["ConditionExpression"], "attribute_not_exists(id)")
        self.assertEqual(table.update_item.call_args.kwargs["ExpressionAttributeValues"][":s"]["S"], "sent")
        self.assertEqual(json.loads(post.call_args.args[0].data)["text"], "safe")

    def test_recipient_change_fails_before_claim_or_post(self):
        table, clients = self.clients()
        with clients, patch.dict(os.environ, {"EXPECTED_CHAT_ID": "other"}), patch.object(monitor.urllib.request, "urlopen") as post:
            with self.assertRaisesRegex(RuntimeError, "CONFIG_INVALID"):
                monitor.notify("key", "safe")
        table.put_item.assert_not_called()
        post.assert_not_called()

    def test_scheduled_check_paginates_and_never_calls_member_senders(self):
        ses, logs = Mock(), Mock()
        ses.get_account.return_value = {"ProductionAccessEnabled": False, "SendingEnabled": True}
        ses.get_email_identity.return_value = {"VerifiedForSendingStatus": True}
        logs.filter_log_events.side_effect = [{"events": [{"message": '{"event":"notification_delivery","channel":"email","outcome":"accepted","destination":"PRIVATE"}'}], "nextToken": "second"}, {"events": []}]
        with patch.object(monitor, "client", side_effect=lambda name: {"sesv2": ses, "logs": logs}[name]), patch.object(monitor, "notify") as notify:
            monitor.handler({"source": "byus.worker-health-check", "checkId": "ses-2026-10-27"}, None)
        self.assertEqual(logs.filter_log_events.call_count, 2)
        self.assertIn("이메일 접수 1건", notify.call_args.args[1])
        self.assertIn("전환 조건 미충족", notify.call_args.args[1])
        self.assertNotIn("PRIVATE", notify.call_args.args[1])
        self.assertEqual(ses.mock_calls, [unittest.mock.call.get_account(), unittest.mock.call.get_email_identity(EmailIdentity="kyaa.io")])

    def test_diagnostic_failures_report_unverified_instead_of_silence_or_zero(self):
        for failed_service in ("sesv2", "logs"):
            with self.subTest(service=failed_service):
                ses, logs = Mock(), Mock()
                ses.get_account.return_value = {"ProductionAccessEnabled": True, "SendingEnabled": True}
                ses.get_email_identity.return_value = {"VerifiedForSendingStatus": True}
                logs.filter_log_events.return_value = {"events": []}
                (ses.get_account if failed_service == "sesv2" else logs.filter_log_events).side_effect = RuntimeError("PRIVATE_EXCEPTION")
                with patch.object(monitor, "client", side_effect=lambda name: {"sesv2": ses, "logs": logs}[name]), patch.object(monitor, "notify") as notify:
                    monitor.scheduled_check()
                notify.assert_called_once()
                self.assertIn("조회 실패", notify.call_args.args[1])
                self.assertIn("판정 보류", notify.call_args.args[1])
                self.assertNotIn("PRIVATE_EXCEPTION", notify.call_args.args[1])
                if failed_service == "logs":
                    self.assertNotIn("접수 0건", notify.call_args.args[1])

    def test_alarm_update_keeps_existing_settings_and_actions(self):
        alarms = [{"AlarmName": f"byus-notification-worker-prod-{channel}-disabled", "Namespace": "ByUs/Notifications", "Period": 300, "Threshold": 1, "AlarmActions": ["existing"], "StateValue": "OK"} for channel in deploy.CHANNELS]
        aws = Mock(side_effect=[{"MetricAlarms": alarms}, {key: "" for key in ("AlarmName", "Namespace", "Period", "Threshold", "AlarmActions", "OKActions", "InsufficientDataActions", "ActionsEnabled")}, *[{} for _ in alarms]])
        deploy.connect_alarms(aws, "topic")
        writes = [call.kwargs["payload"] for call in aws.call_args_list if call.kwargs]
        self.assertEqual(len(writes), 6)
        self.assertTrue(all(write["AlarmActions"] == ["existing", "topic"] and write["Threshold"] == 1 and "StateValue" not in write for write in writes))

    def test_cli_payload_uses_private_temporary_file_and_never_argv_or_error_text(self):
        files = []
        def fake_run(command, **_kwargs):
            file = pathlib.Path(command[command.index("--cli-input-json") + 1].removeprefix("file://"))
            files.append(file)
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(file.read_text()), {"SecretString": "PRIVATE"})
            self.assertNotIn("PRIVATE", " ".join(command))
            return types.SimpleNamespace(returncode=1, stdout="", stderr="PRIVATE must never be printed")
        with patch.object(deploy.subprocess, "run", side_effect=fake_run):
            with self.assertRaisesRegex(RuntimeError, "^AWS operation failed: secretsmanager create-secret$"):
                deploy.run_aws("profile", "secretsmanager", "create-secret", payload={"SecretString": "PRIVATE"})
        self.assertTrue(all(not file.exists() for file in files))

    def test_infrastructure_has_no_member_credentials_or_send_permissions(self):
        template = json.loads((ROOT / "infrastructure/aws/worker/notification-monitor.json").read_text())
        resources = template["Resources"]
        statements = resources["Role"]["Properties"]["Policies"][0]["PolicyDocument"]["Statement"]
        self.assertEqual(next(s for s in statements if s["Action"] == "secretsmanager:GetSecretValue")["Resource"], {"Ref": "MonitorSecretArn"})
        actions = json.dumps([s["Action"] for s in statements])
        self.assertNotIn("SendEmail", actions)
        self.assertNotIn("AssumeRole", actions)
        self.assertNotIn("VPC", actions)
        self.assertEqual(resources["AsyncDelivery"]["Properties"]["MaximumRetryAttempts"], 0)
        self.assertEqual(resources["Subscription"]["Properties"]["FilterPolicyScope"], "MessageBody")
        self.assertEqual(set(resources["Subscription"]["Properties"]["FilterPolicy"]["AlarmName"]), monitor.ALARMS)
        schedule = resources["SesFollowup"]["Properties"]
        self.assertEqual(schedule["ScheduleExpression"], "at(2026-10-27T21:00:00)")
        self.assertEqual(schedule["ScheduleExpressionTimezone"], "Asia/Seoul")
        self.assertEqual(schedule["Target"]["RetryPolicy"]["MaximumRetryAttempts"], 0)

    def test_automatic_schedule_cleanup_keeps_target_and_does_not_recreate_after_due_time(self):
        current = {"Name": "byus-prod-ses-followup-20261027", "GroupName": "byus-prod", "Target": {"Arn": "monitor-only", "RoleArn": "scheduler-only", "RetryPolicy": {"MaximumRetryAttempts": 0}}, "ScheduleExpression": "at(2026-10-27T21:00:00)", "ScheduleExpressionTimezone": "Asia/Seoul", "FlexibleTimeWindow": {"Mode": "OFF"}, "State": "ENABLED", "CreationDate": "ignore"}
        aws = Mock(side_effect=[current, {key: "" for key in current if key != "CreationDate"}, {}])
        with patch.object(deploy.datetime, "datetime", wraps=datetime.datetime) as clock:
            clock.now.return_value = datetime.datetime(2026, 10, 26, tzinfo=datetime.timezone.utc)
            deploy.auto_delete_followup(aws)
        saved = aws.call_args.kwargs["payload"]
        self.assertEqual(saved["Target"], current["Target"])
        self.assertEqual(saved["ActionAfterCompletion"], "DELETE")
        self.assertNotIn("CreationDate", saved)
        aws.reset_mock()
        with patch.object(deploy.datetime, "datetime", wraps=datetime.datetime) as clock:
            clock.now.return_value = datetime.datetime(2026, 10, 28, tzinfo=datetime.timezone.utc)
            deploy.auto_delete_followup(aws)
        aws.assert_not_called()


if __name__ == "__main__":
    unittest.main()
