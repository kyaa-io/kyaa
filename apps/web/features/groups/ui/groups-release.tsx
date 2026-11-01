"use client";
import { createContext, useContext, type ReactNode } from "react";
const GroupsReleaseContext=createContext(false);
export function GroupsReleaseProvider({enabled,children}:{enabled:boolean;children:ReactNode}){return <GroupsReleaseContext.Provider value={enabled}>{children}</GroupsReleaseContext.Provider>;}
export function useGroupsRelease(){return useContext(GroupsReleaseContext);}
