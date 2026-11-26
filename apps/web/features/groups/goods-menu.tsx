"use client";
import { createContext, useContext, type ReactNode } from "react";
// 굿즈 메뉴는 서버 실행 환경 KYAA_GOODS_MENU 로 켠다. DEV 와 운영이 같은 이미지를 쓰므로 빌드 때 박는 값으로는 DEV 만 켤 수 없다.
const GoodsMenuContext = createContext(false);
export function GoodsMenuProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) { return <GoodsMenuContext.Provider value={enabled}>{children}</GoodsMenuContext.Provider>; }
export function useGoodsMenu() { return useContext(GoodsMenuContext); }
