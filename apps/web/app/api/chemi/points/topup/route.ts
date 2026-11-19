import { z } from "zod";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open") }).strict(),
  z.object({ action: z.literal("balances") }).strict(),
  z.object({ action: z.literal("refresh"), orderId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("confirm"), orderId: z.string().uuid(), amount: z.literal(1000), paymentKey: z.string().min(1).max(200) }).strict(),
]);
const provider = "https://api.tosspayments.com/v1/payments";
export async function POST(request: Request) {
  if (!chemiEnabled() || process.env.APP_ENV !== "dev") return new Response(null, { status: 404 });
  const secret = process.env.TOSS_SECRET_KEY;
  const clientKey = process.env.TOSS_CLIENT_KEY;
  if (!secret?.startsWith("test_sk_") || !clientKey?.startsWith("test_ck_")) return new Response(null, { status: 503 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const deps = createFanpageDependencies();
  const user = await deps.authorize(request.headers.get("authorization")).catch(() => null);
  if (!user) return new Response(null, { status: 401 });
  const owner = { p_owner: user.appUserId };
  const body = parsed.data;
  if (body.action === "open") {
    const orderId = await deps.rpc("chemi_open_point_order", owner);
    return Response.json({ orderId, amount: 1000, orderName: "포인트 100P", clientKey });
  }
  if (body.action === "balances") return Response.json({ balances: await deps.rpc("chemi_point_balances", owner) });
  const order = { ...owner, p_order: body.orderId };
  if (!(await deps.rpc("chemi_owned_point_order", order))) return new Response(null, { status: 404 });
  const headers = { Authorization: "Basic " + Buffer.from(secret + ":").toString("base64"), "Content-Type": "application/json" };
  if (body.action === "confirm") {
    await fetch(provider + "/confirm", { method: "POST", headers: { ...headers, "Idempotency-Key": body.orderId },
      body: JSON.stringify({ orderId: body.orderId, paymentKey: body.paymentKey, amount: body.amount }) }).catch(() => undefined);
  }
  const snapshot = await fetch(provider + "/orders/" + body.orderId, { headers, cache: "no-store" });
  if (!snapshot.ok) return new Response(null, { status: 502 });
  const payment = await snapshot.json();
  if (payment.orderId !== body.orderId || payment.totalAmount !== 1000 || payment.currency !== "KRW" ||
      !(payment.status === "DONE" && payment.balanceAmount === 1000 || payment.status === "CANCELED" && payment.balanceAmount === 0))
    return new Response(null, { status: 409 });
  try {
    await deps.rpc("chemi_settle_point_order", { ...order, p_product: "dev_points_100", p_amount: payment.totalAmount, p_state: payment.status });
  } catch (error) {
    // The paid points were already spent, so the cancellation needs a person to review it.
    if (error instanceof Error && error.message === "POINT_REFUND_REVIEW") return Response.json({ error: "POINT_REFUND_REVIEW" }, { status: 409 });
    throw error;
  }
  return Response.json({ status: payment.status, balances: await deps.rpc("chemi_point_balances", owner) });
}
