// Synthetic disabled mission-book source. Product card renders its normal off-policy state.
export function useGroupResource<T>(_path: string | null, _parse: (value: unknown) => T) { return {data: undefined as T | undefined, error:undefined, loading:false, retry:()=>{}}; }
export function useGroupRequest() { return {ready:true,authenticated:false,request:async()=>({})}; }
export class GroupRequestError extends Error {}
