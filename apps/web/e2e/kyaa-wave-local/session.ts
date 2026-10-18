const guest = { ready: true, pending: false, ownerId: null, generation: 0 };
const member = { ...guest, ownerId: "kyaa-wave-local-user" };
export function useByUsSession() { return new URLSearchParams(location.search).get("auth") === "1" ? member : guest; }
