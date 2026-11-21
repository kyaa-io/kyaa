import "server-only";
import { createSign } from "node:crypto";

/**
 * 질문 답을 쓰는 AI 제공자. 제공자를 바꿀 때는 이 파일만 바꾼다(askAiReady·askAiText 두 함수의 꼴 유지).
 * 지금: Google Vertex AI Gemini. 서비스 계정 키(CHEMI_ASK_AI_GCP_KEY, JSON 또는 base64)로 토큰을 받아 부른다.
 * 질문·답 글은 어디에도 남기지 않는다. 실패는 이유 없이 던지고, 부른 쪽이 규칙 문장으로 대신한다.
 */
export type AskAiRequest = { system: string; user: string; signal: AbortSignal };
export type AskAiReply = { text: string; tokensIn: number; tokensOut: number };

const MODEL = "gemini-3.5-flash-lite";
/** 답 한 번이 쓸 수 있는 출력 토큰. 2~4문장이면 200 안쪽이다. */
export const ASK_AI_MAX_OUTPUT_TOKENS = 400;

type ServiceAccount = { client_email: string; private_key: string; project_id: string; token_uri?: string };

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.CHEMI_ASK_AI_GCP_KEY?.trim();
  if (!raw) return null;
  try {
    const key = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as ServiceAccount;
    return key.client_email && key.private_key && key.project_id ? key : null;
  } catch {
    return null;
  }
}

/** 켜져 있고(CHEMI_ASK_AI=true) 키도 읽히는가. */
export const askAiReady = () => process.env.CHEMI_ASK_AI === "true" && serviceAccount() !== null;

let token: { value: string; until: number; email: string } | null = null;

async function accessToken(key: ServiceAccount, signal: AbortSignal) {
  const now = Math.floor(Date.now() / 1000);
  if (token && token.email === key.client_email && token.until > now + 60) return token.value;
  const audience = key.token_uri ?? "https://oauth2.googleapis.com/token";
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({
    iss: key.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: audience, iat: now, exp: now + 3600,
  })}`;
  const assertion = `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url")}`;
  const response = await fetch(audience, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal,
  });
  if (!response.ok) throw Error("ASK_AI_AUTH");
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw Error("ASK_AI_AUTH");
  token = { value: body.access_token, until: now + (body.expires_in ?? 3600), email: key.client_email };
  return token.value;
}

export async function askAiText(request: AskAiRequest): Promise<AskAiReply> {
  const key = serviceAccount();
  if (!key) throw Error("ASK_AI_OFF");
  const model = process.env.CHEMI_ASK_AI_MODEL?.trim() || MODEL;
  const response = await fetch(
    `https://aiplatform.googleapis.com/v1/projects/${key.project_id}/locations/global/publishers/google/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken(key, request.signal)}`, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts: [{ text: request.user }] }],
        generationConfig: { maxOutputTokens: ASK_AI_MAX_OUTPUT_TOKENS, temperature: 0.7, candidateCount: 1 },
        safetySettings: ["HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_DANGEROUS_CONTENT"]
          .map((category) => ({ category, threshold: "BLOCK_LOW_AND_ABOVE" })),
      }),
      signal: request.signal,
    },
  );
  if (!response.ok) throw Error("ASK_AI_HTTP");
  const body = (await response.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  const candidate = body.candidates?.[0];
  const usage = body.usageMetadata ?? {};
  return {
    // 끝까지 쓴 답만 받는다(잘린 답·안전 차단은 빈 글로 돌려 검사에서 떨어뜨린다).
    text: candidate?.finishReason === "STOP"
      ? (candidate.content?.parts ?? []).filter((part) => !part.thought).map((part) => part.text ?? "").join("").trim()
      : "",
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
  };
}
