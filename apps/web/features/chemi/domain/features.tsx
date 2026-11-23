"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * 케미 화면 안에서 운영 조합에 따라 닫는 기능. 값은 서버 `chemiFeatures()`(availability.ts)가 정하고 `app/chemi/layout.tsx` 가 내려 준다.
 * ask: 질문하기(결과 주 버튼·더 깊이 결과·주소 진입) · reminders: '내일 알려 줘'(발송 예약이 dev 에만 있음)
 * 감싸지 않은 시험 렌더는 DEV 조합과 같게 둘 다 연다.
 */
export type ChemiFeatures = { ask: boolean; reminders: boolean };

const ChemiFeaturesContext = createContext<ChemiFeatures>({ ask: true, reminders: true });

export function ChemiFeaturesProvider({ value, children }: Readonly<{ value: ChemiFeatures; children: ReactNode }>) {
  return <ChemiFeaturesContext.Provider value={value}>{children}</ChemiFeaturesContext.Provider>;
}

export function useChemiFeatures() {
  return useContext(ChemiFeaturesContext);
}
