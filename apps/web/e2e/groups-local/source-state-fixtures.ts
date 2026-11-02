// Local-only response projections. Never import this module into production routes.
const id = 'e9200000-0000-4000-8000-000000000001';
const past = '2026-10-31T09:00:00Z', future = '2100-11-07T09:00:00Z';
export const SOURCE_STATE_NODES = {
 presence: ['SngLG', 'xAu5O', 'GKoWu', 'ALGft'],
 liveAndMedia: ['onxeg', 'KdGqe', 'OWIeU', 'y4h7Pi'],
 wallet: ['QnIgR', 'fMkHm', 'QnKkN', 'cPjvM', 'Vgw4h', 'u8Qcg', 'iboGb', 'NcJxO'],
 capsule: ['ucP58', 'X4Esx', 'cRVyO', 'es3y5', 'hh3j5', 'We1zf', 'y1OksT', 'S38b4C'],
 raffle: ['cWqGx', 'dlTRh', 'i0KaKL', 'DvkSA', 'bbw1R', 'qUpqC', 'TgOcH', 'PmqiW', 'KzjUJ', 'viakp', 'I3IJgL', 'okmrJ', 'A2ESmc', 'FesQb', 'Z3MtE', 'PRK1L'],
 application: ['HtWDL', 'XbwIn', 'D9f8Z', 'yzIoG'],
 join: ['rQ0kj', 'LAbTd'],
 social: ['o44v7C', 'm5aSk', 'VQfTU', 'JI7Qt', 'DeQ3f', 'qIcNQ', 's1KGd8'],
} as const;
const known = new Set<string>(Object.values(SOURCE_STATE_NODES).flat());
type ObjectBody = Record<string, unknown>;
const object = (value: unknown): ObjectBody => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectBody : {};
const rows = (value: unknown): ObjectBody[] => Array.isArray(value) ? value.map(object) : [];

/** Deterministic failures run before the underlying local fixture mutates its in-memory data. */
export function sourceStateFailure(url: URL, method: string, state: string | null): Response | undefined {
 const node = state?.replace(/^source-/, '') ?? '';
 if (!known.has(node) || !url.pathname.startsWith('/api/')) return;
 const path = url.pathname, verb = method.toUpperCase(), get = verb === 'GET';
 const fail = (code: string, status = 503) => Response.json({ error: { code } }, { status, headers: { 'x-kyaa-local-source-state': node } });
 if (node === 'ALGft' && path === '/api/groups/me/presence' && !get) return fail('GROUPS_UNAVAILABLE');
 if (node === 'QnIgR' && path === '/api/me/wallet' && get) return fail('GROUP_WALLET_UNAVAILABLE');
 if (node === 'iboGb' && path === '/api/me/wallet/history' && get) return fail('GROUP_WALLET_UNAVAILABLE');
 if (node === 'QnKkN' && path === '/api/me/wallet/exchange' && verb === 'POST') return fail('GROUP_WALLET_INVALID', 409);
 if (node === 'cPjvM' && (path === '/api/me/wallet/exchange' || path.startsWith('/api/me/wallet/requests/'))) return fail('GROUP_WALLET_UNAVAILABLE');
 if (node === 'ucP58' && /\/capsules\/[^/]+\/draw$/.test(path) && verb === 'POST') return fail('GROUP_WALLET_INSUFFICIENT_BALANCE', 409);
 if (node === 'We1zf' && path.startsWith('/api/me/wallet/capsule-requests/')) return fail('CAPSULE_UNAVAILABLE');
 if (node === 'I3IJgL' && /\/raffles\/[^/]+\/entries$/.test(path)) return fail('GROUP_RAFFLE_UNAVAILABLE');
 if (node === 'FesQb' && /\/groups\/[^/]+\/raffles$/.test(path) && verb === 'POST') return fail('GROUP_RAFFLE_INVALID', 409);
 if (node === 'HtWDL' && path === '/api/groups/applications' && verb === 'POST') return fail('GROUPS_UNAVAILABLE');
 if (node === 'LAbTd' && /\/groups\/[^/]+\/membership$/.test(path) && verb === 'POST') return fail('GROUPS_UNAVAILABLE');
 if (node === 'DeQ3f' && /\/me\/social\/conversations\/[^/]+\/messages$/.test(path) && verb === 'POST') return fail('SOCIAL_UNAVAILABLE');
 return undefined;
}

/** Release only the initial source projection once its matching local mutation succeeds. */
export function sourceStateResolved(response: Response, url: URL, method: string, state: string | null): boolean {
 const node = state?.replace(/^source-/, ''), verb = method.toUpperCase();
 return response.ok && ((['VQfTU', 'JI7Qt'].includes(node ?? '') && verb === 'PATCH' && /^\/api\/me\/social\/conversations\/[^/]+$/.test(url.pathname))
  || (node === 'rQ0kj' && verb === 'POST' && /^\/api\/groups\/[^/]+\/membership$/.test(url.pathname)));
}

/** state=<Pencil ID> or source-<ID>; fixtureDelayMs is capped to keep loading finite. */
export async function sourceStateResponse(response: Response, url: URL, method: string, state: string | null): Promise<Response> {
 const node = state?.replace(/^source-/, '') ?? '';
 if (!known.has(node) || !url.pathname.startsWith('/api/')) return response;
 const failure = sourceStateFailure(url, method, state);
 if (failure) return failure;
 const path = url.pathname, verb = method.toUpperCase(), get = verb === 'GET';
 const headers = new Headers(response.headers); headers.delete('content-length'); headers.set('x-kyaa-local-source-state', node);
 const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
 const fail = (code: string, status = 503) => reply({ error: { code } }, status);
 const delay = async () => {
  const requested = Number(url.searchParams.get('fixtureDelayMs') ?? 1200);
  await new Promise(resolve => setTimeout(resolve, Number.isFinite(requested) ? Math.min(1200, Math.max(0, requested)) : 1200));
 };
 if (node === 'NcJxO' && path === '/api/me/wallet/check-in' && verb === 'POST') await delay();
 if (['es3y5', 'We1zf'].includes(node) && /\/capsules\/[^/]+\/draw$/.test(path) && verb === 'POST') return fail('CAPSULE_UNAVAILABLE');
 if (node === 'XbwIn' && path === '/api/groups/applications' && verb === 'POST') await delay();
 if (node === 'rQ0kj' && /\/groups\/[^/]+\/membership$/.test(path) && verb === 'POST') await delay();
 let body: ObjectBody;
 try { body = object(await response.clone().json()); } catch { return response; }
 if (['SngLG', 'xAu5O', 'GKoWu'].includes(node) && get && /\/groups\/[^/]+\/presence$/.test(path)) {
  return reply({ ...body, onlineCount: typeof body.onlineCount === 'number' ? body.onlineCount : 12, todayCount: typeof body.todayCount === 'number' ? body.todayCount : 128,
   artists: node === 'GKoWu' ? [] : [{ profileId: id, nickname: '엔카이브', online: node === 'SngLG', visitedToday: true }] });
 }
 if (node === 'ALGft' && get && path === '/api/groups/me/presence') return reply({ enabled: true, canConfigure: true });
 if (node === 'y4h7Pi' && get && (/\/celebrities\/[^/]+\/(youtube|media|replays|chzzk)$/.test(path) || path === '/api/live-events')) {
  return reply(path === '/api/live-events' ? { ...body, catalog: { liveNow: [], upcoming: [], replay: [] } } : { ...body, items: [], nextCursor: null });
 }
 if (['onxeg', 'KdGqe', 'OWIeU'].includes(node) && get && path === '/api/live-events') {
  const catalog = object(body.catalog), items = [...rows(catalog.liveNow), ...rows(catalog.upcoming), ...rows(catalog.replay)];
  const scheduled = node === 'onxeg';
  const projected = items.slice(0, 1).map(item => {
   const live = object(item.live), watch = object(live.watch);
   return { ...item, live: { ...live, effectiveStatus: scheduled ? 'scheduled' : 'ended', startsAt: scheduled ? future : past, endsAt: scheduled ? null : past,
    reservationClosesAt: scheduled ? future : past, watch: { ...watch, available: node === 'KdGqe', mode: node === 'KdGqe' ? 'replay' : 'unavailable', ...(node === 'KdGqe' ? { url: 'https://www.youtube.com/watch?v=llP16jxxEsU' } : {}) } }, primaryAction: scheduled ? 'reserve' : 'live_ended' };
  });
  return reply({ ...body, catalog: { ...catalog, liveNow: [], upcoming: scheduled ? projected : [], replay: scheduled ? [] : projected } });
 }
 if (get && path === '/api/me/wallet') {
  if (node === 'u8Qcg') {
   const attendance = object(body.attendance), days = rows(attendance.days), date = String(attendance.date ?? '2026-11-07');
   return reply({ ...body, attendance: { ...attendance, checkedIn: true, streak: 7, nextBonusIn: 7, days: [...days.filter(day => day.date !== date), { date, points: 30 }] } });
  }
  if (node === 'viakp') return reply({ ...body, tickets: 0 });
 }
 if (['hh3j5', 'y1OksT'].includes(node) && (/\/capsules\/[^/]+\/draw$/.test(path) || path.startsWith('/api/me/wallet/capsule-requests/'))) {
  return reply({ ...body, results: rows(body.results).map(item => ({ ...item, prizeId: null, name: null, imageUrl: null })) });
 }
 if (get && /\/groups\/[^/]+\/raffles\/[^/]+$/.test(path) && SOURCE_STATE_NODES.raffle.includes(node as typeof SOURCE_STATE_NODES.raffle[number])) {
  const raffle = object(body.raffle);
  if (!raffle.id) return response;
  if (['cWqGx', 'dlTRh'].includes(node)) return reply({ ...body, raffle: { ...raffle, status: 'closed', entryClosesAt: past, resultsPublishedAt: past }, enteredTickets: 1, member: true, canEnter: false,
   winner: { id, status: node === 'dlTRh' ? 'expired' : 'information_required', submitBy: node === 'dlTRh' ? past : future } });
  if (node === 'Z3MtE') return reply({ ...body, raffle: { ...raffle, perFanTicketLimit: 1 }, enteredTickets: 0 });
  if (node === 'KzjUJ') return reply({ ...body, raffle: { ...raffle, perFanTicketLimit: 30 }, enteredTickets: 30 });
  if (['i0KaKL', 'DvkSA', 'bbw1R', 'PmqiW', 'okmrJ'].includes(node)) return reply({ ...body, raffle: { ...raffle,
   status: node === 'bbw1R' ? 'cancelled' : 'closed', entryClosesAt: past, resultsPublishedAt: node === 'DvkSA' ? past : null },
   enteredTickets: 30, winner: null, canEnter: false });
 }
 if (node === 'TgOcH' && /\/groups\/[^/]+\/raffles\/[^/]+\/entries$/.test(path) && verb === 'POST') {
  // The wrapper supplies submitted quantity because this response-only hook cannot read RequestInit.body.
  const amount = Number(url.searchParams.get('fixtureAmount') ?? 1);
  if (!Number.isInteger(amount) || amount < 1 || amount > 12) return fail('GROUP_RAFFLE_INVALID', 409);
  return reply({ id, amount, enteredTickets: 30 + amount, tickets: 12 - amount });
 }
 if (['A2ESmc', 'PRK1L'].includes(node) && /\/groups\/[^/]+\/raffles$/.test(path) && verb === 'POST') return reply({ id });
 if (['D9f8Z', 'yzIoG', 'XbwIn'].includes(node) && path === '/api/groups/applications' && verb === 'POST') return reply({ id, status: 'submitted', pageId: null });
 if (node === 'rQ0kj' && /\/groups\/[^/]+\/membership$/.test(path) && verb === 'POST') return reply({ joined: true });
 if (['rQ0kj', 'LAbTd'].includes(node) && get && /^\/api\/groups\/[^/]+$/.test(path)) return reply({ ...body, membership: null });
 if (['o44v7C', 'm5aSk', 'qIcNQ'].includes(node) && get && path === '/api/me/social/friends') return reply({ ...body,
  friendships: node === 'qIcNQ' ? [] : rows(body.friendships).map(item => ({ ...item, status: node === 'o44v7C' ? 'incoming' : 'outgoing' })) });
 if (['VQfTU', 'JI7Qt'].includes(node) && get && path === '/api/me/social/conversations') return reply({ ...body,
  conversations: rows(body.conversations).map(item => ({ ...item, status: node === 'VQfTU' ? 'incoming_request' : 'outgoing_request', canSend: false })) });
 if (node === 's1KGd8' && get && path.startsWith('/api/me/social/profiles/')) return reply({ ...body,
  dm: { ...object(body.dm), canSend: false }, capabilities: { ...object(body.capabilities), canRequestDm: false } });
 return response;
}
