"use client";

import { useState, type FormEvent } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";

import { AdminAccessState } from "./admin-access-state";
import { AdminOperationsShell, type AdminLocale } from "./operations-shell";
import { useAdminSession } from "./use-admin-session";

export function PastDrawArchiveManager({ locale }: { locale: AdminLocale }) {
  const session = useAdminSession();
  const auth = useByUsAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ko = locale === "ko";
  const title = ko ? "지난 럭키드로우 등록" : "Register a past draw";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const row = Object.fromEntries(values);
    setBusy(true);
    setMessage("");
    try {
      const token = await auth.getAccessToken();
      if (!token) throw new Error();
      const response = await fetch("/api/admin/past-draw-archive", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          ...row, closes_at: new Date(`${row.closes_at}+09:00`).toISOString(),
          results_notice_slug: row.results_notice_slug || null,
          published: values.has("published"), is_test: values.has("is_test"),
        }),
      });
      if (response.status === 409) {
        setMessage(ko ? "이미 등록된 회차입니다." : "This draw is already registered.");
        return;
      }
      if (!response.ok) throw new Error();
      form.reset();
      setMessage(ko ? "회차를 등록했습니다." : "Draw registered.");
    } catch {
      setMessage(ko ? "등록하지 못했습니다. 원본 공지와 마감일을 확인해 주세요." : "Couldn’t register the draw. Check the source notice and closing date.");
    } finally {
      setBusy(false);
    }
  }

  if (session.status !== "authorized") return <AdminAccessState status={session.status} locale={locale} />;
  const canWrite = session.admin.role === "admin" || session.admin.role === "operator";
  return <AdminOperationsShell locale={locale} adminRole={session.admin.role}>
    <FanHeading as="h1">{title}</FanHeading>
    {canWrite ? <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <p><label>{ko ? "회차 키" : "Round key"} <input name="round_key" required maxLength={120} /></label></p>
        <p><label>{ko ? "원본 종류" : "Source type"} <select name="source_kind">
          <option value="live_campaign">LIVE</option>
          <option value="group_raffle">{ko ? "모임 추첨" : "Group draw"}</option>
          <option value="runmusic">RUN&MUSIC</option>
          <option value="notice">{ko ? "공지" : "Notice"}</option>
        </select></label></p>
        <p><label>{ko ? "원본 ID" : "Source ID"} <input name="source_id" required maxLength={120} /></label></p>
        <p><label>{ko ? "공개 행사 공지 주소 이름" : "Public event notice slug"} <input name="notice_slug" required maxLength={120} /></label></p>
        <p><label>{ko ? "공개 당첨 공지 주소 이름" : "Public results notice slug"} <input name="results_notice_slug" maxLength={120} /></label></p>
        <p><label>{ko ? "응모 마감 (한국 시간)" : "Entry deadline (KST)"} <input name="closes_at" type="datetime-local" required /></label></p>
        <p><label><input name="published" type="checkbox" /> {ko ? "지난 럭키드로우에 공개" : "Publish in past draws"}</label></p>
        <p><label><input name="is_test" type="checkbox" /> {ko ? "시험·체험 회차" : "Test or demo draw"}</label></p>
        <FanAction type="submit" variant="primary">{ko ? "등록" : "Register"}</FanAction>
      </fieldset>
      <p role="status">{message}</p>
    </form> : <p>{ko ? "등록에는 편집 권한이 필요합니다." : "Registering a draw requires editing access."}</p>}
  </AdminOperationsShell>;
}
