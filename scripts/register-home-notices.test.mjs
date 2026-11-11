import assert from "node:assert/strict";
import test from "node:test";
import { notices } from "./fixtures/home-notices-2026-11.mjs";
import { buildCleanupSql, buildDocument, buildSql, parseArgs } from "./register-home-notices.mjs";

const args = { actorEmail: "admin@example.com", origin: "https://kyaa.io" };

test("slug, 분류, 날짜, 한국어·영어 제목이 규칙을 지킨다", () => {
  const slugs = new Set();
  for (const n of notices) {
    assert.match(n.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!slugs.has(n.slug), `중복 slug ${n.slug}`);
    slugs.add(n.slug);
    assert.ok(["guide", "creator", "event", "update"].includes(n.category));
    assert.ok(!Number.isNaN(new Date(n.at).getTime()) && n.at.endsWith("+09:00"));
    for (const l of ["ko", "en"]) {
      assert.ok(n[l].title.length >= 1 && n[l].title.length <= 160, `${n.slug} ${l} 제목`);
      assert.ok(n[l].body.length > 0);
    }
  }
});

test("본문은 https 링크와 https 또는 공지 전용 정적 이미지만 쓰고, 이미지에는 대체 글이 있다", () => {
  for (const n of notices) for (const l of ["ko", "en"]) {
    const walk = (node) => {
      for (const mark of node.marks ?? []) if (mark.type === "link") assert.match(mark.attrs.href, /^https:\/\/[^\s/]+/, `${n.slug} 링크`);
      if (node.type === "image") {
        assert.match(node.attrs.src, /^(https:\/\/|\/images\/notices\/[a-z0-9-]+\.webp$)/, `${n.slug} 이미지`);
        assert.ok(node.attrs.alt.trim());
      }
      if (node.type === "heading") assert.ok([2, 3].includes(node.attrs.level));
      node.content?.forEach(walk);
    };
    walk(buildDocument(n[l].body, "https://kyaa.io"));
  }
});

test("한국어와 영어의 링크·이미지 개수가 같다", () => {
  const count = (body) => JSON.stringify(body).match(/\]\(|"img"/g)?.length ?? 0;
  for (const n of notices) assert.equal(count(n.ko.body), count(n.en.body), n.slug);
});

test("등록 SQL은 slug마다 한 번, 같은 slug는 건너뛰고 게시 시각을 원래 날짜로 맞춘다", () => {
  const sql = buildSql(args);
  for (const n of notices) {
    assert.equal(sql.split(`save_admin_home_notice(a.app_user_id, a.allowlist_id, extensions.gen_random_uuid(), null::uuid, null::integer, '${n.slug}'`).length - 1, 1);
    assert.ok(sql.includes(`'${new Date(n.at).toISOString()}'`));
  }
  assert.equal(sql.split("raise notice 'skip %'").length - 1, notices.length);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /commit;\n$/);
});

test("--only와 --origin이 적용되고, 잘못된 값은 거부한다", () => {
  const sql = buildSql({ ...args, origin: "https://dev.kyaa.io", only: ["guide-start-kyaa"] });
  assert.ok(sql.includes("https://dev.kyaa.io/guide"));
  assert.equal(sql.split("save_admin_home_notice(").length - 1, 1);
  assert.throws(() => buildSql({ ...args, only: ["nope"] }));
  assert.throws(() => buildSql({ ...args, actorEmail: "x'; drop table a;--" }));
  assert.throws(() => parseArgs(["--origin", "http://localhost:3000"]));
});

test("정리 SQL은 이 목록의 slug만 지운다", () => {
  const sql = buildCleanupSql();
  for (const n of notices) assert.ok(sql.includes(`'${n.slug}'`));
  assert.equal(sql.split("delete from").length - 1, 1);
});
