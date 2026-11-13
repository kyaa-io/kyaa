export {};
// Local fixture only: no real account or API writes.
const params = new URLSearchParams(location.search);
let completed = params.get('state') === 'done';
const result = { reactionId: '00000000-0000-4000-8000-000000000001', status: 'completed', mintStatus: 'queued', blockchainJobId: null, created: true, passportExists: false };
const actualFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
 const url = String(input);
 if (!url.startsWith('/api/celebrities/x-mission-1113/')) return actualFetch(input, init);
 if (params.get('state') === 'error') return new Response(null, { status: 503 });
 if (url.includes('/fans')) return Response.json({ likeCount: completed ? 8 : 7 });
 if (init?.method === 'POST') { completed = true; return Response.json(result); }
 return Response.json({ reaction: completed ? result : null });
};
