import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
import { signupEvent } from '@/features/benefit/domain/signup-event';
import { z } from "zod";
import { authorizeLocalAdmin } from '@/server/signup-event/local-admin';
import { AuthError } from '@/features/auth/domain/auth-errors';
import { candidates, drawLocal, localSignupEnabled, maskedCsv, readLocalSnapshot } from '@/server/signup-event/local';
const drawInput = z.object({ quantity: z.literal(17), requestId: z.uuid() }).strict();
export const dynamic = 'force-dynamic';
const headers = { 'cache-control': 'private, no-store', vary: 'Authorization' };
export async function GET(request: Request) {
  if (!localSignupEnabled()) return new Response(null, { status: 404, headers });
  try {
    await authorizeLocalAdmin({ authorization: request.headers.get('authorization') ?? '', correlationId: crypto.randomUUID() });
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== 'kind') || params.getAll('kind').length > 1) return new Response(null, { status: 400, headers });
    const kind = params.get('kind') ?? 'participants';
    if (kind !== 'participants') return new Response(null, { status: 400, headers });
    return new Response(maskedCsv(candidates(await readLocalSnapshot())), { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="signup-participants.csv"' } });
  } catch (error) {
    return new Response(null, { status: error instanceof AuthError ? error.status : error instanceof SyntaxError || (error instanceof Error && error.message === "INVALID_WINNER_QUANTITY") ? 400 : 503, headers });
  }
}

export async function POST(request: Request) {
  if (!localSignupEnabled()) return new Response(null, { status: 404, headers });
  try {
    const admin = await authorizeLocalAdmin({ authorization: request.headers.get('authorization') ?? '', correlationId: crypto.randomUUID() });
    if (admin.role === 'viewer') return new Response(null, { status: 403, headers });
    const input = JSON.parse(await boundedText(request, 1024));
    const parsed = drawInput.safeParse(input);
    if (!parsed.success) return new Response(null, { status: 400, headers });
    const prizes=signupEvent.prizes.flatMap(prize=>Array.from({length:prize.quantity},()=>prize.usd));
    const winners = drawLocal(await readLocalSnapshot(), parsed.data.quantity, parsed.data.requestId).map((row,index)=>({...row,usd:prizes[index]}));
    return new Response(maskedCsv(winners), { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="signup-winners.csv"' } });
  } catch (error) {
    return new Response(null, { status: error instanceof AuthError ? error.status : error instanceof SyntaxError || (error instanceof Error && error.message === "INVALID_WINNER_QUANTITY") ? 400 : 503, headers });
  }
}

/** Client-supplied reward evidence is never accepted. */
export async function PUT() { return new Response(null, { status: localSignupEnabled() ? 405 : 404, headers }); }
