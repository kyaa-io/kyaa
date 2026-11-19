import type { NotificationEmailContext } from "./email-template.ts";

export type ExternalChannel = "email" | "kakao";
export interface ExternalNotificationJob {
  id: string;
  notificationId: string;
  planId: string;
  channel: ExternalChannel;
  sequence: 1 | 2;
  templateKey: string;
  locale: "ko" | "en";
  destination: string;
  payload: {
    priority?: number;
    title: string;
    detail: string;
    deepLink: string;
    context?: NotificationEmailContext;
  };
  attemptCount: number;
  leaseOwner: string;
  leaseExpiresAt: string;
}
export class ExternalNotificationError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.name = "ExternalNotificationError";
  }
}
