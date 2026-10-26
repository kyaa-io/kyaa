import "server-only";
import { request } from "node:https";

/** Keep Telegram on IPv4: this VPC has IPv4 NAT, and Node's dual-stack fetch times out. */
export const telegramNoticeFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== "https://api.telegram.org") return fetch(input, init);
  if (url.username || url.password || init?.method !== "POST" || typeof init.body !== "string") throw new Error("INVALID_TELEGRAM_REQUEST");
  const body = init.body;
  return new Promise<Response>((resolve, reject) => {
    const outgoing = request(url, {
      method: "POST", family: 4, signal: init.signal ?? undefined,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
    }, incoming => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      incoming.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1_048_576) { outgoing.destroy(new Error("TELEGRAM_RESPONSE_TOO_LARGE")); return; }
        chunks.push(chunk);
      });
      incoming.on("error", reject);
      incoming.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode ?? 502 })));
    });
    outgoing.on("error", reject);
    // One attempt only: a lost Telegram response must never trigger an automatic resend.
    outgoing.end(body);
  });
};
