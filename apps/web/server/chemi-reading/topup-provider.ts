import "server-only";

export interface PointPaymentProvider {
  checkout(orderId: string, amount: number): Promise<string>;
  // Query the provider directly and normalize its authenticated order snapshot.
  lookup(orderId: string): Promise<{
    orderId: string; totalAmount: number; balanceAmount: number;
    currency: string; status: "DONE" | "CANCELED" | "PENDING";
  }>;
}

export function pointPaymentProvider(): PointPaymentProvider | undefined {
  return undefined; // Awaiting PG selection.
}
