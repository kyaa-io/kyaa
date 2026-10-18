// Match known app markers only; ordinary mobile browsers keep their normal login flow.
export function requiresGoogleBrowserHandoff(userAgent: string): boolean {
  return /Instagram|KAKAOTALK|\bFBAN\/|\bFBAV\/|\bLine\//i.test(userAgent);
}
