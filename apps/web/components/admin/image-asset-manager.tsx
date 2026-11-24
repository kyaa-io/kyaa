"use client";

import { FanHeading } from "../fan-ui/fan-heading";
import { FanAction } from "../fan-ui/fan-action";
import { FanSkeletonRows } from "../fan-ui/fan-skeleton";
import styles from "./image-asset-manager.module.css";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useAdminSession } from "./use-admin-session";
import { AdminAccessState } from "./admin-access-state";
import { AdminOperationsShell, type AdminLocale } from "./operations-shell";

type Asset = { id: string; url: string; byte_size: number; created_at: string; creator: string; sources: string[] };

export function ImageAssetManager() {
  const locale = useSearchParams().get("lang") === "en" ? "en" : "ko";
  const session = useAdminSession();
  if (session.status !== "authorized") return <AdminAccessState locale={locale} status={session.status} />;
  return <AssetList key={session.admin.email} locale={locale} role={session.admin.role} />;
}

function AssetList({ locale, role }: { locale: AdminLocale; role: string }) {
  const auth = useByUsAuth();
  const getAccessToken = auth.getPrivyAccessToken ?? auth.getAccessToken;
  const en = locale === "en";
  const [items, setItems] = useState<Asset[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/image-assets?offset=${offset}`, { headers: { Authorization: `Bearer ${await getAccessToken()}` }, signal: controller.signal });
        if (!response.ok) throw Error();
        const result = await response.json();
        if (!controller.signal.aborted) setItems(result.items);
      } catch {
        if (!controller.signal.aborted) setMessage(en ? "Could not load images." : "이미지 목록을 불러오지 못했어요.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [offset, getAccessToken, en]);
  async function remove(asset: Asset) {
    if (!window.confirm(en ? "Delete this image permanently? This cannot be undone." : "이 이미지를 지울까요? 지우면 되돌릴 수 없어요.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/image-assets?id=${asset.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await getAccessToken()}` } });
      const result = await response.json();
      if (response.status === 409) { setMessage((en ? "Used in " : "이미지 사용처 · ") + result.references.join(", ")); return; }
      if (!response.ok) throw Error();
      setItems(previous => previous.filter(item => item.id !== asset.id));
      setMessage(result.storage === "pending" ? (en ? "File deletion pending. Cached copies remain." : "파일 삭제 재시도를 기다리고 있어요. 캐시가 남아 있어요.") : result.cache === "remaining" ? (en ? "File deleted. Cached copies remain." : "파일을 지웠어요. 캐시가 남아 있어요.") : (en ? "File deleted. Cache removal requested." : "파일을 지우고 캐시 삭제를 요청했어요."));
    } catch { setMessage(en ? "Could not confirm deletion." : "삭제 결과를 확인하지 못했어요."); }
    finally { setBusy(false); }
  }
  return <AdminOperationsShell locale={locale} adminRole={role}>
    <FanHeading as="h1">{en ? "Image assets" : "이미지 자산"}</FanHeading>
    <p role="status">{message}</p>
    {loading ? <FanSkeletonRows variant="entity" /> : <ul className={styles.list}>{items.map(asset => <li key={asset.id}>
      {/* Preview the complete original regardless of its aspect ratio. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.url} alt={en ? "Image preview" : "이미지 미리보기"} width={144} height={96} className={styles.preview} />
      <p>{asset.creator} · {new Date(asset.created_at).toLocaleString(locale)} · {asset.byte_size.toLocaleString(locale)} B</p>
      {asset.sources.length > 0 ? <p>{en ? "Used in code" : "코드에서 사용"} · {asset.sources.join(", ")}</p> :
        role !== "viewer" && <FanAction variant="secondary" disabled={busy} onClick={() => void remove(asset)}>{en ? "Delete image" : "이미지 지우기"}</FanAction>}
    </li>)}</ul>}
    {!loading && !items.length && <p>{en ? "No images on this page." : "이 페이지에 표시할 이미지가 없어요."}</p>}
    {offset > 0 && <FanAction variant="secondary" disabled={busy || loading} onClick={() => setOffset(offset - 50)}>{en ? "Previous" : "이전"}</FanAction>}
    {items.length === 50 && <FanAction variant="secondary" disabled={busy || loading} onClick={() => setOffset(offset + 50)}>{en ? "Next" : "다음"}</FanAction>}
  </AdminOperationsShell>;
}
