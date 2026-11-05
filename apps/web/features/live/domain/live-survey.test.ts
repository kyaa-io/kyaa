import { describe, expect, it } from "vitest";

import {
  parseSurveyLocale,
  projectLiveSurvey,
  projectSubmittedSurvey,
  saveLiveSurveyDraftRequestSchema,
  submitLiveSurveyRequestSchema,
  submitLiveSurveyResponseSchema,
} from "./live-survey";

const submitLiveSurveyResponseSchemaSafe = (value: unknown) => submitLiveSurveyResponseSchema.safeParse(value);

const key = "11111111-1111-4111-8111-111111111111";
const questionId = "22222222-2222-4222-8222-222222222222";
const optionId = "33333333-3333-4333-8333-333333333333";
const passportId = "44444444-4444-4444-8444-444444444444";
const stampId = "55555555-5555-4555-8555-555555555555";
const activityId = "66666666-6666-4666-8666-666666666666";
const submittedAt = "2026-07-21T12:00:00.000Z";
const completion = {
  passportId,
  earnedStamp: {
    id: stampId,
    type: "survey",
    issuedAt: submittedAt,
    businessStatus: "issued",
    mintStatus: "queued",
  },
  scoreDelta: 2,
  updatedScore: 10,
  updatedLevel: "Gold",
  leveledUp: true,
};

describe("live survey contract", () => {
  it("supports only the confirmed locales", () => {
    expect(parseSurveyLocale("ko")).toBe("ko");
    expect(parseSurveyLocale("en")).toBe("en");
    expect(() => parseSurveyLocale("ja")).toThrow();
  });

  it.each([
    { questionId, selectedOptionIds: [optionId] },
    { questionId, rating: 5 },
    { questionId, freeText: "좋았어요" },
  ])("accepts one canonical answer representation", (answer) => {
    expect(saveLiveSurveyDraftRequestSchema.parse({ idempotencyKey: key, expectedRevision: 0, answers: [answer] })).toBeTruthy();
    expect(submitLiveSurveyRequestSchema.parse({ idempotencyKey: key, answers: [answer] })).toBeTruthy();
  });

  it.each([
    { questionId },
    { questionId, rating: 5, freeText: "mixed" },
    { questionId, selectedOptionIds: [optionId, optionId] },
    { questionId, rating: 6 },
  ])("rejects ambiguous or invalid answers", (answer) => {
    expect(() => saveLiveSurveyDraftRequestSchema.parse({ idempotencyKey: key, expectedRevision: 0, answers: [answer] })).toThrow();
  });

  it("requires the authoritative completion on a submitted survey projection", () => {
    const result = {
      survey: { id: key, version: 1, questions: [] },
      eligibility: { completedAttendance: true },
      response: {
        status: "submitted",
        revision: 1,
        answers: [],
        submittedAt,
      },
      completion,
    };

    expect(projectLiveSurvey(result).completion).toEqual(completion);
    expect(() => projectLiveSurvey({ ...result, completion: null })).toThrow();
  });

  // P1-SURVEY-503: shapes the database returned for a legacy-style survey with no score row (dev LIVE 906 S1).
  it("fails on the stored submit result that has no completion (the cause of the 503)", () => {
    const stored = {
      response: {
        status: "submitted",
        submittedAt,
        activityId,
        scorePoints: 0,
        stamp: { id: stampId, businessStatus: "issued", mintStatus: "queued" },
      },
    };
    const parsed = submitLiveSurveyResponseSchemaSafe(stored);
    expect(parsed.success).toBe(false);
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(["completion"]);
  });

  it("fails on a GET whose submitted response has a null completion, and accepts the zero-score completion", () => {
    const get = {
      survey: { id: key, version: 1, questions: [] },
      eligibility: { completedAttendance: true },
      response: { status: "submitted", revision: 2, answers: [], submittedAt },
      completion: null,
    };
    expect(() => projectLiveSurvey(get)).toThrow(/survey completion is inconsistent/);
    const zero = { ...completion, scoreDelta: 0, leveledUp: false };
    expect(projectLiveSurvey({ ...get, completion: zero }).completion?.scoreDelta).toBe(0);
    expect(projectSubmittedSurvey({
      response: { status: "submitted", submittedAt, activityId, scorePoints: 0, stamp: { id: stampId, businessStatus: "issued", mintStatus: "queued" } },
      completion: zero,
    }).completion.scoreDelta).toBe(0);
  });

  it("rejects a submit response whose Stamp and completion disagree", () => {
    const result = {
      response: {
        status: "submitted",
        submittedAt,
        activityId,
        scorePoints: 2,
        stamp: {
          id: stampId,
          businessStatus: "issued",
          mintStatus: "queued",
        },
      },
      completion,
    };

    expect(projectSubmittedSurvey(result).completion).toEqual(completion);
    const zero = { ...result, response: { ...result.response, scorePoints: 0 }, completion: { ...completion, scoreDelta: 0 } };
    expect(projectSubmittedSurvey(zero).completion.scoreDelta).toBe(0);
    expect(() => projectSubmittedSurvey({
      ...result,
      completion: {
        ...completion,
        earnedStamp: { ...completion.earnedStamp, id: activityId },
      },
    })).toThrow();
  });
  it.each([0, 1, 2, 3])("accepts policy-range score %i through the real schemas", (score) => {
    const stampRef = { id: stampId, businessStatus: "issued", mintStatus: "queued" };
    const done = { ...completion, scoreDelta: score, leveledUp: false };
    const submitted = projectSubmittedSurvey({
      response: { status: "submitted", submittedAt, activityId, scorePoints: score, stamp: stampRef },
      completion: done,
    });
    expect(submitted.completion.scoreDelta).toBe(score);
    const get = {
      survey: { id: key, version: 1, questions: [] },
      eligibility: { completedAttendance: true },
      response: { status: "submitted", revision: 1, answers: [], submittedAt },
      completion: done,
    };
    expect(projectLiveSurvey(get).completion?.scoreDelta).toBe(score);
  });

  it("rejects scores outside the policy range", () => {
    const stampRef = { id: stampId, businessStatus: "issued", mintStatus: "queued" };
    expect(submitLiveSurveyResponseSchemaSafe({
      response: { status: "submitted", submittedAt, activityId, scorePoints: 4, stamp: stampRef },
      completion: { ...completion, scoreDelta: 4 },
    }).success).toBe(false);
    expect(submitLiveSurveyResponseSchemaSafe({
      response: { status: "submitted", submittedAt, activityId, scorePoints: 1.5, stamp: stampRef },
      completion: { ...completion, scoreDelta: 1 },
    }).success).toBe(false);
  });
});
