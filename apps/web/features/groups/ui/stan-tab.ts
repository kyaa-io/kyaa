/** The 덕질 secondary tabs (plan-ux r5.1 3.2): 오늘 · 내역. 응모권 (A8) is not drawn until it exists — no empty tab. Shared by the server page and the screen. */
export type StanTab = "today" | "history";
export const parseStanTab = (value: unknown): StanTab => value === "history" ? "history" : "today";
