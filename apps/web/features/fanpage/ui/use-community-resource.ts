"use client";
import { useEffect, useRef } from "react";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { subscribeFanActivityUpdates } from "@/components/fan-ui/fan-activity-updates";
import { useFanpageResource } from "./use-fanpage-resource";

/** Refresh on return visits and local fan actions, without a chat polling loop. */
export function useCommunityResource<T>(url: string, parse: (value: unknown) => T, keepPreviousData = true, invalidateOnMutation = false) {
  const auth = usePrivy();
  const resource = useFanpageResource(url, parse, keepPreviousData);
  const refresh = useRef(resource.retry);
  const invalidate = useRef(resource.invalidate);
  useEffect(() => { invalidate.current = resource.invalidate; }, [resource.invalidate]);
  useEffect(() => { refresh.current = resource.retry; }, [resource.retry]);
  useEffect(() => subscribeFanActivityUpdates(auth.user?.id, reason => { if (invalidateOnMutation && reason === "mutation") invalidate.current(); else refresh.current(); }, "community"), [auth.user?.id, url, invalidateOnMutation]);
  return resource;
}
