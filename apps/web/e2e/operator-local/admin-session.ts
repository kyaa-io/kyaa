// Synthetic fixture only: a full-admin session without any real account.
export function useAdminSession() {
  const role = new URLSearchParams(location.search).get('role') === 'viewer' ? 'viewer' : 'admin';
  return { status: 'authorized', admin: { role, email: 'synthetic-admin@example.test' } };
}
