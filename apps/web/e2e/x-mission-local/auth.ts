export function useByUsAuth() {
 const authenticated = new URLSearchParams(location.search).get('state') !== 'guest';
 return { ready: true, authenticated, user: authenticated ? { id: 'fixture-owner' } : null, async getAccessToken() { return 'fixture-token'; } };
}
