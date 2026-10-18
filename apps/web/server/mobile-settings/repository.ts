import "server-only";

export interface MobileSettingsRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
}

function errorMessage(
  error: { message?: string; code?: string } | null,
  fallback: string,
): never {
  throw new Error(error?.message || error?.code || fallback);
}

export class MobileSettingsRepository {
  constructor(private readonly client: MobileSettingsRpcClient) {}

  private async rpc(
    name: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc(name, params);
    if (error) errorMessage(error, "MOBILE_SETTINGS_UNAVAILABLE");
    return data;
  }

  getSettings(appUserId: string) {
    return this.rpc("mobile_get_owned_settings", { p_app_user_id: appUserId });
  }
  patchSettings(
    appUserId: string,
    expectedRevision: number,
    patch: Record<string, unknown>,
  ) {
    return this.rpc("mobile_patch_owned_settings", {
      p_app_user_id: appUserId,
      p_expected_revision: expectedRevision,
      p_patch: patch,
    });
  }
  registerInstallation(
    appUserId: string,
    input: {
      installationId: string;
      expectedInstallationVersion: number;
      platform: string;
      pushToken?: string;
      permission: string;
      appVersion: string;
      locale: string;
      requestId: string;
    },
  ) {
    return this.rpc("mobile_register_owned_installation", {
      p_app_user_id: appUserId,
      p_installation_id: input.installationId,
      p_platform: input.platform,
      p_push_token: input.pushToken ?? null,
      p_permission: input.permission,
      p_app_version: input.appVersion,
      p_locale: input.locale,
      p_expected_installation_version: input.expectedInstallationVersion,
      p_request_id: input.requestId,
    });
  }
  getInstallationVersion(appUserId: string, installationId: string) {
    return this.rpc("mobile_get_installation_version", {
      p_app_user_id: appUserId,
      p_installation_id: installationId,
    });
  }
  disableInstallation(
    appUserId: string,
    installationId: string,
    expectedInstallationVersion: number,
    requestId: string,
  ) {
    return this.rpc("mobile_disable_owned_installation", {
      p_app_user_id: appUserId,
      p_installation_id: installationId,
      p_expected_installation_version: expectedInstallationVersion,
      p_request_id: requestId,
    });
  }
  async listNotifications(
    appUserId: string,
    input: {
      locale: "ko" | "en";
      category: string | null;
      limit: number;
      cursorAt: string | null;
      cursorId: string | null;
    },
  ) {
    await this.rpc("fan_web_drain_notification_intents", {
      p_app_user_id: appUserId,
      p_limit: 100,
    });
    return this.rpc("mobile_get_owned_notifications", {
      p_app_user_id: appUserId,
      p_locale: input.locale,
      p_category: input.category,
      p_limit: input.limit,
      p_cursor_created_at: input.cursorAt,
      p_cursor_id: input.cursorId,
    });
  }
  getNotification(
    appUserId: string,
    notificationId: string,
    locale: "ko" | "en",
  ) {
    return this.rpc("mobile_get_owned_notification", {
      p_app_user_id: appUserId,
      p_notification_id: notificationId,
      p_locale: locale,
    });
  }
  async markNotificationRead(
    appUserId: string,
    notificationId: string | null,
  ): Promise<boolean> {
    return Boolean(
      await this.rpc("mark_owned_web_notifications_read", {
        p_app_user_id: appUserId,
        p_notification_id: notificationId,
      }),
    );
  }
  async claimPush(workerId: string, batchSize: number, leaseSeconds: number) {
    await this.rpc("enqueue_due_fan_notifications", {});
    return this.rpc("mobile_claim_push_deliveries", {
      p_worker_id: workerId,
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
    });
  }
  preparePush(deliveryId: string, workerId: string) {
    return this.rpc("mobile_prepare_push_delivery", {
      p_delivery_id: deliveryId,
      p_worker_id: workerId,
    });
  }
  async finishPush(
    deliveryId: string,
    workerId: string,
    succeeded: boolean,
    errorCode?: string,
  ): Promise<boolean> {
    return Boolean(
      await this.rpc("mobile_finish_push_delivery", {
        p_delivery_id: deliveryId,
        p_worker_id: workerId,
        p_succeeded: succeeded,
        p_error_code: errorCode ?? null,
      }),
    );
  }
  async invalidatePushToken(
    deliveryId: string,
    workerId: string,
  ): Promise<boolean> {
    return Boolean(
      await this.rpc("mobile_invalidate_push_delivery_token", {
        p_delivery_id: deliveryId,
        p_worker_id: workerId,
      }),
    );
  }
}
