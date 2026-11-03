import "server-only";
export function groupsEnabled() { return process.env.KYAA_GROUPS_ENABLED === "true"; }
