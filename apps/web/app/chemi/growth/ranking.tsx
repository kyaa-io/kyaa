"use client";

import { useEffect, useState } from "react";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { RankingRow } from "../game-rankings";
import { getGrowthCopy } from "./copy";
import { growthStep } from "./ladder";

type Row = { place: number; name: string | null; avatar: string | null; score: number; total: number; mine: boolean; gap: number | null };
const labels: Record<string,string[]> = {
  ko: ["키우기 랭킹","이번 주","전체","내 순위","앞 순위까지","미등록","팬"],
  en: ["Growth ranking","This week","All time","My rank","To the next rank","Unranked","Fan"],
  mn: ["Өсөлтийн чансаа","Энэ долоо хоног","Бүх хугацаа","Миний байр","Дараагийн байрт хүрэхэд","Байр эзлээгүй","Фэн"],
  ja: ["育成ランキング","今週","累計","自分の順位","次の順位まで","未登録","ファン"],
  "zh-Hant": ["養成排行","本週","累計","我的排名","距上一名","未上榜","粉絲"],
  zh: ["养成排行","本周","累计","我的排名","距上一名","未上榜","粉丝"],
  th: ["อันดับการเติบโต","สัปดาห์นี้","ทั้งหมด","อันดับของฉัน","สู่อันดับถัดไป","ยังไม่มีอันดับ","แฟน"],
  id: ["Peringkat pertumbuhan","Minggu ini","Sepanjang waktu","Peringkat saya","Ke posisi berikutnya","Belum berperingkat","Penggemar"],
  vi: ["Xếp hạng nuôi dưỡng","Tuần này","Tất cả","Hạng của tôi","Đến hạng kế tiếp","Chưa xếp hạng","Người hâm mộ"],
  es: ["Clasificación de crecimiento","Esta semana","Histórico","Mi puesto","Para subir","Sin clasificar","Fan"],
  fr: ["Classement de croissance","Cette semaine","Depuis le début","Mon rang","Pour progresser","Non classé","Fan"],
  pt: ["Ranking de crescimento","Esta semana","Geral","Minha posição","Para subir","Sem posição","Fã"],
  ru: ["Рейтинг роста","Эта неделя","За всё время","Моё место","До следующего места","Без места","Фанат"],
};

export function GrowthRanking({ character, locale }: { character: string; locale: string }) {
  const [period, setPeriod] = useState("week");
  const terms = labels[locale] ?? labels[locale.split("-")[0]!] ?? labels.en!;
  return <section>
    <FanHeading>{terms[0]}</FanHeading>
    <FanTabs variant="chip" label={terms[0]!} current={period} items={["week","all"].map((key,i) => ({key,label:terms[i+1],onSelect:()=>setPeriod(key)}))} />
    <Results key={period} {...{character,locale,period,terms}} />
  </section>;
}

function Results({character,locale,period,terms}: {character:string; locale:string; period:string; terms:string[]}) {
  const { ready, authenticated, getAccessToken } = useByUsAuth();
  const [rows,setRows] = useState<Row[]>();
  const [failed,setFailed] = useState(false);
  const [attempt,retry] = useState(0);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    async function read() {
      setFailed(false);
      try {
        const headers = new Headers();
        if (authenticated) headers.set("authorization","Bearer " + await getAccessToken());
        const response = await fetch("/api/chemi/grow?" + new URLSearchParams({character,period}), {headers,signal:controller.signal});
        if (!response.ok) throw new Error();
        const result: Row[] = await response.json();
        if (!controller.signal.aborted) setRows(result);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void read();
    return () => controller.abort();
  },[ready,authenticated,getAccessToken,attempt,character,period]);
  const copy = getGrowthCopy(locale);
  if (failed) return <><FanText role="meta">{copy.error}</FanText><FanAction size="sm" onClick={()=>retry(attempt+1)}>{copy.retry}</FanAction></>;
  if (!rows) return <FanSkeleton height={52} />;
  const mine = rows.find(row=>row.mine);
  function entry(place:number,row?:Row) {
    return <RankingRow key={place} vacantLabel={terms[5]!} row={{
      id:String(place),place,name:row?.name || terms[6]!,avatar:row?.avatar ?? undefined,
      initial:row?.name ? undefined : null,change:0,isMe:row?.mine,vacant:row ? undefined : true,
      record:row ? growthStep(row.total,locale).chip + " · " + row.score.toLocaleString(locale) + " EXP" : "",
    }} />;
  }
  return <>{[1,2,3].map(place=>entry(place,rows.find(row=>row.place===place)))}
    <FanText role="item">{terms[3]} · {mine?.place ?? terms[5]}</FanText>
    {mine && mine.place>3 && entry(mine.place,mine)}
    {mine?.gap != null && <FanText role="meta">{terms[4]} {mine.gap.toLocaleString(locale)} EXP</FanText>}
  </>;
}
