"use client";

import { useEffect, useState } from "react";
import { useAdminSession } from "@/components/admin/use-admin-session";
import { AdminAccessState } from "@/components/admin/admin-access-state";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";

type Candidate = { id: string; slug: string; fandom_name: string | null };
const endpoint = "/api/events/donation-vote";

export function FandomEditor() {
  const session = useAdminSession();
  const { getAccessToken } = useByUsAuth();
  const [rows, setRows] = useState<Candidate[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (session.status !== "authorized") return;
    let active = true;
    async function load() {
      const token = await getAccessToken();
      const response = await fetch(endpoint, { headers: { Authorization: "Bearer " + token } });
      if (!response.ok) throw Error();
      const data = await response.json();
      if (active) setRows(data.ranking);
    }
    void load().catch(() => { if (active) setMessage("후보를 불러오지 못했습니다."); });
    return () => { active = false; };
  }, [getAccessToken, session.status]);
  if (session.status !== "authorized") return <AdminAccessState status={session.status} locale="ko" />;
  async function save(id: string, name: FormDataEntryValue | null) {
    try {
      const token = await getAccessToken();
      const response = await fetch(endpoint, { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ creatorId: id, name }) });
      if (!response.ok) throw Error();
      setMessage("저장했습니다.");
    } catch { setMessage("저장하지 못했습니다."); }
  }
  return <main><FanHeading as="h1">기부 투표 팬덤 이름</FanHeading>
    {rows.map(row => <form key={row.id} onSubmit={e => { e.preventDefault(); void save(row.id, new FormData(e.currentTarget).get("name")); }}>
      <label>{row.slug} · 팬덤 이름 <input name="name" defaultValue={row.fandom_name ?? ""} maxLength={100} /></label>
      <FanAction type="submit">저장</FanAction>
    </form>)}<p role="status">{message}</p>
  </main>;
}
