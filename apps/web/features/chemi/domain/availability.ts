import "server-only";
/** The 케미 tab is open only when CHEMI_TAB is exactly "true". Unset or any other value keeps it closed (production default). */
export function chemiEnabled() { return process.env.CHEMI_TAB === "true"; }
