import { localSignupEnabled } from '@/server/signup-event/local';
export async function POST() {
  return new Response(null, { status: localSignupEnabled() ? 410 : 404, headers: { 'cache-control': 'no-store' } });
}
