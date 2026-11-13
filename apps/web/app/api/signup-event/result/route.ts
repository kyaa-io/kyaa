import { createFanpageDependencies } from '@/server/fanpage/dependencies';
import { AuthError } from '@/features/auth/domain/auth-errors';
import { createSignupRaffleDatabase, readSignupRaffleDraw } from '@/server/signup-event/database';
import { localSignupEnabled, raffleChances, readLocalSnapshot } from '@/server/signup-event/local';
import { signupRaffleResultFor } from '@/server/signup-event/result';
export const dynamic = 'force-dynamic';
const headers = { 'cache-control': 'private, no-store', vary: 'Authorization' };
/** 내 래플 결과: 추첨 전 pending, 추첨 뒤 won(경품 금액)·lost·not-entered. 저장된 추첨 행만 읽고 여기서 뽑지 않는다. */
export async function GET(request: Request) {
  if (!localSignupEnabled()) return new Response(null, { status: 404, headers });
  try {
    const actor = await createFanpageDependencies().authorize(request.headers.get('authorization'));
    const draw = await readSignupRaffleDraw(createSignupRaffleDatabase());
    const result = await signupRaffleResultFor(actor.appUserId, draw, async () => raffleChances(await readLocalSnapshot(actor.appUserId)).some(row => row.userId === actor.appUserId));
    return Response.json(result, { headers });
  } catch (error) {
    return new Response(null, { status: error instanceof AuthError ? error.status : 503, headers });
  }
}
