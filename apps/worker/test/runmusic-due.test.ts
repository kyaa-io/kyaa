import { expect, it, vi } from "vitest";
import { runRunmusicDueOnce } from "../src/runmusic-due.js";
import type { NotificationWorkerEnv } from "../src/notification-env.js";
const env = {} as NotificationWorkerEnv;
const result = { published: true, drawId: "11111111-1111-4111-8111-111111111111", notificationCount: 3, purgedCount: 2 };
it("delegates clock and dedupe to the RPC and keeps purging on subsequent ticks", async () => {
  const rpc = vi.fn().mockResolvedValueOnce({data:result,error:null}).mockResolvedValueOnce({data:2,error:null})
    .mockResolvedValueOnce({data:{...result,published:false,notificationCount:0,purgedCount:0},error:null}).mockResolvedValueOnce({data:0,error:null});
  expect(await runRunmusicDueOnce(env,{rpc} as never)).toBe(3);
  expect(await runRunmusicDueOnce(env,{rpc} as never)).toBe(0);
  expect(rpc.mock.calls).toEqual([["process_due_runmusic"],["purge_due_runmusic_contacts"],["process_due_runmusic"],["purge_due_runmusic_contacts"]]);
});
it("still purges when due processing fails and redacts database details", async () => {
  const rpc = vi.fn().mockRejectedValueOnce(new Error("private detail")).mockResolvedValueOnce({data:0,error:null});
  await expect(runRunmusicDueOnce(env,{rpc} as never)).rejects.toThrow("RUNMUSIC_MAINTENANCE_UNAVAILABLE");
  expect(rpc).toHaveBeenCalledWith("purge_due_runmusic_contacts");
});
it.each([null,{...result,notificationCount:-1},{...result,drawId:"bad"}])("rejects an invalid due result", async(data) => {
  const rpc = vi.fn().mockResolvedValueOnce({data,error:null}).mockResolvedValueOnce({data:0,error:null});
  await expect(runRunmusicDueOnce(env,{rpc} as never)).rejects.toThrow("RUNMUSIC_MAINTENANCE_UNAVAILABLE");
});
