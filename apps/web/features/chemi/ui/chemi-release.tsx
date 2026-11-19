"use client";
import { createContext, useContext, type ReactNode } from "react";
const ChemiReleaseContext=createContext(false);
export function ChemiReleaseProvider({enabled,children}:{enabled:boolean;children:ReactNode}){return <ChemiReleaseContext.Provider value={enabled}>{children}</ChemiReleaseContext.Provider>;}
export function useChemiRelease(){return useContext(ChemiReleaseContext);}
