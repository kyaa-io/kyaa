import "server-only";

import { z } from "zod";
import { telegramNoticeFetch } from "./telegram-notice-fetch";
import { boundedJson, operatorAuthorized } from "./bug-report-routes";
import { SALLY_BUG_REPORT_CHAT_ID } from "./bug-report-repository";

const HEADERS = { "cache-control": "private, no-store", vary: "Authorization" };
const REPOSITORY_ID = 1307387500;
const REPOSITORY = "kyaa-io/kyaa";
const PRODUCTION_ENVIRONMENTS = ["Production", "Production – kyaa", "Production – kyaawave"];
const requestSchema = z.object({
  site: z.enum(["kyaa", "wave"]).default("kyaa"),
  deploymentId: z.number().int().positive().safe(),
  receiptId: z.number().int().positive().safe(),
  images: z.array(z.string().regex(/^release-notes\/images\/[a-z0-9-]+\.png$/)).min(1).max(10).optional(),
  text: z.string().min(20).max(3900).refine(text => {
    if (!/^✅ (?:kyaa|ByUs|kyaa wave) 수정사항이 반영됐어요\n/.test(text) || !/[가-힣]/.test(text) || /[\x00-\x09\x0b-\x1f\x7f]/.test(text)) return false;
    const links = text.match(/https?:\/\/\S+/g) ?? [];
    return links.length > 0 && links.every(link => /^https:\/\/(?:kyaa\.io|byus\.kr|kyaawave\.com)\/[a-zA-Z0-9/_-]*$/.test(link));
  }),
}).strict().refine(input => !input.images?.length || input.text.length <= 1024 * input.images.length)
  .refine(input => {
    const wave = input.site === "wave";
    return input.text.startsWith("✅ kyaa wave ") === wave &&
      (input.text.match(/https?:\/\/\S+/g) ?? []).every(link => link.startsWith("https://kyaawave.com/") === wave);
  });

function albumCaptions(text: string, imageCount: number) {
  const captions: string[] = [];
  for (const line of text.split("\n")) {
    if (Array.from(line).length > 1024) throw new Error("CAPTION_LINE_TOO_LONG");
    const previous = captions.at(-1);
    const joined = previous === undefined ? line : `${previous}\n${line}`;
    if (previous !== undefined && Array.from(joined).length <= 1024) captions[captions.length - 1] = joined;
    else captions.push(line);
  }
  if (captions.length > imageCount) throw new Error("TOO_MANY_CAPTIONS");
  return captions;
}

export function createDeploymentNoticeHandler({ secret, botToken, fetcher = telegramNoticeFetch }: {
  secret?: string; botToken?: string; fetcher?: typeof fetch;
}) {
  return async (request: Request): Promise<Response> => {
    const fail = (code: string, status: number) => Response.json({ error: { code } }, { status, headers: HEADERS });
    if (!secret || !botToken) return fail("TELEGRAM_OPERATOR_UNAVAILABLE", 503);
    if (!operatorAuthorized(request, secret)) return fail("UNAUTHORIZED", 401);
    let input: z.infer<typeof requestSchema>;
    let captions: string[] = [];
    try {
      input = requestSchema.parse(await boundedJson(request));
      if (input.images?.length) captions = albumCaptions(input.text, input.images.length);
    }
    catch { return fail("INVALID_REQUEST", 400); }
    let deployedSha: string;
    let deployedRepository: string;
    try {
      async function canonicalRepository(): Promise<string> {
        const response = await fetcher(`https://api.github.com/repositories/${REPOSITORY_ID}`, { headers: { accept: "application/vnd.github+json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error("GITHUB_UNAVAILABLE");
        const repository = await response.json();
        if (repository.id !== REPOSITORY_ID || repository.full_name !== REPOSITORY) throw new Error("UNTRUSTED_REPOSITORY");
        return repository.full_name;
      }
      let repository = await canonicalRepository();
      async function github(path: string) {
        for (let attempt = 0; ; attempt++) {
          const response = await fetcher(`https://api.github.com/repos/${repository}${path}`, { headers: { accept: "application/vnd.github+json" }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10_000) });
          if (response.status === 301 && attempt === 0) { repository = await canonicalRepository(); continue; }
          if (!response.ok) throw new Error("GITHUB_UNAVAILABLE");
          return response.json();
        }
      }
      const [deployment, statuses, receipt] = await Promise.all([
        github(`/deployments/${input.deploymentId}`),
        github(`/deployments/${input.deploymentId}/statuses?per_page=1`),
        github(`/check-runs/${input.receiptId}`),
      ]);
      const status = statuses[0];
      const vercel = PRODUCTION_ENVIRONMENTS.includes(deployment.environment) && deployment.creator?.login === "vercel[bot]" && status?.creator?.login === "vercel[bot]";
      const payload = deployment.payload;
      const aws = deployment.environment === "AWS production" && deployment.creator?.login === "github-actions[bot]" && status?.creator?.login === "github-actions[bot]" &&
        payload && Object.keys(payload).every(key => ["provider","schemaVersion","environment","sourceSha","imageDigest","sourceRunId","workflowRunId","workflowPath","publicLive"].includes(key)) &&
        payload.provider === "aws" && payload.schemaVersion === 1 && payload.environment === "prod" && payload.sourceSha === deployment.sha && payload.publicLive === true &&
        /^sha256:[a-f0-9]{64}$/.test(payload.imageDigest ?? "") && Number.isSafeInteger(payload.sourceRunId) && payload.sourceRunId > 0 &&
        Number.isSafeInteger(payload.workflowRunId) && payload.workflowRunId > 0 && payload.workflowPath === ".github/workflows/aws-platform.yml" &&
        status.log_url === `https://github.com/${REPOSITORY}/actions/runs/${payload.workflowRunId}`;
      if (deployment.id !== input.deploymentId || !/^[0-9a-f]{40}$/.test(deployment.sha ?? "") ||
          status?.state !== "success" || status.environment !== deployment.environment || (!vercel && !aws)) return fail("DEPLOYMENT_NOT_READY", 409);
      if (aws) {
        const run = await github(`/actions/runs/${payload.workflowRunId}`);
        if (run.id !== payload.workflowRunId || run.repository?.id !== REPOSITORY_ID || run.repository?.full_name !== REPOSITORY || run.path !== payload.workflowPath || run.head_branch !== "main" || !/^[a-f0-9]{40}$/.test(run.head_sha ?? "") || !["push","workflow_dispatch"].includes(run.event) || !["in_progress","completed"].includes(run.status) || (run.status === "completed" && run.conclusion !== "success")) return fail("DEPLOYMENT_NOT_READY", 409);
        const comparison = await github(`/compare/${deployment.sha}...${run.head_sha}`);
        if (!["ahead","identical"].includes(comparison.status)) return fail("DEPLOYMENT_NOT_READY", 409);
        const health = await fetcher("https://kyaa.io/api/health/live", { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
        const live = await health.json();
        if (!health.ok || live.status !== "ok" || live.revision !== deployment.sha) return fail("DEPLOYMENT_NOT_READY", 409);
      }
      const wave = /^https:\/\/kyaawave-[a-z0-9]+-sallylab\.vercel\.app\/?$/.test(status.environment_url ?? "");
      if ((input.site === "wave") !== wave) return fail("DEPLOYMENT_NOT_READY", 409);
      const checkName = wave ? "Telegram deployment notice · kyaa wave" : "Telegram deployment notice";
      if (receipt.id !== input.receiptId || receipt.name !== checkName || receipt.app?.slug !== "github-actions" ||
          receipt.head_sha !== deployment.sha || receipt.external_id !== String(deployment.id) || receipt.status !== "in_progress") return fail("RECEIPT_NOT_RESERVED", 409);
      deployedSha = deployment.sha;
      deployedRepository = input.images?.length ? await canonicalRepository() : repository;
    } catch { return fail("DEPLOYMENT_VERIFICATION_UNAVAILABLE", 503); }

    // The globally serialized CI sender owns the receipt. Never retry a POST with an uncertain result.
    try {
      const photos = input.images?.map(path => `https://raw.githubusercontent.com/${deployedRepository}/${deployedSha}/${path}`) ?? [];
      const method = photos.length > 1 ? "sendMediaGroup" : photos.length ? "sendPhoto" : "sendMessage";
      const content = photos.length > 1
        ? { media: photos.map((media, i) => ({ type: "photo", media, show_caption_above_media: true, ...(captions[i] !== undefined ? { caption: captions[i] } : {}) })) }
        : photos.length ? { photo: photos[0], caption: input.text, show_caption_above_media: true }
          : { text: input.text, link_preview_options: { is_disabled: true } };
      // One Telegram request keeps text and screenshots together; never fall back to a second send.
      const response = await fetcher(`https://api.telegram.org/bot${botToken}/${method}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: SALLY_BUG_REPORT_CHAT_ID, ...content }),
        redirect: "error", signal: AbortSignal.timeout(20_000),
      });
      const payload = await response.json();
      if (payload?.ok === false) {
        console.warn("TELEGRAM_NOTICE_REJECTED", {
          code: payload.error_code,
          description: String(payload.description ?? "").replaceAll(botToken, "[redacted]").replace(/https?:\/\/\S+/g, "[url]").slice(0, 240),
        });
        return fail("TELEGRAM_NOTICE_REJECTED", 502);
      }
      const messages = photos.length > 1 ? payload?.result : [payload?.result];
      if (!response.ok || payload?.ok !== true || !Array.isArray(messages) || messages.length !== Math.max(photos.length, 1) ||
          messages.some(message => !Number.isSafeInteger(message?.message_id) || message?.chat?.id !== SALLY_BUG_REPORT_CHAT_ID)) return fail("TELEGRAM_NOTICE_UNCERTAIN", 503);
      return Response.json({ ok: true, messageId: messages[0].message_id, chatId: SALLY_BUG_REPORT_CHAT_ID,
        ...(photos.length ? { messageIds: messages.map(message => message.message_id) } : {}) }, { headers: HEADERS });
    } catch { return fail("TELEGRAM_NOTICE_UNCERTAIN", 503); }
  };
}
