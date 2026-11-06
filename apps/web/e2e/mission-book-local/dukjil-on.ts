import type { ReactNode } from "react";
export const useDukjil = () => ({ status: "on" as const });
export const DukjilProvider = ({ children }: { children: ReactNode }) => children;
export const useDukjilStatus = () => "on" as const;
