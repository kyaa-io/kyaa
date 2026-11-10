import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261220160000_home_notice_participation.sql"), "utf8");
it("keeps participation separate from the CMS source and uses two protected tables", () => {
  expect(sql.match(/create table public\.home_notice_/g)).toHaveLength(2);
  for (const table of ["home_notice_comments", "home_notice_reactions"]) {
    expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toContain(`alter table public.${table} force row level security`);
  }
  expect(sql).toContain("from public,anon,authenticated,service_role");
  expect(sql).not.toMatch(/(?:insert into|update|delete from) public\.home_notice(?:s|_localizations)\b/);
  expect(sql).not.toContain("celebrity_notice_comments");
  expect(sql).toContain("create trigger ugc_body_filter before insert or update on public.home_notice_comments");
  expect(sql).toContain("for each row execute function public.guard_ugc_body()");
});
it("serializes user writes, preserves retry identity and rechecks publication for every write", () => {
  expect(sql).toContain("unique (app_user_id, idempotency_key)");
  for (const name of ["post_home_notice_comment", "remove_home_notice_comment", "set_home_notice_reaction"]) {
    const fn = sql.split(`create function public.${name}`)[1]!.split("end $$;")[0]!;
    expect(fn).toContain("perform public.fan_web_lock_active_user(p_app_user_id)");
    expect(fn).toContain("publication_status='published' and archived_at is null for share");
    expect(fn).toContain("security definer set search_path=''");
  }
  expect(sql).toContain("v_existing.notice_id<>v_id or v_existing.body<>v_body");
  expect(sql).toContain("where id=p_comment_id and app_user_id=p_app_user_id and deleted_at is null");
  expect(sql).toContain("v_previous is distinct from nullif(p_reaction,'none')");
  expect(sql).toContain("'dislikeCount',null");
});
it("sets explicit owner access, rate limits and account deletion handling without new rewards", () => {
  expect(sql).toContain("'home_participation_owner_'||me");
  expect(sql).toContain("'public.fan_web_lock_active_user(uuid)'::regprocedure");
  expect(sql).toContain("'public.fan_web_blocked(uuid,uuid)'::regprocedure");
  expect(sql).toContain(")>=10 then raise exception 'FAN_WEB_RATE_LIMITED'");
  expect(sql).toContain(")>=30 then raise exception 'FAN_WEB_RATE_LIMITED'");
  expect(sql).toContain("create trigger app_users_scrub_home_notice_participation");
  expect(sql).not.toMatch(/award_|issue_.*stamp|grant.*points/);
});
