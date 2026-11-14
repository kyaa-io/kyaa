"use client";
import { Save } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useState } from "react";
import { FOLLOWER_PLATFORMS, parseFollowerInput, type FollowerPlatform } from "@/features/rankings/domain/platform-followers";
import type { AdminLocale } from "./operations-shell";
import styles from "./admin.module.css";
import localStyles from "./celebrity-manager.module.css";

export type AdminPlatformFollower = {
  celebrityId: string;
  platform: FollowerPlatform;
  count: number;
  sourceText: string | null;
  digits: number | null;
  sourceKind: "manual" | "collector";
  sourceUrl: string | null;
  checkedAt: string;
};
const NAMES: Record<FollowerPlatform, [string, string]> = {
  instagram: ["Instagram", "Instagram"], tiktok: ["TikTok", "TikTok"], youtube: ["YouTube", "YouTube"], chzzk: ["치지직", "CHZZK"],
};
const textOf = (row: AdminPlatformFollower | undefined) => (row ? row.sourceText ?? String(row.count) : "");
const day = (value: string) => value.slice(0, 10);

/** The administrator's input for the platform follower counts the creator ranking shows. Type the number as the platform shows it ("1.2만", "50K", "1,088"); empty = unconfirmed (not shown), 0 = confirmed zero.
 * It saves on its own: the creator form's save never touches these counts. */
export function PlatformFollowersEditor({ celebrityId, rows, locale, canEdit, save }: {
  celebrityId: string; rows: AdminPlatformFollower[]; locale: AdminLocale; canEdit: boolean;
  save: (celebrityId: string, items: { platform: FollowerPlatform; text: string }[]) => Promise<AdminPlatformFollower[]>;
}) {
  const ko = locale === "ko";
  const [saved, setSaved] = useState(rows);
  const [values, setValues] = useState<Record<FollowerPlatform, string>>(() => Object.fromEntries(FOLLOWER_PLATFORMS.map((platform) => [platform, textOf(rows.find((row) => row.platform === platform))])) as Record<FollowerPlatform, string>);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const changed = FOLLOWER_PLATFORMS.filter((platform) => values[platform].trim() !== textOf(saved.find((row) => row.platform === platform)));
  const invalid = FOLLOWER_PLATFORMS.filter((platform) => parseFollowerInput(values[platform]) === undefined);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!changed.length || invalid.length) return;
    setState("saving");
    try {
      const next = await save(celebrityId, changed.map((platform) => ({ platform, text: values[platform].trim() })));
      setSaved(next);
      setState("saved");
    } catch { setState("error"); }
  }
  return (
    <form className={styles.cmsForm} onSubmit={submit} aria-label={ko ? "플랫폼별 팔로워" : "Platform followers"}>
      <fieldset disabled={!canEdit || state === "saving"}>
        <legend>{ko ? "플랫폼별 팔로워" : "Platform followers"}</legend>
        {FOLLOWER_PLATFORMS.map((platform) => {
          const row = saved.find((item) => item.platform === platform);
          return (
            <label key={platform}>
              <span>{NAMES[platform][ko ? 0 : 1]}</span>
              <input
                inputMode="text" autoComplete="off" value={values[platform]} aria-invalid={invalid.includes(platform) || undefined}
                onChange={(event) => { setValues((current) => ({ ...current, [platform]: event.target.value })); setState("idle"); }}
              />
              <small className={localStyles.fieldHelp}>
                {row
                  ? `${ko ? "확인" : "Checked"} ${day(row.checkedAt)} · ${row.sourceKind === "collector" ? (ko ? "자동 수집" : "Collected") : (ko ? "직접 입력" : "Entered")}`
                  : ko ? "미확인" : "Unconfirmed"}
              </small>
            </label>
          );
        })}
      </fieldset>
      {state === "saved" && <p role="status" className={styles.cmsMessage}>{ko ? "팔로워 수를 저장했습니다." : "Follower counts saved."}</p>}
      {state === "error" && <p role="alert" className={styles.cmsMessage}>{ko ? "저장하지 못했습니다." : "Could not save."}</p>}
      {canEdit && (
        <div className={styles.formActions}>
          <FanAction type="submit" variant="secondary" leadingIcon={<Save aria-hidden="true" />} disabled={state === "saving" || !changed.length || invalid.length > 0}>
            {ko ? "팔로워 저장" : "Save followers"}
          </FanAction>
        </div>
      )}
    </form>
  );
}
