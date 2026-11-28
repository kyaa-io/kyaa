import { AuthError } from "@/features/auth/domain/auth-errors";
import { createHomeNoticeAdminDependencies, createPublicHomeNoticeRepository } from "@/server/home-notice/home-notice-dependencies";
import { archiveDatabase, archiveRegistration } from "@/server/raffle/past-draw-archive";

export const dynamic = "force-dynamic";

function failure(status: number, code: string) {
  return Response.json({ error: { code } }, { status });
}

export async function POST(request: Request) {
  try {
    const dependencies = createHomeNoticeAdminDependencies();
    const session = await dependencies.authorize({
      authorization: request.headers.get("authorization") ?? "",
      correlationId: crypto.randomUUID(),
    });
    if (session.role !== "admin" && session.role !== "operator") return failure(403, "FORBIDDEN");
    const input = archiveRegistration.safeParse(await request.json().catch(() => null));
    if (!input.success) return failure(400, "INVALID_ARCHIVE_ROW");
    const row = input.data;
    row.source_id = row.source_id.toLowerCase();
    const db = archiveDatabase();
    if (row.source_kind === "notice" && row.source_id !== row.notice_slug) return failure(422, "SOURCE_REQUIRED");
    const notices = createPublicHomeNoticeRepository();

    const notice = await notices.findPublished("ko", row.notice_slug);
    const result = row.results_notice_slug && await notices.findPublished("ko", row.results_notice_slug);
    if (!notice || (row.results_notice_slug && !result)) return failure(422, "PUBLIC_NOTICE_REQUIRED");
    if (row.published && Date.parse(row.closes_at) > Date.now()) return failure(422, "ROUND_NOT_CLOSED");
    const { error } = await db.from("past_draw_archive").insert(row);
    if (error?.code === "23505") return failure(409, "ARCHIVE_ROUND_EXISTS");
    if (error) throw error;
    return new Response(null, { status: 201 });
  } catch (error) {
    return error instanceof AuthError ? failure(error.status, error.code) : failure(503, "ARCHIVE_UNAVAILABLE");
  }
}
