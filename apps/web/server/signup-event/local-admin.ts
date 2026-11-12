import { createBenefitAdminRouteDependencies } from '../g5/benefit-admin-route-dependencies';
export function authorizeLocalAdmin(input: { authorization: string; correlationId: string }) {
  return createBenefitAdminRouteDependencies().authorize(input);
}
