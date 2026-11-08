/** GA4 web stream measurement IDs only (kyaa.io G-HPXFR0PQP0, dev.kyaa.io G-WKSF9KP5QW); anything else means "no GA4". */
export const GA4_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{6,12}$/;

export function readGa4MeasurementId(value: string | undefined | null): string {
  const trimmed = value?.trim() ?? "";
  return GA4_MEASUREMENT_ID_PATTERN.test(trimmed) ? trimmed : "";
}
