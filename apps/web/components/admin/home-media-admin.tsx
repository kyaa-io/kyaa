"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { AdminOperationsShell } from "./operations-shell";
import { AdminAccessState } from "./admin-access-state";
import { useAdminSession } from "./use-admin-session";
import { FanHeading } from "../fan-ui/fan-heading";
import { FanAction } from "../fan-ui/fan-action";
import styles from "./home-media.module.css";

type Item = { id: string; selected: boolean; hidden: boolean; legacy: boolean; thumbnail?: string; consent?: { preview: unknown; conditions: string }; source?: string; sourceHref: string;
  title?: string; alt?: string; image?: { url: string }; creator?: { name: string; slug: string }; platform?: string; videoId?: string };
export function HomeMediaAdmin() {
  const session = useAdminSession();
  const { getPrivyAccessToken, getAccessToken } = useByUsAuth();
  const token = getPrivyAccessToken ?? getAccessToken;
  const en = useSearchParams().get("lang") === "en";
  const t = (ko: string, english: string) => en ? english : ko;
  const [kind, setKind] = useState("photo");
  const [items, setItems] = useState<Item[]>([]);
  const [checked, check] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [revision, refresh] = useState(0);
  const [busy, lock] = useState(false);
  const [failed, fail] = useState(false);
  useEffect(() => {
    if (session.status !== "authorized") return;
    const ctrl = new AbortController();
    lock(true); fail(false); setItems([]); check([]);
    void (async () => {
      const response = await fetch("/api/admin/home-media?kind="+kind,{signal:ctrl.signal,headers:{authorization:"Bearer "+await token()}});
      if (!response.ok) throw Error();
      const rows = await response.json();
      if (!ctrl.signal.aborted) setItems(rows);
    })().catch(()=>{if (!ctrl.signal.aborted) fail(true);}).finally(()=>{if (!ctrl.signal.aborted) lock(false);});
    return () => ctrl.abort();
  },[kind,revision,session.status,token]);
  async function edit(action: string, ids: string[]) {
    lock(true); fail(false);
    try {
      const response = await fetch("/api/admin/home-media",{method:"POST",headers:{authorization:"Bearer "+await token(),"content-type":"application/json"},body:JSON.stringify({kind,action,ids})});
      if (!response.ok) throw Error();
      refresh(v=>v+1);
    } catch { fail(true); lock(false); }
  }
  function move(from: string,to: string) {
    if (busy || from===to || !items.some(i=>i.id===from)) return;
    const ids = items.map(i=>i.id).filter(id=>id!==from);
    ids.splice(ids.indexOf(to),0,from);
    void edit("rank",ids);
  }
  const eligible = items.filter(item => item.selected && !item.hidden);
  const unique = eligible.filter((item, index) => eligible.findIndex(row => row.sourceHref === item.sourceHref) === index);
  const fans = unique.filter(item => item.source !== "official_sns");
  const official = unique.filter(item => item.source === "official_sns");
  const firstFans = fans.slice(0, 3);
  const firstOfficial = official.slice(0, 10 - firstFans.length);
  const firstTen = [...firstFans, ...firstOfficial, ...fans.slice(firstFans.length)].slice(0,10);
  const locale = en ? "en" : "ko";
  if (session.status!=="authorized") return <AdminAccessState locale={locale} status={session.status}/>;
  return <AdminOperationsShell locale={locale} adminRole={session.admin.role}>
    <FanHeading as="h1">{t("홈 갤러리·숏폼","Home gallery and shorts")}</FanHeading>
    <fieldset className={styles.editor} disabled={busy || session.admin.role==="viewer"}>
      <div className={styles.toolbar}><input type="search" aria-label={t("후보 검색","Search candidates")} placeholder={t("후보 검색","Search candidates")} value={query} onChange={e=>setQuery(e.target.value)}/>
      <select aria-label={t("종류","Media type")} value={kind} onChange={e=>{setKind(e.target.value);setFilter("all");}}>
        <option value="photo">{t("갤러리","Gallery")}</option><option value="video">{t("숏폼","Shorts")}</option></select>
      {kind==="photo" && <select aria-label={t("출처","Source")} value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="all">{t("전체","All")}</option><option value="official">{t("공식","Official")}</option><option value="fan">{t("팬","Fan")}</option></select>}
      {(["select","remove","hide"] as const).map((action,i)=><FanAction key={action} disabled={!checked.length} onClick={()=>void edit(action,checked)}>{[t("홈 노출 켜기","Show on home"),t("홈 노출 끄기","Remove from home"),t("숨김","Hide")][i]}</FanAction>)}
      </div>
      {kind==="photo" && firstTen.length>0 && <details><summary>{t("홈 첫 10칸","First ten on home")} · {t("팬","Fan")} {firstTen.filter(item=>item.source!=="official_sns").length} · {t("공식","Official")} {firstOfficial.length}</summary>
        <ol>{firstTen.map(item=><li key={item.id}>{item.creator?.name} · {item.alt}</li>)}</ol></details>}
      <div className={styles.grid}>{items.filter(i=>[i.title,i.creator?.name,i.alt].join(" ").toLowerCase().includes(query.trim().toLowerCase())).filter(i=>filter==="all" || (i.source==="official_sns")===(filter==="official")).map(item=>{
        const policy=item.consent?.preview;
        const cover=item.image?.url ?? item.thumbnail ?? (item.platform==="tiktok" ? "/images/media/tiktok/"+item.videoId+".jpg" : item.platform==="youtube" ? "https://i.ytimg.com/vi/"+item.videoId+"/hqdefault.jpg" : undefined);
        return <article key={item.id} draggable={!busy} onDragStart={e=>e.dataTransfer.setData("text/plain",item.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();move(e.dataTransfer.getData("text/plain"),item.id);}}>
          {cover && <img src={cover} alt={item.alt ?? item.title ?? ""}/>}
          {item.platform && <FanAction variant="text" onClick={()=>setPlaying(playing===item.id?null:item.id)}>{playing===item.id?t("닫기","Close"):t("영상 미리보기","Preview video")}</FanAction>}
          {playing===item.id && item.platform && <iframe title={item.title} allowFullScreen src={item.platform==="instagram" ? item.sourceHref+"embed/" : item.platform==="tiktok" ? "https://www.tiktok.com/player/v1/"+item.videoId : "https://www.youtube.com/embed/"+item.videoId}/>}
          <label><input type="checkbox" checked={checked.includes(item.id)} onChange={e=>check(e.target.checked?[...checked,item.id]:checked.filter(id=>id!==item.id))}/>{item.title ?? item.creator?.name ?? item.alt}</label>
          <span>{kind==="video"?item.platform:item.source==="official_sns"?t("공식","Official"):t("팬","Fan")}</span>
          <span>{item.hidden?t("숨김","Hidden"):item.selected?t("홈 노출","On home"):t("미선정","Unselected")} {item.legacy && t("· 부분 복원 후보","· Restoration candidate")}</span>
          {kind==="photo" && <span>{t("목록 미리보기 동의","List preview consent")} · {policy===true?t("허용","Allowed"):policy===false?t("불허","Denied"):t("미확인","Unconfirmed")} {item.consent?.conditions}</span>}
          <div className={styles.toolbar}>
            <FanAction variant="text" disabled={items[0]===item} onClick={()=>move(item.id,items[items.indexOf(item)-1]!.id)}>{t("앞으로","Earlier")}</FanAction>
            <FanAction variant="text" disabled={items.at(-1)===item} onClick={()=>move(items[items.indexOf(item)+1]!.id,item.id)}>{t("뒤로","Later")}</FanAction>
          </div>
          <a href={item.sourceHref} target="_blank" rel="noreferrer">{t("원글 보기","Open original")}</a>
        </article>;
      })}</div>
    </fieldset>
    {!busy && !failed && !items.length && <p>{t("후보가 없습니다.","No candidates available.")}</p>}
    <p role="status">{failed?t("불러오기 또는 저장에 실패했습니다.","Could not load or save."):busy?t("처리 중","Loading"):t("선택","Selected")+" "+checked.length}</p>
  </AdminOperationsShell>;
}
