"use client";

import { createContext, useContext } from "react";

const MileageDisplay = createContext(false);

export const MileageDisplayProvider = MileageDisplay.Provider;

export function useMileageDisplay() {
  return useContext(MileageDisplay);
}
