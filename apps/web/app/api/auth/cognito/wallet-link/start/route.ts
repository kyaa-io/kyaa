import { walletLink } from "../../../../../../server/auth/cognito/wallet-link";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => walletLink(request);
