// Runs the service against the real SQL functions on the disposable local database:
//   SNS_INGEST_LOCAL_PG=1 PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper PGDATABASE=byus npx vitest run server/sns-ingest/service.local-db.test.ts
// Ingest rows are removed in afterAll and the test creator returns to draft; audit_logs is append-only, so its notice.sns_ingest.* rows remain.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSnsIngestService, snsIngestRequestSchema, type SnsIngestDeps } from "./service";

const enabled = process.env.SNS_INGEST_LOCAL_PG === "1";
const artist = "fa400000-0000-4000-8000-0000000005a1";
const sql = (statement: string) => execFileSync("psql", ["-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8" }).trim();
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function rpc(name: string, args: Record<string, unknown>) {
  const signature = JSON.parse(sql(`select jsonb_build_object('args',(select jsonb_agg(jsonb_build_array(n,format_type(t,null)) order by o)
    from unnest(p.proargnames,p.proargtypes::oid[]) with ordinality x(n,t,o)),'returns',format_type(p.prorettype,null))
    from pg_proc p where p.oid='public.${name}'::regproc`)) as { args: [string, string][]; returns: string };
  const call = `public.${name}(${signature.args.map(([arg, type]) => `${arg}=>(case when jsonb_typeof(j->'${arg}')='null' then null else ${type === "jsonb" ? `j->'${arg}'` : `(j->>'${arg}')::${type}`} end)`).join(",")})`;
  const from = `from (select ${literal(JSON.stringify(args))}::jsonb j) s`;
  if (signature.returns === "void") { sql(`select ${call} ${from}`); return null; }
  const output = sql(`select to_jsonb(${call}) ${from}`);
  return output ? JSON.parse(output) : null;
}

const deps: SnsIngestDeps = {
  rpc,
  fetchImage: async () => new Uint8Array([1]),
  processImage: async () => ({ bytes: new Uint8Array([2]), thumbnail: new Uint8Array([3]), width: 1080, height: 1080, sha256: "b".repeat(64) }),
  upload: async () => undefined,
  now: () => new Date(),
};
const request = (text: string) => snsIngestRequestSchema.parse({ celebritySlug: "sns-ingest-local", platform: "instagram", posts: [{
  sourceId: "DQlocal0001", sourceUrl: "https://www.instagram.com/ingest.local/p/DQlocal0001/", sourcePublishedAt: new Date().toISOString(),
  text, images: [{ url: "https://scontent.cdninstagram.com/a.jpg" }],
}] });

// Creating a creator also creates its pages, so the creator row is kept as a draft and reused.
const cleanup = () => sql(`
  set role postgres; -- content hard deletes are reserved for the owner role
  delete from public.sns_ingest_media where notice_id in (select notice_id from public.sns_ingest_posts where celebrity_id='${artist}');
  create temp table gone as select notice_id from public.sns_ingest_posts where celebrity_id='${artist}';
  delete from public.sns_ingest_posts where celebrity_id='${artist}';
  delete from public.celebrity_notices where id in (select notice_id from gone);
  delete from public.sns_ingest_runs where celebrity_id='${artist}';
  delete from public.sns_ingest_sources where celebrity_id='${artist}';
  update public.celebrities set status='draft',published_at=null where id='${artist}';`);

describe.skipIf(!enabled)("sns ingest on the local database", () => {
  beforeAll(() => {
    sql(`insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
        values('${artist}','sns-ingest-local','published','/images/creator.webp',now(),'{creator}','creator')
        on conflict(id) do update set status='published',published_at=now();
      insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
        values('${artist}','ko','로컬 수집','소개','사진'),('${artist}','en','Local ingest','Intro','Photo') on conflict do nothing;
      insert into public.celebrity_social_links(celebrity_id,platform,url) values('${artist}','instagram','https://www.instagram.com/ingest.local/') on conflict do nothing;`);
    cleanup();
    sql(`update public.celebrities set status='published',published_at=now() where id='${artist}'`);
  });
  afterAll(() => { if (enabled) cleanup(); });

  it("holds photos on repeated collection until human review", async () => {
    const service = createSnsIngestService(deps);
    const first = await service.ingest(request("로컬 원문 💜\n#kyaa"), crypto.randomUUID());
    expect(first.items).toEqual([expect.objectContaining({ status: "held", reason: "PHOTO_REVIEW_REQUIRED" })]);
    const stored = JSON.parse(sql(`select jsonb_build_object('status',n.publication_status,'title',l.title,'images',jsonb_path_query_array(l.body_json,'$.**.attrs.src'))
      from public.celebrity_notices n join public.celebrity_notice_localizations l on l.notice_id=n.id and l.locale='ko' where n.id='${first.items[0]!.noticeId}'`));
    expect(stored).toMatchObject({ status: "draft", title: "로컬 원문 💜" });
    expect(stored.images[0]).toMatch(/^\/api\/public\/notice-media\//);
    const second = await service.ingest(request("바뀐 캡션"), crypto.randomUUID());
    expect(second.items).toEqual([expect.objectContaining({ status: "held", reason: "PHOTO_REVIEW_REQUIRED", noticeId: first.items[0]!.noticeId })]);
    expect(sql(`select title from public.celebrity_notice_localizations where notice_id='${first.items[0]!.noticeId}' and locale='en'`)).toBe("바뀐 캡션");
    expect(sql(`select count(*) from public.sns_ingest_runs where celebrity_id='${artist}' and succeeded`)).toBe("2");
  });
});
