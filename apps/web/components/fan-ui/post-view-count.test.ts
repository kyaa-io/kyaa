import {expect,it} from "vitest";
import {visiblePostViews} from "./post-view-count";
it("preserves measured counts and omits only missing or incomparable views",()=>{
 expect(visiblePostViews(2,3)).toBeUndefined();
 expect(visiblePostViews(3,3)).toBe(3);
 expect(visiblePostViews(4,3)).toBe(4);
 expect(visiblePostViews(0,0)).toBe(0);
 expect(visiblePostViews(undefined,3)).toBeUndefined();
 expect(visiblePostViews(null,3)).toBeUndefined();
 expect(visiblePostViews(2,undefined)).toBe(2);
});
