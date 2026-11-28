"use client";

import { createContext } from "react";

export const FanLayoutContext = createContext(false);

export const FanHeaderActionContext = createContext<HTMLElement | null>(null);
