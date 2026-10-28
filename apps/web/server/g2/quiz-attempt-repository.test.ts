import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  QuizRepositoryError,
  SupabaseQuizAttemptRepository,
} from "./quiz-attempt-repository";

const rawAttempt = {
  attempt: {
    id: "20000000-0000-4000-8000-000000000001",
    status: "open",
    score: null,
    submittedAt: null,
  },
  questions: [1, 2, 3].map((position) => ({
    id: `00000000-0000-4000-8000-00000000000${position}`,
    position,
    promptKo: `질문 ${position}`,
    promptEn: `Question ${position}`,
    responseKind: "choice",
    selectedOptionId: null,
    freeText: null,
    options: [1, 2].map((optionPosition) => ({
      id: `10000000-0000-4000-800${position}-00000000000${optionPosition}`,
      position: optionPosition,
      labelKo: `보기 ${optionPosition}`,
      labelEn: `Option ${optionPosition}`,
    })),
  })),
};

describe("SupabaseQuizAttemptRepository", () => {
  it("uses legacy RPCs only when the exact requested version is absent before execution", async () => {
    const rpc = vi.fn(async (name: string) => name.endsWith("_v3") || name === "get_owned_quiz_attempt_v2"
      ? { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}(parameters) in the schema cache` } }
      : { data: name === "start_owned_quiz_attempt_v2" ? { kind: "attempt", ...rawAttempt } : rawAttempt, error: null });
    const repository = new SupabaseQuizAttemptRepository({ rpc });
    const owner = { appUserId: "60000000-0000-4000-8000-000000000001", locale: "ko" as const };
    const result = await repository.start({ ...owner, celebritySlug: "kara", idempotencyKey: "70000000-0000-4000-8000-000000000001" });
    expect(result.kind === "attempt" && result.questions[0].options[0].preserveOriginal).toBe(true);
    await repository.findOwned({ ...owner, attemptId: rawAttempt.attempt.id });
    await repository.saveAnswer({ ...owner, attemptId: rawAttempt.attempt.id, questionId: rawAttempt.questions[0].id, selectedOptionId: rawAttempt.questions[0].options[0].id, freeText: null });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["start_owned_quiz_attempt_v3", "start_owned_quiz_attempt_v2", "get_owned_quiz_attempt_v2", "get_owned_quiz_attempt", "save_owned_quiz_answer_v3", "save_owned_quiz_answer_v2"]);
  });
  it.each([
    { code: "42501", message: "permission denied for function start_owned_quiz_attempt_v3" },
    { code: "42883", message: "function internal_quiz_helper does not exist" },
    { code: "PGRST202", message: "Could not find the function public.internal_quiz_helper(parameters) in the schema cache" },
  ])("never retries a potentially executed or unauthorized RPC: $code", async (error) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    const repository = new SupabaseQuizAttemptRepository({ rpc });
    await expect(repository.start({ appUserId: "60000000-0000-4000-8000-000000000001", celebritySlug: "kara", idempotencyKey: "70000000-0000-4000-8000-000000000001", locale: "ko" })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps explicit translation policies and protects unknown legacy labels", async () => {
    const value = structuredClone(rawAttempt);
    Object.assign(value.questions[0].options[0], { preserveOriginal: false });
    Object.assign(value.questions[0].options[1], { preserveOriginal: true });
    const rpc = vi.fn().mockResolvedValue({ data: value, error: null });
    const repository = new SupabaseQuizAttemptRepository({ rpc });
    const result = await repository.findOwned({ appUserId: "60000000-0000-4000-8000-000000000001", attemptId: value.attempt.id, locale: "en" });
    expect(result?.questions[0].options.map(option => option.preserveOriginal)).toEqual([false, true]);
    expect(result?.questions[1].options[0].preserveOriginal).toBe(true);
    Object.assign(value.questions[0].options[0], { preserveOriginal: "false" });
    await expect(repository.findOwned({ appUserId: "60000000-0000-4000-8000-000000000001", attemptId: value.attempt.id, locale: "en" })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
  it("starts with only the server owner, slug, and generated idempotency key", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { kind: "attempt", ...rawAttempt }, error: null });
    const repository = new SupabaseQuizAttemptRepository({ rpc });
    const result = await repository.start({
      appUserId: "60000000-0000-4000-8000-000000000001",
      celebritySlug: "kara",
      idempotencyKey: "70000000-0000-4000-8000-000000000001",
      locale: "ko",
    });

    expect(rpc).toHaveBeenCalledWith("start_owned_quiz_attempt_v3", {
      p_app_user_id: "60000000-0000-4000-8000-000000000001",
      p_celebrity_slug: "kara",
      p_idempotency_key: "70000000-0000-4000-8000-000000000001",
      p_source_type: null,
      p_source_id: null,
    });
    expect(result).toEqual({
      kind: "attempt",
      attempt: rawAttempt.attempt,
      questions: rawAttempt.questions.map(({ promptKo, promptEn: _promptEn, options, ...question }) => ({
        ...question,
        prompt: promptKo,
        options: options.map(({ labelKo, labelEn: _labelEn, ...option }) => ({
          ...option,
          label: labelKo,
          preserveOriginal: true,
        })),
      })),
    });
  });

  it("localizes owner reads without returning the other locale or correctness", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rawAttempt, error: null });
    const repository = new SupabaseQuizAttemptRepository({ rpc });
    const result = await repository.findOwned({
      appUserId: "60000000-0000-4000-8000-000000000001",
      attemptId: rawAttempt.attempt.id,
      locale: "en",
    });
    expect(rpc).toHaveBeenCalledWith("get_owned_quiz_attempt_v2", {
      p_app_user_id: "60000000-0000-4000-8000-000000000001",
      p_attempt_id: rawAttempt.attempt.id,
    });
    expect(result?.questions[0]).toEqual(
      expect.objectContaining({ prompt: "Question 1", options: expect.arrayContaining([expect.objectContaining({ label: "Option 1" })]) }),
    );
    expect(JSON.stringify(result)).not.toMatch(/promptKo|promptEn|labelKo|labelEn|is_correct/i);
  });

  it("saves only an owned snapshot selection and returns the localized projection", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rawAttempt, error: null });
    const repository = new SupabaseQuizAttemptRepository({ rpc });
    await repository.saveAnswer({
      appUserId: "60000000-0000-4000-8000-000000000001",
      attemptId: rawAttempt.attempt.id,
      questionId: rawAttempt.questions[0].id,
      selectedOptionId: rawAttempt.questions[0].options[0].id,
      freeText: null,
      locale: "ko",
    });
    expect(rpc).toHaveBeenCalledWith("save_owned_quiz_answer_v3", {
      p_app_user_id: "60000000-0000-4000-8000-000000000001",
      p_attempt_id: rawAttempt.attempt.id,
      p_attempt_question_id: rawAttempt.questions[0].id,
      p_selected_option_id: rawAttempt.questions[0].options[0].id,
      p_free_text: null,
    });
  });

  it("saves an owner-private letter through the same answer boundary", async () => {
    const letterAttempt = {
      ...rawAttempt,
      questions: rawAttempt.questions.map((question, index) => index === 2 ? {
        ...question,
        responseKind: "letter",
        selectedOptionId: null,
        freeText: "여행지의 순간을 함께 나누고 싶어요.",
        options: [],
      } : question),
    };
    const rpc = vi.fn().mockResolvedValue({ data: letterAttempt, error: null });
    const repository = new SupabaseQuizAttemptRepository({ rpc });
    await repository.saveAnswer({
      appUserId: "60000000-0000-4000-8000-000000000001",
      attemptId: rawAttempt.attempt.id,
      questionId: rawAttempt.questions[2].id,
      selectedOptionId: null,
      freeText: "여행지의 순간을 함께 나누고 싶어요.",
      locale: "ko",
    });
    expect(rpc).toHaveBeenCalledWith("save_owned_quiz_answer_v3", expect.objectContaining({
      p_selected_option_id: null,
      p_free_text: "여행지의 순간을 함께 나누고 싶어요.",
    }));
  });

  it("derives both credential inputs server-side and submits without wallet or payload input", async () => {
    const appUserId = "60000000-0000-4000-8000-000000000001";
    const stampId = "80000000-0000-4000-8000-000000000001";
    const rpc = vi.fn().mockImplementation((name: string) => {
      if (name === "get_owned_quiz_submit_context") {
        return Promise.resolve({
          data: {
            attemptId: rawAttempt.attempt.id,
            status: "open",
            appUserId,
            celebritySlug: "kara",
            passportId: null,
          },
          error: null,
        });
      }
      return Promise.resolve({
        data: {
          attempt: {
            id: rawAttempt.attempt.id,
            status: "passed",
            score: 2,
            submittedAt: "2026-07-21T12:00:00.000Z",
          },
          issuance: {
            passportId: "30000000-0000-4000-8000-000000000001",
            stampId,
            scorePoints: 1,
          },
        },
        error: null,
      });
    });
    const repository = new SupabaseQuizAttemptRepository({ rpc }, () => stampId);

    await expect(repository.submit({ appUserId, attemptId: rawAttempt.attempt.id })).resolves.toEqual(
      expect.objectContaining({ issuance: expect.objectContaining({ stampId }) }),
    );
    expect(rpc).toHaveBeenNthCalledWith(1, "get_owned_quiz_submit_context", {
      p_app_user_id: appUserId,
      p_attempt_id: rawAttempt.attempt.id,
    });
    const submitParameters = rpc.mock.calls[1][1] as Record<string, string>;
    expect(rpc).toHaveBeenNthCalledWith(2, "submit_owned_quiz_attempt", {
      p_app_user_id: appUserId,
      p_attempt_id: rawAttempt.attempt.id,
      p_stamp_id: stampId,
      p_passport_operation_key: `byus:passport:v1:${appUserId}:kara`,
      p_passport_credential_id: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      p_stamp_operation_key: `byus:stamp:v1:${stampId}`,
      p_stamp_issuance_id: expect.stringMatching(/^0x[0-9a-f]{64}$/),
    });
    for (const forbidden of ["wallet", "recipient", "payload", "score", "operation_key"]) {
      expect(Object.keys(submitParameters)).not.toContain(forbidden);
    }
  });

  it("fails closed when submit context identity does not match the authorized owner", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        attemptId: rawAttempt.attempt.id,
        status: "open",
        appUserId: "90000000-0000-4000-8000-000000000001",
        celebritySlug: "kara",
        passportId: null,
      },
      error: null,
    });
    const repository = new SupabaseQuizAttemptRepository({ rpc });
    await expect(repository.submit({
      appUserId: "60000000-0000-4000-8000-000000000001",
      attemptId: rawAttempt.attempt.id,
    })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["G2_QUIZ_UNAVAILABLE", "QUIZ_UNAVAILABLE"],
    ["G2_ATTEMPT_CLOSED", "ATTEMPT_CLOSED"],
    ["G2_ATTEMPT_INCOMPLETE", "ATTEMPT_INCOMPLETE"],
    ["G2_WALLET_NOT_READY", "WALLET_REQUIRED"],
    ["G2_ATTEMPT_NOT_FOUND", "NOT_FOUND"],
    ["G2_ANSWER_SELECTION_INVALID", "NOT_FOUND"],
  ] as const)("maps %s without leaking database details", async (signal, expectedCode) => {
    const repository = new SupabaseQuizAttemptRepository({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: `${signal}: private detail` } }),
    });
    const error = await repository.findOwned({
      appUserId: "60000000-0000-4000-8000-000000000001",
      attemptId: rawAttempt.attempt.id,
      locale: "ko",
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(QuizRepositoryError);
    expect(error.code).toBe(expectedCode);
    expect(error.message).not.toContain("private detail");
  });

  it("treats malformed projections and unknown database errors as unavailable", async () => {
    const malformed = new SupabaseQuizAttemptRepository({
      rpc: vi.fn().mockResolvedValue({ data: { ...rawAttempt, wallet: "secret" }, error: null }),
    });
    await expect(malformed.findOwned({
      appUserId: "60000000-0000-4000-8000-000000000001",
      attemptId: rawAttempt.attempt.id,
      locale: "ko",
    })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
