#!/usr/bin/env node
// kyaa 공지 일괄 등록 (NOTICES-0855). 목록은 scripts/fixtures/home-notices-2026-11.mjs.
// 이 스크립트는 DB 접속 정보를 다루지 않는다. 기본은 SQL만 출력하고, 같은 SQL을 dev·운영의 승인된 DB 실행 경로로 적용한다.
//   node scripts/register-home-notices.mjs --actor-email <활성 관리자 이메일> [--origin https://kyaa.io] [--only slug,slug]   등록 SQL 출력
//   node scripts/register-home-notices.mjs --actor-email <...> --psql   PGHOST=127.0.0.1(로컬 일회용 DB)일 때만 psql로 바로 적용
//   node scripts/register-home-notices.mjs --cleanup   이 목록의 slug를 지우는 SQL 출력(댓글이 달린 공지는 지워지지 않고 실패한다)
// 저장은 관리자 화면과 같은 save_admin_home_notice / set_admin_home_notice_state 함수를 쓴다. 공개 함수는 게시 시각을 now()로 두므로,
// 마지막에 원래 날짜(at)로 published_at을 맞춘다. 같은 slug가 이미 있으면 건너뛰고 아무것도 바꾸지 않는다.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { notices } from "./fixtures/home-notices-2026-11.mjs";

const CATEGORIES = new Set(["guide", "creator", "event", "update"]);
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const STATIC_IMAGE = /^\/images\/notices\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/;

export function parseArgs(args) {
  const o = { origin: "https://kyaa.io", only: null, mode: "sql" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--psql") o.mode = "psql";
    else if (a === "--cleanup") o.mode = "cleanup";
    else if (["--actor-email", "--origin", "--only"].includes(a) && args[i + 1]) {
      const key = a.slice(2) === "actor-email" ? "actorEmail" : a.slice(2);
      o[key] = key === "only" ? args[++i].split(",") : args[++i];
    } else throw new Error("사용법: --actor-email <email> [--origin https://kyaa.io] [--only a,b] [--psql | --cleanup]");
  }
  if (!/^https:\/\/[a-z0-9.-]+$/.test(o.origin)) throw new Error("--origin은 https://도메인 형식이어야 합니다");
  return o;
}

function absolute(href, origin) {
  return href.startsWith("/") ? `${origin}${href}` : href;
}

/** [글자](주소)를 link 표시가 붙은 text 노드로 바꾼다. 주소는 https만 허용된다. */
function inline(text, origin) {
  const nodes = [];
  let last = 0;
  for (const m of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    if (m.index > last) nodes.push({ type: "text", text: text.slice(last, m.index) });
    const href = absolute(m[2], origin);
    if (!/^https:\/\/[^\s/]+/.test(href)) throw new Error(`링크는 https여야 합니다: ${m[2]}`);
    nodes.push({ type: "text", text: m[1], marks: [{ type: "link", attrs: { href } }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes;
}

export function buildDocument(blocks, origin) {
  const paragraph = (text) => ({ type: "paragraph", content: inline(text, origin) });
  const list = (type, items) => ({ type, content: items.map((item) => ({ type: "listItem", content: [paragraph(item)] })) });
  const content = blocks.map(([kind, a, b]) => {
    if (kind === "p") return paragraph(a);
    if (kind === "h") return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: a }] };
    if (kind === "ul") return list("bulletList", a);
    if (kind === "ol") return list("orderedList", a);
    if (kind === "img") {
      const src = STATIC_IMAGE.test(a) ? a : absolute(a, origin);
      if (!STATIC_IMAGE.test(src) && !/^https:\/\//.test(src)) throw new Error(`이미지 주소가 https가 아닙니다: ${a}`);
      if (!b?.trim()) throw new Error(`이미지에는 대체 글이 필요합니다: ${a}`);
      return { type: "image", attrs: { src, alt: b } };
    }
    throw new Error(`알 수 없는 블록: ${kind}`);
  });
  return { type: "doc", content };
}

export function buildSql({ actorEmail, origin, only = null }) {
  if (!/^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(actorEmail ?? "")) throw new Error("--actor-email에 활성 관리자 이메일이 필요합니다");
  const picked = notices.filter((n) => !only || only.includes(n.slug));
  if (only && picked.length !== only.length) throw new Error("--only에 목록에 없는 slug가 있습니다");
  const out = [
    "-- kyaa 공지 일괄 등록 (NOTICES-0855). 같은 slug가 있으면 건너뜁니다.",
    "begin;",
    "set local lock_timeout = '5s';",
    "create temp table _notice_actor on commit drop as",
    "  select u.id as app_user_id, a.id as allowlist_id from public.admin_allowlist a",
    "  join public.app_users u on u.verified_email = a.email",
    `  where a.email = ${sqlText(actorEmail)} and a.active and a.role <> 'viewer' and u.status = 'active';`,
    "do $$ begin if (select count(*) from _notice_actor) <> 1 then raise exception 'NOTICE_ACTOR_NOT_FOUND'; end if; end $$;",
  ];
  for (const n of picked) {
    if (!CATEGORIES.has(n.category)) throw new Error(`${n.slug}: category`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(n.slug)) throw new Error(`${n.slug}: slug`);
    const at = new Date(n.at);
    if (Number.isNaN(at.getTime())) throw new Error(`${n.slug}: at`);
    const doc = Object.fromEntries(["ko", "en"].map((l) => [l, JSON.stringify(buildDocument(n[l].body, origin))]));
    for (const l of ["ko", "en"]) {
      if (n[l].title.trim().length < 1 || n[l].title.length > 160) throw new Error(`${n.slug}: ${l} 제목 길이`);
      if (doc[l].includes("$notice$")) throw new Error(`${n.slug}: 본문에 쓸 수 없는 문자열`);
    }
    out.push(
      `do $notice_${n.slug.replaceAll("-", "_")}$`,
      "declare a _notice_actor; v_id uuid;",
      "begin",
      "  select * into a from _notice_actor;",
      `  if exists (select 1 from public.home_notices where slug = ${sqlText(n.slug)}) then raise notice 'skip %', ${sqlText(n.slug)}; return; end if;`,
      `  v_id := public.save_admin_home_notice(a.app_user_id, a.allowlist_id, extensions.gen_random_uuid(), null::uuid, null::integer, ${sqlText(n.slug)}, ${sqlText(n.category)}, false,`,
      `    ${sqlText(n.ko.title)}, $notice$${doc.ko}$notice$::jsonb, ${sqlText(n.en.title)}, $notice$${doc.en}$notice$::jsonb, null::uuid);`,
      "  perform public.set_admin_home_notice_state(a.app_user_id, a.allowlist_id, extensions.gen_random_uuid(), v_id, 1, 'publish', null);",
      `  update public.home_notices set published_at = ${sqlText(at.toISOString())}, ever_published_at = ${sqlText(at.toISOString())} where id = v_id;`,
      `end $notice_${n.slug.replaceAll("-", "_")}$;`,
    );
  }
  out.push("commit;");
  return `${out.join("\n")}\n`;
}

export function buildCleanupSql() {
  const slugs = notices.map((n) => sqlText(n.slug)).join(", ");
  return `-- 이 목록의 공지만 지웁니다. 댓글·반응이 달린 공지는 외래키 때문에 실패합니다.\nbegin;\ndelete from public.home_notices where slug in (${slugs});\ncommit;\n`;
}

export function main(args = process.argv.slice(2)) {
  const o = parseArgs(args);
  const sql = o.mode === "cleanup" ? buildCleanupSql() : buildSql(o);
  if (o.mode !== "psql") { process.stdout.write(sql); return; }
  if (process.env.PGHOST !== "127.0.0.1") throw new Error("--psql은 PGHOST=127.0.0.1(로컬 일회용 DB)일 때만 씁니다. dev·운영은 SQL을 출력해 승인된 경로로 적용하세요.");
  const r = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-d", process.env.PGDATABASE ?? "byus", "-f", "-"], { input: sql, encoding: "utf8" });
  process.stdout.write(r.stdout ?? ""); process.stderr.write(r.stderr ?? "");
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
