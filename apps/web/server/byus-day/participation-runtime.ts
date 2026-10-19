import "server-only";
import { createFanpageDependencies } from "../fanpage/dependencies";
import { createParticipationAdminHandler, createParticipationHandler, participationFailure } from "./participation-route";

export async function handleParticipation(request: Request, admin = false) {
  try {
    const dependencies = createFanpageDependencies();
    return await (admin ? createParticipationAdminHandler(dependencies) : createParticipationHandler(dependencies))(request);
  } catch { return participationFailure("PARTICIPATION_UNAVAILABLE", 503); }
}
