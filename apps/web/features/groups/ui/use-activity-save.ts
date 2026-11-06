"use client";
import { useRef, useState } from "react";
import { z } from "zod";
import { useGroupRequest } from "./use-group-resource";

/** 활동 저장 한 번. 실패한 입력을 그대로 다시 보내면 같은 요청 번호를 쓴다. */
export function useActivitySave() {
  const auth = useGroupRequest(), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), operation = useRef<{ key: string; requestId: string } | undefined>(undefined), running = useRef(false);
  const save = async <T = unknown,>(path: string, method: string, input: Record<string, unknown>, done: (value: T) => void, parse: (value: unknown) => T = value => z.object({ id: z.uuid() }).parse(value) as T) => {
    if (running.current) return;
    running.current = true;
    const key = JSON.stringify([path, method, input]);
    if (operation.current?.key !== key) operation.current = { key, requestId: crypto.randomUUID() };
    setBusy(true); setFailed(false);
    try {
      const result = parse(await auth.request(path, { method, body: JSON.stringify({ ...input, requestId: operation.current.requestId }) }));
      operation.current = undefined;
      done(result);
    } catch { setFailed(true); } finally { running.current = false; setBusy(false); }
  };
  return { busy, failed, save };
}
