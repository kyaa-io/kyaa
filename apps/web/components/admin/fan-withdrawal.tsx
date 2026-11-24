"use client";
import { useEffect, useState } from "react";
import { FanAction } from "../fan-ui/fan-action";
import { FanHeading } from "../fan-ui/fan-heading";
import ops from "./operations.module.css";
import styles from "./fan-operations.module.css";

type Status =
  | "loading"
  | "empty"
  | "error"
  | "pending"
  | "processing"
  | "completed";
export function Withdrawal({
  id,
  locale,
  getToken,
}: {
  id: string;
  locale: "ko" | "en";
  getToken: () => Promise<string | null>;
}) {
  const ko = locale === "ko";
  const [status, setStatus] = useState<Status>("loading");
  const [completed, setCompleted] = useState("");
  const [version, refresh] = useState(0);
  const [confirmation, confirm] = useState("");
  const [saving, setSaving] = useState(false);
  const url = `/api/admin/fans/${id}/withdrawal`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(url, {
          headers: { authorization: `Bearer ${await getToken()}` },
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 404 && body.error === "NOT_FOUND")
          setStatus("empty");
        else if (response.ok) {
          setStatus(body.deletion.status);
          setCompleted(body.deletion.completedAt);
        } else setStatus("error");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [url, getToken, version]);
  async function submit(data: FormData) {
    if (saving || confirmation !== id || status !== "empty") return;
    setSaving(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${await getToken()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          confirmation,
          channel: data.get("channel"),
          receivedAt: new Date(String(data.get("received"))).toISOString(),
        }),
      });
      if (!response.ok) throw new Error();
      const { deletion } = await response.json();
      setStatus(deletion.status);
      setCompleted(deletion.completedAt);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }
  const labels = ko
    ? {
        loading: "조회 중",
        error: "요청 상태를 확인할 수 없습니다.",
        pending: "대기",
        processing: "처리 중",
        completed: "완료",
        empty: "",
      }
    : {
        loading: "Loading",
        error: "Could not verify the request status.",
        pending: "Pending",
        processing: "Processing",
        completed: "Completed",
        empty: "",
      };
  const title = ko ? "탈퇴 접수" : "Register withdrawal";
  return (
    <section className={ops.detailSection}>
      <FanHeading as="h3">{title}</FanHeading>
      {status === "empty" ? (
        <form action={submit} className={styles.correction}>
          <label>
            {ko ? "요청 채널" : "Request channel"}
            <select name="channel" required defaultValue="">
              <option value="" disabled>
                {ko ? "선택" : "Select"}
              </option>
              <option value="email">{ko ? "메일" : "Email"}</option>
              <option value="inquiry">{ko ? "문의" : "Support inquiry"}</option>
            </select>
          </label>
          <label>
            {ko ? "받은 시각 (현지 시간)" : "Received at (local time)"}
            <input
              type="datetime-local"
              name="received"
              required
              onChange={(e) =>
                e.target.setCustomValidity(
                  new Date(e.target.value).getTime() > Date.now()
                    ? ko
                      ? "미래 시각은 입력할 수 없습니다."
                      : "Choose a past time."
                    : "",
                )
              }
            />
          </label>
          <label>
            {ko ? "회원 번호 다시 입력" : "Re-enter member ID"}
            <input
              required
              autoComplete="off"
              value={confirmation}
              onChange={(e) => confirm(e.target.value)}
            />
          </label>
          <FanAction
            type="submit"
            variant="primary"
            disabled={saving || confirmation !== id}
          >
            {title}
          </FanAction>
        </form>
      ) : (
        <>
          <p role="status">
            {labels[status]}{" "}
            {status === "completed" &&
              completed &&
              new Date(completed).toLocaleString(locale)}
          </p>
          {["error", "pending", "processing"].includes(status) && (
            <FanAction type="button" onClick={() => refresh((v) => v + 1)}>
              {ko ? "상태 새로고침" : "Refresh status"}
            </FanAction>
          )}
        </>
      )}
    </section>
  );
}
