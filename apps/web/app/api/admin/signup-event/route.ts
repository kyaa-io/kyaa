import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
import { randomBytes } from 'node:crypto';
import { rafflePolicySchema, signupEvent } from '@/features/benefit/domain/signup-event';
import { createSignupRaffleDatabase, readSignupRaffleDraw, recordSignupRaffleDraw, signupRaffleAliasKey } from '@/server/signup-event/database';
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
    return new Response(maskedCsv(candidates(await readLocalSnapshot()), signupRaffleAliasKey()), { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="signup-participants.csv"' } });
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
    const database = createSignupRaffleDatabase();
    // A stored draw is the answer. It is looked up first, so a repeated request never depends on the current participants.
    let stored = await readSignupRaffleDraw(database);
    if (!stored) {
      const policy = rafflePolicySchema.parse({});
      // One draw per event, after it has closed. The database checks the close time again with its own clock.
      if (Date.now() <= Date.parse(policy.closesAt)) return new Response(null, { status: 409, headers });
      const snapshot = await readLocalSnapshot();
      // requestId stays in the input for the existing admin page, but the seed is always made here.
      const seed = randomBytes(32).toString('hex');
      const drawn = drawLocal(snapshot, parsed.data.quantity, seed).map(({ userId, entries }) => ({ userId, entries }));
      stored = await recordSignupRaffleDraw(database, { closesAt: policy.closesAt, seed, actor: admin.appUserId, allowlistId: admin.allowlistId, candidates: candidates(snapshot), winners: drawn });
    }
    const prizes=signupEvent.prizes.flatMap(prize=>Array.from({length:prize.quantity},()=>prize.usd));
    const winners = stored.winners.map((row,index)=>({...row,usd:prizes[index]}));
    return new Response(maskedCsv(winners, signupRaffleAliasKey()), { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="signup-winners.csv"' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'SIGNUP_RAFFLE_NOT_CLOSED') return new Response(null, { status: 409, headers });
    return new Response(null, { status: error instanceof AuthError ? error.status : error instanceof SyntaxError || (error instanceof Error && error.message === "INVALID_WINNER_QUANTITY") ? 400 : 503, headers });
  }
}

/** Client-supplied reward evidence is never accepted. */
export async function PUT() { return new Response(null, { status: localSignupEnabled() ? 405 : 404, headers }); }
