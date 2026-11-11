const headers = { "cache-control": "private, no-store" } as const;

/** 닫힌 비밀방은 오류가 아니라 정상 응답이다: 목록은 200 + 빈 목록, 쓰기·단건은 423. 5xx로 답하면 ALB 경보와 화면 로딩 대기가 생긴다. */
export function secretRoomClosedResponse(method: string, list: boolean): Response {
  if (list && (method === "GET" || method === "HEAD")) return Response.json({ closed: true, roomCount: 0, items: [], rooms: [] }, { headers });
  return Response.json({ error: { code: "SECRET_ROOM_COMING_SOON", message: "준비 중" } }, { status: 423, headers });
}
