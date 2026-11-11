// Executes the migration's page query in memory; production PostgreSQL deployment remains a separate check.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("only lists explicitly consented, approved proofs, including after consent withdrawal", () => {
  const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261222163000_proof_board_reward_points.sql"), "utf8");
  const page = sql.split("with page as (")[1].split("))\n  select")[0] + ")";
  const query = page.replaceAll("public.", "").replaceAll("::text", "")
    .replace(/\bp_(celebrity|viewer|before|limit)\b/g, ":$1");
  const db = new DatabaseSync(":memory:");
  db.function("least", { varargs: true }, (...values) => Math.min(...values.map(Number)));
  db.function("greatest", { varargs: true }, (...values) => Math.max(...values.map(Number)));
  db.function("fan_web_blocked", { varargs: true }, () => 0);
  try {
    db.exec(`
      create table fan_posts(id text, app_user_id text, body text, created_at text, source_id text, source_type text, celebrity_id text, category text, visibility text, deleted_at text, hidden_at text);
      create table certification_submissions(id text, app_user_id text, proof_type text, amount_visible integer, status text, publish_consent integer);
      create table dukjil_action_log(app_user_id text, action_key text, source_key text, stamp_id text);
      create table community_stamps(id text, revoked_at text);
      insert into fan_posts values ('post','owner','body','2026-11-11','submission','certification_submission','creator','proof','public',null,null);
      insert into certification_submissions values ('submission','owner','receipt',0,'pending',0);
    `);
    const read = () => db.prepare(query).all({ celebrity: "creator", viewer: null, before: null, limit: 20 });
    for (const status of ["pending", "in_review", "changes_requested", "rejected", "approved"]) {
      for (const consent of [null, 0, 1]) {
        db.prepare("update certification_submissions set status=?, publish_consent=?").run(status, consent);
        expect(read().length, `${status}/${consent}`).toBe(status === "approved" && consent === 1 ? 1 : 0);
      }
    }
    db.exec("update certification_submissions set publish_consent=0");
    expect(read()).toHaveLength(0);
  } finally { db.close(); }
});
