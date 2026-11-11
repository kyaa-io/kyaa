import "server-only";

import { authorizeAdmin, type AdminRole } from "../../features/auth/domain/admin-authorization";
import { AuthError } from "../../features/auth/domain/auth-errors";
import { bearerToken, requireActiveMatchingUser, type AdminSessionRepository } from "../admin/admin-session-gate";
import { authenticatePrivyAccessToken, type PrivyAccessVerifier } from "../auth/authenticate-privy";
import { FAN_SESSION_BEARER } from "../auth/fan-session-cookie";

export interface ChannelOperatorRepository extends AdminSessionRepository {
  listActiveChannelIds(appUserId: string): Promise<string[]>;
  appendOperatorAudit(event: {
    actorAppUserId: string;
    actorAdminAllowlistId: string | null;
    correlationId: string;
    action: "operator.session.authorized";
    summary: { outcome: "authorized"; kind: "admin" | "operator"; channelCount: number };
  }): Promise<void>;
}

export interface ChannelSession {
  kind: "admin" | "operator";
  role: AdminRole;
  appUserId: string;
  allowlistId: string | null;
  email: string;
  /** Channels the session may act on; null means every channel (full admin). */
  channelIds: string[] | null;
}

/**
 * A full admin keeps the existing admin rules. Anyone else must hold an active
 * grant for the requested channel. Operators are not required to link Google.
 */
export async function authorizeChannelSession(input: {
  authorization: string;
  correlationId: string;
  celebrityId: string | null;
  verifier: PrivyAccessVerifier;
  repository: ChannelOperatorRepository;
}): Promise<ChannelSession> {
  const token = bearerToken(input.authorization);
  // Operator access always needs a live Privy token; the fan session cookie is for fan routes only.
  if (token === FAN_SESSION_BEARER) throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Authentication is required");
  const identity = await authenticatePrivyAccessToken(token, input.verifier);
  const user = requireActiveMatchingUser(
    await input.repository.findUserByPrivyId(identity.privyUserId),
    identity.verifiedEmail,
  );
  const entry = await input.repository.findActiveAdminByEmail(identity.verifiedEmail);
  // A viewer with an active channel grant acts as an operator for that channel only.
  const grantedChannels = entry?.role === "viewer" ? await input.repository.listActiveChannelIds(user.id) : [];
  if (entry && identity.googleLinked === true && grantedChannels.length === 0) {
    const admin = authorizeAdmin(identity, entry);
    await input.repository.appendOperatorAudit({
      actorAppUserId: user.id,
      actorAdminAllowlistId: admin.allowlistId,
      correlationId: input.correlationId,
      action: "operator.session.authorized",
      summary: { outcome: "authorized", kind: "admin", channelCount: 0 },
    });
    return { kind: "admin", role: admin.role, appUserId: user.id, allowlistId: admin.allowlistId, email: admin.email, channelIds: null };
  }

  const channelIds = grantedChannels.length > 0 ? grantedChannels : await input.repository.listActiveChannelIds(user.id);
  if (channelIds.length === 0 || (input.celebrityId !== null && !channelIds.includes(input.celebrityId))) {
    throw new AuthError("CHANNEL_OPERATOR_REQUIRED", 403, "An active channel operator grant is required");
  }
  await input.repository.appendOperatorAudit({
    actorAppUserId: user.id,
    actorAdminAllowlistId: null,
    correlationId: input.correlationId,
    action: "operator.session.authorized",
    summary: { outcome: "authorized", kind: "operator", channelCount: channelIds.length },
  });
  return { kind: "operator", role: "operator", appUserId: user.id, allowlistId: null, email: identity.verifiedEmail, channelIds };
}
