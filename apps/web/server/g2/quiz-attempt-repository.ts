import "server-only";

import { randomUUID } from "node:crypto";

import { createClient } from "@/server/data/client";
import { z } from "zod";

import { deriveCredentialId } from "../../features/passport/domain/credential-issuance";
import {
  parseQuizAttemptProjection,
  parseQuizStartProjection,
  parseQuizSubmitProjection,
  type QuizAttemptProjection,
  type QuizStartProjection,
  type QuizSubmitProjection,
} from "../../features/quiz/domain/quiz-attempt";
import type { ContentLocale } from "../content/content-domain";

export type QuizRepositoryErrorCode =
  | "QUIZ_UNAVAILABLE"
  | "ATTEMPT_INCOMPLETE"
  | "ATTEMPT_CLOSED"
  | "WALLET_REQUIRED"
  | "COOLDOWN"
  | "ATTRIBUTION_INVALID"
  | "INVALID_ANSWER"
  | "NOT_FOUND"
  | "UNAVAILABLE";

export class QuizRepositoryError extends Error {
  constructor(readonly code: QuizRepositoryErrorCode, readonly retryAfter: string | null = null) {
    super(code);
    this.name = "QuizRepositoryError";
  }
}

export type QuizVerificationSourceType = "creator_page" | "live" | "benefit" | "reaction";

export interface QuizAttemptRepository {
  start(input: {
    appUserId: string;
    celebritySlug: string;
    idempotencyKey: string;
    locale: ContentLocale;
    sourceType?: QuizVerificationSourceType;
    sourceId?: string;
  }): Promise<QuizStartProjection>;
  findOwned(input: {
    appUserId: string;
    attemptId: string;
    locale: ContentLocale;
  }): Promise<QuizAttemptProjection | null>;
  saveAnswer(input: {
    appUserId: string;
    attemptId: string;
    questionId: string;
    selectedOptionId: string | null;
    freeText: string | null;
    locale: ContentLocale;
  }): Promise<QuizAttemptProjection>;
  submit(input: {
    appUserId: string;
    attemptId: string;
  }): Promise<QuizSubmitProjection>;
}

interface RpcError {
  message?: string;
}

interface RpcClient {
  rpc(
    name: string,
    parameters: Record<string, string | null>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

const rawAttemptResultSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(["open", "passed", "failed"]),
    score: z.number().int().min(0).max(3).nullable(),
    submittedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

const rawQuestionSchema = z
  .object({
    id: z.uuid(),
    position: z.number().int().min(1).max(3),
    promptKo: z.string().trim().min(1).max(1000),
    promptEn: z.string().trim().min(1).max(1000),
    responseKind: z.enum(["choice", "letter"]),
    selectedOptionId: z.uuid().nullable(),
    freeText: z.string().trim().min(1).max(200).nullable(),
    options: z
      .array(
        z
          .object({
            id: z.uuid(),
            position: z.number().int().positive(),
            labelKo: z.string().trim().min(1).max(500),
            labelEn: z.string().trim().min(1).max(500),
          })
          .strict(),
      ),
  })
  .strict()
  .superRefine((question, context) => {
    if (question.responseKind === "choice" && question.options.length < 2) {
      context.addIssue({ code: "custom", path: ["options"], message: "choice questions require options" });
    }
    if (question.responseKind === "letter" && question.options.length !== 0) {
      context.addIssue({ code: "custom", path: ["options"], message: "letter questions cannot expose options" });
    }
  });

const rawAttemptProjectionSchema = z
  .object({
    attempt: rawAttemptResultSchema,
    questions: z.array(rawQuestionSchema).length(3),
  })
  .strict();

const rawStartProjectionSchema = z.union([
  z.object({ kind: z.literal("holder"), passportId: z.uuid() }).strict(),
  z
    .object({
      kind: z.literal("attempt"),
      attempt: rawAttemptResultSchema,
      questions: z.array(rawQuestionSchema).length(3),
    })
    .strict(),
]);

const submitContextSchema = z
  .object({
    attemptId: z.uuid(),
    status: z.enum(["open", "passed", "failed"]),
    appUserId: z.uuid(),
    celebritySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    passportId: z.uuid().nullable(),
  })
  .strict();

function mappedError(error: RpcError): QuizRepositoryError {
  const message = error.message ?? "";
  if (message.includes("G2_VERIFICATION_COOLDOWN:")) {
    return new QuizRepositoryError("COOLDOWN", message.split("G2_VERIFICATION_COOLDOWN:")[1]?.trim() ?? null);
  }
  const mappings: ReadonlyArray<readonly [string, QuizRepositoryErrorCode]> = [
    ["G2_QUIZ_UNAVAILABLE", "QUIZ_UNAVAILABLE"],
    ["G2_ATTEMPT_CLOSED", "ATTEMPT_CLOSED"],
    ["G2_ATTEMPT_INCOMPLETE", "ATTEMPT_INCOMPLETE"],
    ["G2_WALLET_NOT_READY", "WALLET_REQUIRED"],
    ["G2_ATTRIBUTION_INVALID", "ATTRIBUTION_INVALID"],
    ["G2_ANSWER_INPUT_INVALID", "INVALID_ANSWER"],
    ["G2_ATTEMPT_NOT_FOUND", "NOT_FOUND"],
    ["G2_ANSWER_SELECTION_INVALID", "NOT_FOUND"],
    ["G2_USER_UNAVAILABLE", "NOT_FOUND"],
  ];
  return new QuizRepositoryError(
    mappings.find(([signal]) => message.includes(signal))?.[1] ?? "UNAVAILABLE",
  );
}

function unavailable(): QuizRepositoryError {
  return new QuizRepositoryError("UNAVAILABLE");
}

function localizeAttempt(value: unknown, locale: ContentLocale): QuizAttemptProjection {
  const raw = rawAttemptProjectionSchema.parse(value);
  return parseQuizAttemptProjection({
    attempt: raw.attempt,
    questions: raw.questions.map((question) => ({
      id: question.id,
      position: question.position,
      prompt: locale === "ko" ? question.promptKo : question.promptEn,
      responseKind: question.responseKind,
      selectedOptionId: question.selectedOptionId,
      freeText: question.freeText,
      options: question.options.map((option) => ({
        id: option.id,
        position: option.position,
        label: locale === "ko" ? option.labelKo : option.labelEn,
      })),
    })),
  });
}

export class SupabaseQuizAttemptRepository implements QuizAttemptRepository {
  constructor(
    private readonly client: RpcClient,
    private readonly createId: () => string = randomUUID,
  ) {}

  private async call(name: string, parameters: Record<string, string | null>): Promise<unknown> {
    const { data, error } = await this.client.rpc(name, parameters);
    if (error) throw mappedError(error);
    return data;
  }

  async start(input: {
    appUserId: string;
    celebritySlug: string;
    idempotencyKey: string;
    locale: ContentLocale;
    sourceType?: QuizVerificationSourceType;
    sourceId?: string;
  }): Promise<QuizStartProjection> {
    const data = await this.call("start_owned_quiz_attempt_v2", {
      p_app_user_id: input.appUserId,
      p_celebrity_slug: input.celebritySlug,
      p_idempotency_key: input.idempotencyKey,
      p_source_type: input.sourceType ?? null,
      p_source_id: input.sourceId ?? null,
    });
    if (data === null) throw new QuizRepositoryError("NOT_FOUND");
    try {
      const raw = rawStartProjectionSchema.parse(data);
      if (raw.kind === "holder") return parseQuizStartProjection(raw);
      return parseQuizStartProjection({
        kind: "attempt",
        ...localizeAttempt({ attempt: raw.attempt, questions: raw.questions }, input.locale),
      });
    } catch (error) {
      if (error instanceof QuizRepositoryError) throw error;
      throw unavailable();
    }
  }

  async findOwned(input: {
    appUserId: string;
    attemptId: string;
    locale: ContentLocale;
  }): Promise<QuizAttemptProjection | null> {
    const data = await this.call("get_owned_quiz_attempt", {
      p_app_user_id: input.appUserId,
      p_attempt_id: input.attemptId,
    });
    if (data === null) return null;
    try {
      return localizeAttempt(data, input.locale);
    } catch {
      throw unavailable();
    }
  }

  async saveAnswer(input: {
    appUserId: string;
    attemptId: string;
    questionId: string;
    selectedOptionId: string | null;
    freeText: string | null;
    locale: ContentLocale;
  }): Promise<QuizAttemptProjection> {
    const data = await this.call("save_owned_quiz_answer_v2", {
      p_app_user_id: input.appUserId,
      p_attempt_id: input.attemptId,
      p_attempt_question_id: input.questionId,
      p_selected_option_id: input.selectedOptionId,
      p_free_text: input.freeText,
    });
    if (data === null) throw new QuizRepositoryError("NOT_FOUND");
    try {
      return localizeAttempt(data, input.locale);
    } catch {
      throw unavailable();
    }
  }

  async submit(input: {
    appUserId: string;
    attemptId: string;
  }): Promise<QuizSubmitProjection> {
    const contextData = await this.call("get_owned_quiz_submit_context", {
      p_app_user_id: input.appUserId,
      p_attempt_id: input.attemptId,
    });
    if (contextData === null) throw new QuizRepositoryError("NOT_FOUND");

    let context: z.infer<typeof submitContextSchema>;
    try {
      context = submitContextSchema.parse(contextData);
    } catch {
      throw unavailable();
    }
    if (context.appUserId !== input.appUserId || context.attemptId !== input.attemptId) {
      throw unavailable();
    }

    const stampId = this.createId();
    const passportOperationKey =
      `byus:passport:v1:${input.appUserId}:${context.celebritySlug}`;
    const stampOperationKey = `byus:stamp:v1:${stampId}`;
    let data: unknown;
    try {
      data = await this.call("submit_owned_quiz_attempt", {
        p_app_user_id: input.appUserId,
        p_attempt_id: input.attemptId,
        p_stamp_id: stampId,
        p_passport_operation_key: passportOperationKey,
        p_passport_credential_id: deriveCredentialId(passportOperationKey),
        p_stamp_operation_key: stampOperationKey,
        p_stamp_issuance_id: deriveCredentialId(stampOperationKey),
      });
    } catch (error) {
      if (error instanceof QuizRepositoryError) throw error;
      throw unavailable();
    }
    if (data === null) throw unavailable();
    try {
      return parseQuizSubmitProjection(data);
    } catch {
      throw unavailable();
    }
  }
}

export function createSupabaseQuizAttemptRepository(
  config: { url: string | undefined; serviceRoleKey: string | undefined },
  client?: RpcClient,
): QuizAttemptRepository {
  const database = client ?? createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseQuizAttemptRepository(database as unknown as RpcClient);
}
