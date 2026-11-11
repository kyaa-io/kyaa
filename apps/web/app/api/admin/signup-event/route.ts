import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
import { sourceSchema } from "@/server/signup-event/source-adapter";
import { ingestLocalSources } from "@/server/signup-event/local-store";
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

/** Admin-only ingestion of verified source records into the local file adapter. */
export async function PUT(request: Request) {
  if (!localSignupEnabled()) return new Response(null, { status: 404, headers });
  try {
    const admin = await authorizeLocalAdmin({ authorization: request.headers.get('authorization') ?? '', correlationId: crypto.randomUUID() });
    if (admin.role === 'viewer') return new Response(null, { status: 403, headers });
    const raw = JSON.parse(await boundedText(request, 16384));
    const parsed = sourceSchema.safeParse(raw);
    if (!parsed.success) return new Response(null, { status: 400, headers });
    await ingestLocalSources(parsed.data);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    const conflict=error instanceof Error && (error.message==='SIGNUP_EVENT_SOURCE_CONFLICT'||('code' in error && error.code==='EEXIST'));
    return new Response(null, { status: error instanceof AuthError ? error.status : conflict ? 409 : error instanceof SyntaxError ? 400 : 503, headers });
  }
}
