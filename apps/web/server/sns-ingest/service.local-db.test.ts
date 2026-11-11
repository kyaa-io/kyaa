// Runs the service against the real SQL functions on the disposable local database:
//   BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/sns_ingest_ci.sh bash scripts/verify-clean-migration-chain.sh
// Only run via the clean-migration disposable cluster; its owner deletes the entire cluster.
import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";
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
  fetchImage: vi.fn(async () => new Uint8Array([1])),
  processImage: async () => ({ bytes: new Uint8Array([2]), thumbnail: new Uint8Array([3]), width: 1080, height: 1080, sha256: "b".repeat(64) }),
  upload: vi.fn(async () => undefined),
  now: () => new Date(),
};
const request = (text: string) => snsIngestRequestSchema.parse({ celebritySlug: "sns-ingest-local", platform: "instagram", posts: [{
  sourceId: "DQlocal0001", sourceUrl: "https://www.instagram.com/ingest.local/p/DQlocal0001/", sourcePublishedAt: new Date().toISOString(),
  text, images: [{ url: "https://scontent.cdninstagram.com/a.jpg" }, { url: "https://scontent.cdninstagram.com/b.jpg" }],
}] });

describe.skipIf(!enabled)("sns ingest on the local database", () => {
  beforeAll(() => {
    sql(`insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
        values('${artist}','sns-ingest-local','published','/images/creator.webp',now(),'{creator}','creator')
        on conflict(id) do update set status='published',published_at=now();
      insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
        values('${artist}','ko','로컬 수집','소개','사진'),('${artist}','en','Local ingest','Intro','Photo') on conflict do nothing;
      insert into public.celebrity_social_links(celebrity_id,platform,url) values('${artist}','instagram','https://www.instagram.com/ingest.local/') on conflict do nothing;`);
    sql(`update public.celebrities set status='published',published_at=now() where id='${artist}'`);
  });

  it("holds photos on repeated collection until human review", async () => {
    const service = createSnsIngestService(deps);
    const [first, concurrent] = await Promise.all([
      service.ingest(request("로컬 원문 💜\n#kyaa"), crypto.randomUUID()),
      service.ingest(request("로컬 원문 💜\n#kyaa"), crypto.randomUUID()),
    ]);
    expect(concurrent.items[0]).toMatchObject({ status: "held", reason: "ALREADY_HELD" });
    expect(first.items).toEqual([expect.objectContaining({ status: "held", reason: "PHOTO_REVIEW_REQUIRED" })]);
    const stored = JSON.parse(sql(`select jsonb_build_object('status',n.publication_status,'title',l.title,'images',jsonb_path_query_array(l.body_json,'$.**.attrs.src'))
      from public.celebrity_notices n join public.celebrity_notice_localizations l on l.notice_id=n.id and l.locale='ko' where n.id='${first.items[0]!.noticeId}'`));
    expect(stored).toMatchObject({ status: "draft", title: "로컬 원문 💜" });
    expect(stored.images[0]).toMatch(/^\/api\/public\/notice-media\//);
    const id = first.items[0]!.noticeId!;
    sql(`update celebrity_notices set revision=revision+1 where id='${id}'; update celebrity_notice_localizations set title='검수자 편집' where notice_id='${id}'`);
    const snapshot = sql(`select row_to_json(n) from celebrity_notices n where id='${id}'`);
    for (let i = 0; i < 8; i++) {
      const result = await service.ingest(request("바뀐 캡션"), crypto.randomUUID());
      expect(result.items[0]).toMatchObject({ status: "held", reason: "ALREADY_HELD", noticeId: id });
    }
    expect(sql(`select row_to_json(n) from celebrity_notices n where id='${id}'`)).toBe(snapshot);
    expect(sql(`select title from celebrity_notice_localizations where notice_id='${id}' and locale='en'`)).toBe("검수자 편집");
    expect(sql(`select count(*) from sns_ingest_media where notice_id='${id}'`)).toBe("2");
    expect(deps.fetchImage).toHaveBeenCalledTimes(2);
    expect(deps.upload).toHaveBeenCalledTimes(4);
  });
});
