import { createHash } from "node:crypto";
import { z } from "zod";
import { SesEmailSender, type SesEmailSenderConfig, type SesV2SendClient } from "./adapters/ses-email-sender.ts";

export type ChemiMaintenanceRpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;

const claimedMail = z.object({
  id: z.uuid(),
  token: z.uuid(),
  kind: z.enum(["friend", "remind", "receipt", "refund", "lucky_draw"]),
  destination: z.email(),
  body: z.string(),
  advertising: z.boolean(),
});

const senderInfo = "주식회사 셀리랩 · 대표 김보석 · 사업자등록번호 736-86-03473 · 서울 강남구 도산대로28길 46, 6·7층 · support@kyaa.io";

export async function drainChemiMail(
  rpc: ChemiMaintenanceRpc,
  config: SesEmailSenderConfig,
  mode: "test_sink" | "ses_email",
  testObserver?: SesV2SendClient,
) {
  let testHash: string | null = null;
  const sender = new SesEmailSender(mode === "test_sink" ? {
    ...config,
    fetcher: async () => new Response(null, { status: 404 }),
    client: {
      async send(command) {
        testHash = createHash("sha256").update(JSON.stringify(command.input.Content?.Simple)).digest("hex");
        return testObserver ? testObserver.send(command) : { MessageId: "chemi-test-sink" };
      },
    },
  } : config);

  let sent = 0;
  for (let index = 0; index < (mode === "test_sink" ? 50 : 2); index++) {
    const row = await rpc("chemi_mail_claim", {});
    if (row === null) break;
    const job = claimedMail.parse(row);
    const [title = "", ...lines] = job.body.replace(/^\[광고\] /, "").split("\n");
    const detail = lines.join("\n");
    let succeeded = false;
    testHash = null;
    try {
      await sender.send({
        id: job.id, notificationId: job.id, templateKey: `chemi_${job.kind}`,
        destination: job.destination, channel: "email", locale: "ko",
        payload: { title, detail, deepLink: "/chemi", priority: job.advertising ? 3 : 1 },
      }, {
        advertising: job.advertising,
        ...(job.advertising ? { senderInfo } : {}),
        copy: {
          subject: job.advertising ? `(광고) ${title}` : title,
          title, detail, category: "케미", cta: "케미 확인하기",
          settings: "알림 설정", cardFallback: title,
        },
      });
      succeeded = true;
    } finally {
      if (await rpc("chemi_mail_finish", {
        p_id: job.id, p_token: job.token, p_sent: succeeded, p_test_hash: testHash,
      }) !== true) throw new Error("CHEMI_MAIL_STALE_ATTEMPT");
    }
    sent++;
  }
  return sent;
}

export async function runChemiMail(rpc: ChemiMaintenanceRpc, env: NodeJS.ProcessEnv) {
  if (env.APP_ENV !== "dev" || env.CHEMI_MAIL_SINK !== "true") return 0;
  return drainChemiMail(rpc, {
    region: "ap-northeast-2", fromEmail: "notifications@kyaa.io",
    trustedOrigin: "https://dev.kyaa.io", unsubscribeSecret: env.POSTGREST_SERVICE_TOKEN,
  }, "test_sink");
}
