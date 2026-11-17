#!/usr/bin/env node
// 케미 기록 허용 목록(apps/web/server/chemi-chain/chain-schema.ts) → SQL 검사 함수 public.chemi_chain_payload_check.
// 설계 arch-chemi r3 §7.3. 생성물은 손으로 고치지 않는다.
//   node scripts/chemi-chain-schema-sql.mjs [--out <file>]   생성물을 쓴다(기본: 20270110085000_chemi_chain_allow.sql)
//   node scripts/chemi-chain-schema-sql.mjs --check          가장 최근 allow migration 과 생성 결과가 같은지 본다(chain_schema_drift)
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const SOURCE = join(ROOT, "apps/web/server/chemi-chain/chain-schema.ts");
const FIRST = "20270110085000_chemi_chain_allow.sql";

const RULES = new Set(["enum", "int", "intset", "date", "week", "hex64", "intarray"]);

export function validateSchema(schema) {
  for (const [kind, spec] of Object.entries(schema)) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(kind)) throw new Error(`bad kind ${kind}`);
    const keys = [...Object.keys(spec.required ?? {}), ...Object.keys(spec.optional ?? {})];
    if (new Set(keys).size !== keys.length) throw new Error(`${kind}: key both required and optional`);
    for (const key of keys) {
      if (!/^[a-z][A-Za-z0-9]{0,31}$/.test(key)) throw new Error(`${kind}: bad key ${key}`);
      const rule = spec.required?.[key] ?? spec.optional?.[key];
      if (!RULES.has(rule.t)) throw new Error(`${kind}.${key}: unknown rule ${rule.t}`);
    }
  }
}

export function renderSql(schema, version) {
  validateSchema(schema);
  const json = JSON.stringify(schema).replaceAll("'", "''");
  return `-- 생성물 · 손으로 고치지 않는다. 원본 apps/web/server/chemi-chain/chain-schema.ts (schema v${version}).
-- 다시 만들기: node scripts/chemi-chain-schema-sql.mjs · 검사: node scripts/chemi-chain-schema-sql.mjs --check
-- 케미 기록 대기열에 들어가는 payload 를 kind 별 허용 키·허용 값으로만 통과시킨다(설계 arch-chemi r3 §7.3 겹 1).
-- 목록 밖 키·값, 그 기록의 한국 날짜·주차와 다른 날짜는 CHEMI_CHAIN_PAYLOAD_REJECTED. 오류에는 값을 싣지 않는다.
create or replace function public.chemi_chain_payload_check(p_kind text, p_payload jsonb, p_kst_date date) returns void
language plpgsql immutable set search_path = '' as $fn$
declare
  spec constant jsonb := '${json}'::jsonb;
  kind_spec jsonb; rules jsonb; rule jsonb; key text; val jsonb; n numeric; item jsonb; seen numeric[];
begin
  if p_kind is null or p_payload is null or p_kst_date is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'shape';
  end if;
  kind_spec := spec -> p_kind;
  if kind_spec is null then raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'kind'; end if;
  rules := coalesce(kind_spec -> 'required', '{}'::jsonb) || coalesce(kind_spec -> 'optional', '{}'::jsonb);
  for key in select jsonb_object_keys(coalesce(kind_spec -> 'required', '{}'::jsonb)) loop
    if not p_payload ? key then raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'missing:' || key; end if;
  end loop;
  for key, val in select e.key, e.value from jsonb_each(p_payload) e loop
    rule := rules -> key;
    if rule is null then raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'key'; end if;
    if not (case rule ->> 't'
      when 'enum' then jsonb_typeof(val) = 'string' and (rule -> 'v') @> jsonb_build_array(val)
      when 'int' then jsonb_typeof(val) = 'number'
        and (val #>> '{}')::numeric = trunc((val #>> '{}')::numeric)
        and (val #>> '{}')::numeric between (rule ->> 'min')::numeric and (rule ->> 'max')::numeric
        and (rule -> 'step' is null or mod((val #>> '{}')::numeric, (rule ->> 'step')::numeric) = 0)
      when 'intset' then jsonb_typeof(val) = 'number' and (rule -> 'v') @> jsonb_build_array(val)
      when 'date' then jsonb_typeof(val) = 'string' and val #>> '{}' = to_char(p_kst_date, 'YYYY-MM-DD')
      when 'week' then jsonb_typeof(val) = 'string'
        and val #>> '{}' = to_char(p_kst_date - (extract(isodow from p_kst_date)::integer - 1), 'YYYY-MM-DD')
      when 'hex64' then jsonb_typeof(val) = 'string' and val #>> '{}' ~ '^[0-9a-f]{64}$'
      when 'intarray' then jsonb_typeof(val) = 'array' and jsonb_array_length(val) = (rule ->> 'len')::integer
      else false end) then
      raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'value:' || key;
    end if;
    if rule ->> 't' = 'intarray' then
      seen := '{}';
      for item in select a.value from jsonb_array_elements(val) a loop
        if jsonb_typeof(item) <> 'number' then raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'value:' || key; end if;
        n := (item #>> '{}')::numeric;
        if n <> trunc(n) or n < (rule ->> 'min')::numeric or n > (rule ->> 'max')::numeric
          or ((rule ->> 'distinct')::boolean and n = any(seen)) then
          raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'value:' || key;
        end if;
        seen := seen || n;
      end loop;
    end if;
  end loop;
end $fn$;
revoke all on function public.chemi_chain_payload_check(text, jsonb, date) from public, anon, authenticated, service_role;
`;
}

async function loadSchema() {
  const mod = await import(pathToFileURL(SOURCE).href);
  return { schema: mod.CHEMI_CHAIN_SCHEMA, version: mod.CHEMI_CHAIN_SCHEMA_VERSION };
}

async function latestAllowMigration() {
  const files = (await readdir(MIGRATIONS)).filter((f) => f === FIRST || /^\d{14}_chemi_chain_allow_v\d+\.sql$/.test(f)).sort();
  if (!files.length) throw new Error("no chemi chain allow migration");
  return join(MIGRATIONS, files.at(-1));
}

async function main(argv) {
  const { schema, version } = await loadSchema();
  const sql = renderSql(schema, version);
  if (argv.includes("--check")) {
    const file = await latestAllowMigration();
    if ((await readFile(file, "utf8")) !== sql) {
      console.error(`chain_schema_drift: ${file} differs from chain-schema.ts — regenerate into a new chemi_chain_allow_v<n> migration`);
      process.exit(1);
    }
    console.log(`chain_schema_drift ok (${file.split("/").at(-1)})`);
    return;
  }
  const at = argv.indexOf("--out");
  const out = at >= 0 ? resolve(argv[at + 1]) : join(MIGRATIONS, FIRST);
  await writeFile(out, sql);
  console.log(`wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
