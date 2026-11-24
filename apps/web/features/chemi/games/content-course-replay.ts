import { ANDONG_COURSE } from "./content-course";
import { verifyRun, type RunInput } from "./run";

export type CourseRecording = { inputs: RunInput[]; ticks: number; score: number };

/** Validate the guest prefix before the server binds it to a continuation ticket. */
export function verifyGuestCheckpoint(recording: CourseRecording, elapsed: number) {
  if (recording.ticks !== ANDONG_COURSE.sections[1].endTick) throw Error("INVALID_RUN");
  const state = verifyRun(ANDONG_COURSE.seed, recording.ticks, recording.inputs, recording.score, elapsed, ANDONG_COURSE);
  if (state.done) throw Error("INVALID_RUN");
  return state;
}

/** Prefix comes from the issued ticket. Suffix uses absolute simulation ticks. */
export function verifyContinuedCourse(prefix: CourseRecording, suffix: CourseRecording, activeElapsed: number) {
  if (prefix.ticks !== ANDONG_COURSE.sections[1].endTick || suffix.ticks <= prefix.ticks ||
      suffix.inputs.some(([tick]) => tick <= prefix.ticks)) throw Error("INVALID_RUN");
  return verifyRun(ANDONG_COURSE.seed, suffix.ticks, [...prefix.inputs, ...suffix.inputs], suffix.score, activeElapsed, ANDONG_COURSE);
}
