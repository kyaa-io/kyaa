import { describe, expect, it } from "vitest";
import { threadComments } from "./comment-thread";

const c = (id: string, createdAt: string, parentId: string | null = null) => ({ id, createdAt, parentId });
describe("threadComments", () => {
  it("puts replies under their parent, oldest reply first, and keeps parent order", () => {
    const page = [c("r2", "2026-11-05T10:20:00Z", "p1"), c("p2", "2026-11-05T10:15:00Z"), c("r1", "2026-11-05T10:10:00Z", "p1"), c("p1", "2026-11-05T10:00:00Z")];
    expect(threadComments(page).map(item => item.id)).toEqual(["p2", "p1", "r1", "r2"]);
  });
  it("keeps a reply in place when its parent is not on the page", () => {
    const page = [c("a", "2026-11-05T10:20:00Z"), c("orphan", "2026-11-05T10:10:00Z", "gone")];
    expect(threadComments(page).map(item => item.id)).toEqual(["a", "orphan"]);
  });
  it("puts a reply to a reply under the topmost parent instead of dropping it", () => {
    const page = [c("rr", "2026-11-05T10:30:00Z", "r1"), c("r1", "2026-11-05T10:10:00Z", "p1"), c("p1", "2026-11-05T10:00:00Z")];
    expect(threadComments(page).map(item => item.id)).toEqual(["p1", "r1", "rr"]);
  });
  it("groups a reply to a reply under the topmost reply when its chain ends at a missing parent", () => {
    const page = [c("rr", "2026-11-05T10:30:00Z", "r1"), c("r1", "2026-11-05T10:10:00Z", "gone")];
    expect(threadComments(page).map(item => item.id)).toEqual(["r1", "rr"]);
  });
  it("shows every item once when parents form a loop, point to themselves or ids repeat", () => {
    const page = [c("a", "2026-11-05T10:00:00Z", "b"), c("b", "2026-11-05T10:01:00Z", "a"), c("s", "2026-11-05T10:02:00Z", "s"), c("a", "2026-11-05T10:00:00Z", "b")];
    expect(threadComments(page).map(item => item.id).sort()).toEqual(["a", "b", "s"]);
  });
  it("returns every id exactly once for mixed inputs", () => {
    const page = [c("e", "5", "d"), c("d", "4", "c"), c("c", "3", "x"), c("b", "2", "a"), c("a", "1")];
    const ids = threadComments(page).map(item => item.id);
    expect([...ids].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});
